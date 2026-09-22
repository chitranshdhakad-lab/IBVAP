import os
import shutil
import cv2
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.config import VIDEOS_DIR, PROJECT_ROOT
from app.database import get_db
from app.models import Video
from app.schemas import VideoOut
from app.services.job_manager import job_manager

router = APIRouter(prefix="/videos", tags=["Videos"])

# Global state for active analysis tasks
active_analysis_tasks = {}

def get_video_metadata(filepath: str):
    cap = cv2.VideoCapture(filepath)
    if not cap.isOpened():
        return 0.0, "0x0", 0.0, 0
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    # If OpenCV failed to read frame count from header, count accurately by grabbing
    if total_frames <= 0 and fps > 0:
        cnt = 0
        while cap.grab():
            cnt += 1
        total_frames = cnt

    if fps <= 0.0:
        fps = 25.0
    duration = round(total_frames / max(1.0, fps), 2)
    cap.release()
    return duration, f"{width}x{height}", round(fps, 2), total_frames

def format_file_size(filepath: str) -> str:
    try:
        size_b = os.path.getsize(filepath)
        if size_b >= 1024 * 1024 * 1024:
            return f"{round(size_b / (1024**3), 2)} GB"
        if size_b >= 1024 * 1024:
            return f"{round(size_b / (1024**2), 1)} MB"
        return f"{round(size_b / 1024, 1)} KB"
    except Exception:
        return "0 KB"

@router.get("", response_model=List[dict])
def list_videos(query: Optional[str] = None, db: Session = Depends(get_db)):
    # Scan videos directory and sync with DB
    files = [f for f in os.listdir(VIDEOS_DIR) if f.lower().endswith(('.mp4', '.avi', '.mov', '.mkv'))]

    for f in files:
        existing = db.query(Video).filter(Video.filename == f).first()
        file_path = str(VIDEOS_DIR / f)
        if not existing:
            dur, res, fps, frames = get_video_metadata(file_path)
            new_v = Video(
                filename=f,
                filepath=file_path,
                duration=dur,
                resolution=res,
                fps=fps,
                camera_id="CAM-01" if "01" in f or "03" in f or "Border" in f else "CAM-02",
                processing_status="IDLE",
                total_frames=frames
            )
            db.add(new_v)
            db.commit()
        elif existing.total_frames <= 0 or existing.duration <= 0.0:
            dur, res, fps, frames = get_video_metadata(file_path)
            existing.duration = dur
            existing.resolution = res
            existing.fps = fps
            existing.total_frames = frames
            db.commit()

    q = db.query(Video)
    if query:
        q = q.filter(Video.filename.ilike(f"%{query}%"))
    all_vids = q.order_by(Video.id.desc()).all()
    results = []
    for v in all_vids:
        is_analyzing = active_analysis_tasks.get(v.id, False) or active_analysis_tasks.get(v.filename, False)
        status = "RUNNING" if is_analyzing else v.processing_status
        fsize = format_file_size(v.filepath)
        upload_date_str = v.created_at.strftime("%d %b %Y, %H:%M") if v.created_at else "Surveillance Pack"
        results.append({
            "id": v.id,
            "filename": v.filename,
            "duration": v.duration,
            "resolution": v.resolution,
            "fps": v.fps,
            "file_size": fsize,
            "upload_date": upload_date_str,
            "camera_id": v.camera_id or "CAM-01",
            "processing_status": status,
            "url": f"/videos/{v.filename}"
        })
    return results

@router.delete("/{video_id}")
def delete_video(video_id: str, db: Session = Depends(get_db)):
    import gc
    import time
    from pathlib import Path
    from app.services.surveillance_service import surveillance_service
    from app.models import Detection, Track, Snapshot, SecurityEvent, AnalysisJob

    if video_id.isdigit():
        video = db.query(Video).filter(Video.id == int(video_id)).first()
    else:
        video = db.query(Video).filter(Video.filename == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video record not found")
    
    filename = video.filename
    vid_id = video.id

    # 1. Stop surveillance session for any camera running this video
    for cam_id in list(surveillance_service._selected_videos.keys()):
        if surveillance_service._selected_videos.get(cam_id) == filename:
            surveillance_service.stop_session(cam_id)
    active_analysis_tasks.pop(vid_id, None)
    active_analysis_tasks.pop(filename, None)
    active_analysis_tasks.pop(str(vid_id), None)

    # 2. Collect Python garbage to release open cv2.VideoCapture handles on Windows
    gc.collect()
    time.sleep(0.08)

    # 3. Clean up child records pointing to this video in the database
    try:
        db.query(Detection).filter(Detection.video_id == vid_id).delete(synchronize_session=False)
        db.query(Track).filter(Track.video_id == vid_id).delete(synchronize_session=False)
        db.query(Snapshot).filter(Snapshot.video_id == vid_id).update({Snapshot.video_id: None}, synchronize_session=False)
        db.query(SecurityEvent).filter(SecurityEvent.video_id == vid_id).update({SecurityEvent.video_id: None}, synchronize_session=False)
        db.query(AnalysisJob).filter(AnalysisJob.video_id == vid_id).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()

    # 4. Physically delete file from storage/videos and public/videos with retries
    def safe_unlink(p: Path) -> bool:
        if not p.exists():
            return True
        for attempt in range(5):
            try:
                os.remove(str(p))
                return True
            except PermissionError:
                gc.collect()
                time.sleep(0.1 * (attempt + 1))
            except Exception:
                break
        return not p.exists()

    primary_path = VIDEOS_DIR / filename
    public_path = PROJECT_ROOT / "public" / "videos" / filename

    primary_ok = safe_unlink(primary_path)
    safe_unlink(public_path)

    # 5. Remove video row from DB
    try:
        db.delete(video)
        db.commit()
    except Exception as del_err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database record removal failed: {del_err}")

    if not primary_ok and primary_path.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Video removed from DB, but Windows file lock prevented physical removal of {filename}. Please close external media players or try again."
        )

    return {"status": "DELETED", "filename": filename, "message": f"Video {filename} permanently deleted from disk and database."}

@router.post("/upload")
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_path = VIDEOS_DIR / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Also copy to frontend public/videos for direct HTML5 video playback
    public_videos_dir = PROJECT_ROOT / "public" / "videos"
    public_videos_dir.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(str(file_path), str(public_videos_dir / file.filename))
    except Exception:
        pass

    dur, res, fps, frames = get_video_metadata(str(file_path))

    existing = db.query(Video).filter(Video.filename == file.filename).first()
    if existing:
        existing.duration = dur
        existing.resolution = res
        existing.fps = fps
        existing.total_frames = frames
        existing.filepath = str(file_path)
        existing.processing_status = "IDLE"
        db.commit()
        db.refresh(existing)
        target_video = existing
    else:
        target_video = Video(
            filename=file.filename,
            filepath=str(file_path),
            duration=dur,
            resolution=res,
            fps=fps,
            camera_id="CAM-01",
            processing_status="IDLE",
            total_frames=frames
        )
        db.add(target_video)
        db.commit()
        db.refresh(target_video)

    # Initialize job state for the newly registered video
    job_manager.active_video_id = str(target_video.id)
    job_manager.active_video_filename = target_video.filename
    job_manager.status = "READY"
    job_manager.total_frames = frames
    job_manager.fps = fps

    return {
        "id": target_video.id,
        "filename": target_video.filename,
        "duration": target_video.duration,
        "resolution": target_video.resolution,
        "fps": target_video.fps,
        "total_frames": frames,
        "camera_id": target_video.camera_id,
        "processing_status": "READY",
        "job_status": "READY",
        "url": f"/videos/{target_video.filename}"
    }

@router.get("/{video_id}")
def get_video_by_id(video_id: str, db: Session = Depends(get_db)):
    if video_id.isdigit():
        video = db.query(Video).filter(Video.id == int(video_id)).first()
    else:
        video = db.query(Video).filter(Video.filename == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    is_analyzing = active_analysis_tasks.get(video.id, False) or active_analysis_tasks.get(video.filename, False)
    return {
        "id": video.id,
        "filename": video.filename,
        "duration": video.duration,
        "resolution": video.resolution,
        "fps": video.fps,
        "camera_id": video.camera_id or "CAM-01",
        "processing_status": "RUNNING" if is_analyzing else video.processing_status,
        "url": f"/videos/{video.filename}"
    }

@router.post("/{video_id}/analyze")
async def start_analysis(video_id: str, db: Session = Depends(get_db)):
    from app.services.surveillance_service import surveillance_service
    # Support both numeric id and filename
    if video_id.isdigit():
        video = db.query(Video).filter(Video.id == int(video_id)).first()
    else:
        video = db.query(Video).filter(Video.filename == video_id).first()

    if not video:
        raise HTTPException(status_code=404, detail="Video record not found")

    cam_id = video.camera_id or "CAM-01"
    surveillance_service.start_session(
        camera_id=cam_id,
        video_filename=video.filename,
        loop=False,
        frame_stride=None
    )

    active_analysis_tasks[video.id] = True
    active_analysis_tasks[video.filename] = True

    return {
        "status": "RUNNING",
        "message": f"YOLOv8 & Tracking pipeline started on {video.filename}",
        "video_id": video.id,
        "filename": video.filename,
        "camera_id": cam_id
    }

@router.post("/{video_id}/stop")
async def stop_analysis(video_id: str, db: Session = Depends(get_db)):
    from app.services.surveillance_service import surveillance_service
    if video_id.isdigit():
        v_id = int(video_id)
        video = db.query(Video).filter(Video.id == v_id).first()
    else:
        video = db.query(Video).filter(Video.filename == video_id).first()
        v_id = video.id if video else 1

    cam_id = video.camera_id if video and video.camera_id else "CAM-01"
    surveillance_service.stop_session(cam_id)
    active_analysis_tasks.clear()

    return {"status": "STOPPED", "message": "Analysis stopped"}

