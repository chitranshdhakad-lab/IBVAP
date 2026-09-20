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

@router.post("/start")
async def start_analysis_job(req: StartAnalysisRequest, db: Session = Depends(get_db)):
    """Starts a new continuous analysis job."""
    selected_video = req.video or req.video_filename or "Border_Test_03.mp4"
    cam_id = req.camera_id or "CAM-01"
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

@router.post("/stop")
@router.post("/{job_id}/stop")
async def stop_analysis_job(job_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Stops the active analysis job and updates video status."""
    cam_id = job_manager.camera_id or "CAM-01"

    surveillance_service.stop_session(cam_id)
    active_analysis_tasks.clear()

    return {
        "status": "STOPPED",
        "message": "Analysis pipeline halted by operator."
    }

async def mjpeg_frame_generator(camera_id: str, video_filename: Optional[str] = None):
    """
    Yields JPEG frames buffered directly from the live OpenCV + YOLOv8 + ByteTrack pipeline.
    """
    # Auto-start analysis session if not yet active
    if not surveillance_service.is_running(camera_id):
        target_video = video_filename or surveillance_service.get_selected_video(camera_id)
        surveillance_service.start_session(camera_id, target_video, loop=False, frame_stride=2)
        await asyncio.sleep(0.3)

    try:
        while True:
            frame_bytes = get_latest_stream_frame(camera_id)
            if frame_bytes:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
                )
            await asyncio.sleep(0.035)  # ~28 fps
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
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

