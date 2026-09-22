import asyncio
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Video
from app.services.job_manager import job_manager
from app.routers.videos import active_analysis_tasks
from app.ai.pipeline import get_latest_stream_frame
from app.services.surveillance_service import surveillance_service
from app.config import VIDEOS_DIR
import cv2

router = APIRouter(prefix="/analysis", tags=["Analysis"])

class StartAnalysisRequest(BaseModel):
    video: Optional[str] = None
    video_filename: Optional[str] = None
    camera_id: Optional[str] = "CAM-01"
    speed_mode: Optional[str] = "fast" # "realtime", "fast", "max"
    frame_stride: Optional[int] = None

@router.get("/status")
def get_analysis_status():
    """Returns current analysis job state."""
    return job_manager.to_dict()

@router.get("/jobs")
def list_analysis_jobs(
    limit: int = 20,
    camera_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Returns persistent analysis job history from the database."""
    from app.models import AnalysisJob
    q = db.query(AnalysisJob)
    if camera_id:
        q = q.filter(AnalysisJob.camera_id == camera_id)
    if status:
        q = q.filter(AnalysisJob.status == status.upper())
    jobs = q.order_by(AnalysisJob.id.desc()).limit(limit).all()
    return [
        {
            "id": j.id,
            "video_id": j.video_id,
            "video_filename": j.video_filename,
            "camera_id": j.camera_id,
            "status": j.status,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            "processed_frames": j.processed_frames,
            "total_frames": j.total_frames,
            "error_message": j.error_message
        }
        for j in jobs
    ]

@router.post("/start")
async def start_analysis_job(req: StartAnalysisRequest, db: Session = Depends(get_db)):
    """Starts a new continuous analysis job."""
    cam_id = req.camera_id or "CAM-01"
    selected_video = req.video or req.video_filename or surveillance_service.get_selected_video(cam_id)
    speed_mode = req.speed_mode or "fast"

    surveillance_service.start_session(
        camera_id=cam_id,
        video_filename=selected_video,
        loop=False,
        frame_stride=req.frame_stride,
        speed_mode=speed_mode
    )

    active_analysis_tasks[selected_video] = True
    active_analysis_tasks[cam_id] = True

    return {
        "status": "RUNNING",
        "message": f"YOLOv8 and tracking pipeline initiated for {selected_video}",
        "job": job_manager.to_dict()
    }

class StopAnalysisRequest(BaseModel):
    camera_id: Optional[str] = None
    video: Optional[str] = None
    video_filename: Optional[str] = None

@router.post("/stop")
@router.post("/{job_id}/stop")
async def stop_analysis_job(
    job_id: Optional[str] = None,
    req: Optional[StopAnalysisRequest] = None,
    db: Session = Depends(get_db)
):
    """Stops the active analysis job and updates video status."""
    cam_id = (req.camera_id if req and req.camera_id else None) or job_manager.camera_id or "CAM-01"

    surveillance_service.stop_session(cam_id)
    # Halt all active camera worker tasks to ensure complete shutdown
    for cid in list(surveillance_service._tasks.keys()):
        surveillance_service.stop_session(cid)
    active_analysis_tasks.clear()

    return {
        "status": "STOPPED",
        "message": "Analysis pipeline halted by operator."
    }

async def mjpeg_frame_generator(camera_id: str, video_filename: Optional[str] = None):
    """
    Yields JPEG frames buffered directly from the live OpenCV + YOLOv8 + ByteTrack pipeline.
    Uses exact Content-Length headers and frame deduplication to eliminate browser blinking/flashing.
    Does NOT auto-start an unrequested analysis job when stopped.
    """
    last_frame_bytes = None
    try:
        while True:
            is_active = surveillance_service.is_running(camera_id)
            frame_bytes = get_latest_stream_frame(camera_id)
            if frame_bytes and frame_bytes != last_frame_bytes:
                last_frame_bytes = frame_bytes
                content_length = len(frame_bytes)
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(content_length).encode("ascii") + b"\r\n\r\n"
                    + frame_bytes + b"\r\n"
                )
            if not is_active:
                # Standby check rate when analysis is stopped
                await asyncio.sleep(0.3)
            else:
                await asyncio.sleep(0.016)  # ~60 Hz poll to immediately stream when new frame is ready
    except (asyncio.CancelledError, GeneratorExit):
        pass
    except Exception:
        pass

@router.get("/stream/{camera_id}")
async def stream_analysis_video(camera_id: str, video: Optional[str] = None):
    """
    MJPEG stream providing real-time annotated OpenCV/YOLOv8/ByteTrack frames.
    """
    if video:
        surveillance_service.select_video(camera_id, video)
    return StreamingResponse(
        mjpeg_frame_generator(camera_id, video_filename=video),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive"
        }
    )

