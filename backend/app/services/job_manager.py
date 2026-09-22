import time
import threading
from typing import Dict, Any, Optional

class SurveillanceJobManager:
    """
    Centralized, thread-safe analysis job manager for IBVAP.
    Maintains unified state across REST API, WebSocket streams, and background workers.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.status = "IDLE"  # IDLE, QUEUED, PROCESSING, RUNNING, PAUSED, COMPLETED, STOPPED, FAILED
        self.active_video_id: Optional[str] = None
        self.active_video_filename: Optional[str] = None
        self.camera_id: str = "CAM-01"
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.processed_frames: int = 0
        self.total_frames: int = 0
        self.fps: float = 25.0
        self.detections_count: int = 0
        self.events_count: int = 0
        self.current_threat_score: int = 0
        self.stop_requested: bool = False
        self.pause_requested: bool = False
        self.error_message: Optional[str] = None

    def _persist_to_db(self, status: str, error_msg: Optional[str] = None):
        try:
            from app.database import SessionLocal
            from app.models import AnalysisJob
            import datetime
            db = SessionLocal()
            try:
                job = db.query(AnalysisJob).filter(
                    AnalysisJob.video_filename == self.active_video_filename,
                    AnalysisJob.status == "RUNNING"
                ).first()
                if not job:
                    job = AnalysisJob(
                        video_id=int(self.active_video_id) if self.active_video_id and str(self.active_video_id).isdigit() else None,
                        video_filename=self.active_video_filename or "Unknown",
                        camera_id=self.camera_id,
                        status=status,
                        started_at=datetime.datetime.utcnow(),
                        processed_frames=self.processed_frames,
                        total_frames=self.total_frames,
                        error_message=error_msg
                    )
                    db.add(job)
                else:
                    job.status = status
                    job.processed_frames = self.processed_frames
                    job.total_frames = self.total_frames
                    if status in ["COMPLETED", "FAILED", "STOPPED"]:
                        job.completed_at = datetime.datetime.utcnow()
                    if error_msg:
                        job.error_message = error_msg
                db.commit()
            finally:
                db.close()
        except Exception:
            pass

    def start_job(
        self,
        video_filename: str,
        camera_id: str = "CAM-01",
        video_id: Optional[str] = None,
        total_frames: int = 0,
        fps: float = 25.0
    ):
        with self._lock:
            self.status = "RUNNING"
            self.active_video_filename = video_filename
            self.active_video_id = video_id or "1"
            self.camera_id = camera_id
            self.start_time = time.time()
            self.end_time = None
            self.processed_frames = 0
            self.total_frames = total_frames
            self.fps = fps
            self.detections_count = 0
            self.events_count = 0
            self.current_threat_score = 0
            self.stop_requested = False
            self.pause_requested = False
            self.error_message = None
        self._persist_to_db("RUNNING")

    def update_progress(
        self,
        processed_frames: int,
        detections_increment: int = 0,
        events_increment: int = 0,
        threat_score: Optional[int] = None
    ):
        with self._lock:
            self.processed_frames = processed_frames
            self.detections_count += detections_increment
            self.events_count += events_increment
            if threat_score is not None:
                self.current_threat_score = threat_score
        
        # Persist frame count progress to DB every 30 frames
        if processed_frames % 30 == 0:
            self._persist_to_db(self.status)

    def pause_job(self):
        with self._lock:
            if self.status == "RUNNING":
                self.status = "PAUSED"
                self.pause_requested = True
        self._persist_to_db("PAUSED")

    def resume_job(self):
        with self._lock:
            if self.status == "PAUSED":
                self.status = "RUNNING"
                self.pause_requested = False
        self._persist_to_db("RUNNING")

    def complete_job(self):
        with self._lock:
            self.status = "COMPLETED"
            self.end_time = time.time()
            self.stop_requested = False
            self.pause_requested = False
        self._persist_to_db("COMPLETED")

    def stop_job(self):
        with self._lock:
            self.status = "STOPPED"
            self.end_time = time.time()
            self.stop_requested = True
            self.pause_requested = False
        self._persist_to_db("STOPPED")

    def fail_job(self, error_message: str):
        with self._lock:
            self.status = "FAILED"
            self.end_time = time.time()
            self.error_message = error_message
            self.stop_requested = False
            self.pause_requested = False
        self._persist_to_db("FAILED", error_message)

    def reset(self):
        with self._lock:
            self.status = "IDLE"
            self.active_video_id = None
            self.active_video_filename = None
            self.start_time = None
            self.end_time = None
            self.processed_frames = 0
            self.total_frames = 0
            self.detections_count = 0
            self.events_count = 0
            self.current_threat_score = 0
            self.stop_requested = False
            self.pause_requested = False
            self.error_message = None

    def to_dict(self) -> Dict[str, Any]:
        with self._lock:
            if self.start_time:
                if self.end_time:
                    elapsed = round(self.end_time - self.start_time, 1)
                else:
                    elapsed = round(time.time() - self.start_time, 1)
            else:
                elapsed = 0.0

            progress = 0.0
            if self.total_frames > 0:
                progress = round((self.processed_frames / self.total_frames) * 100, 1)

            return {
                "status": self.status,
                "video_id": self.active_video_id,
                "video_filename": self.active_video_filename,
                "camera_id": self.camera_id,
                "elapsed_seconds": elapsed,
                "processed_frames": self.processed_frames,
                "total_frames": self.total_frames,
                "progress_percent": progress,
                "fps": self.fps,
                "detections_count": self.detections_count,
                "events_count": self.events_count,
                "current_threat_score": self.current_threat_score,
                "is_active": self.status in ["RUNNING", "PROCESSING"],
                "error_message": self.error_message
            }

job_manager = SurveillanceJobManager()
