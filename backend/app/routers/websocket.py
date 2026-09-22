import asyncio
import json
import logging
import os
from typing import Dict, List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import VIDEOS_DIR
from app.services.job_manager import job_manager
from app.services.connection_manager import manager
from app.services.surveillance_service import surveillance_service

logger = logging.getLogger("surveillance.routers.websocket")
router = APIRouter(tags=["WebSocket"])

@router.websocket("/ws/live/{camera_id}")
async def websocket_live_stream(websocket: WebSocket, camera_id: str):
    await manager.connect(websocket, camera_id)

    # Dynamically resolve real video for camera
    selected_video = surveillance_service.get_selected_video(camera_id)

    # Send immediate state on connect
    is_active = surveillance_service.is_running(camera_id)
    initial_packet = {
        "camera_id": camera_id,
        "video_filename": selected_video,
        "analysis_active": is_active,
        "job_status": job_manager.status if is_active else "IDLE",
        "frame_index": job_manager.processed_frames,
        "total_frames": job_manager.total_frames,
        "progress_percent": job_manager.to_dict().get("progress_percent", 0.0),
        "timestamp": asyncio.get_event_loop().time(),
        "live_intelligence": {
            "persons": 0,
            "vehicles": 0,
            "animals": 0,
            "active_tracks": 0
        },
        "threat_assessment": {
            "score": 0,
            "level": "SECURE",
            "description": "Sector monitoring active. Ready for analysis.",
            "key_factors": ["Optical feed calibrated", "Sector perimeter secure"]
        },
        "active_entities": [],
        "latest_event": None
    }
    try:
        await websocket.send_text(json.dumps(initial_packet))
    except Exception:
        pass

    # Command receiver queue
    command_queue = asyncio.Queue()

    async def client_reader():
        try:
            while True:
                msg_text = await websocket.receive_text()
                data = json.loads(msg_text)
                await command_queue.put(data)
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.debug(f"Reader ended for {camera_id}: {e}")

    reader_task = asyncio.create_task(client_reader())

    try:
        while True:
            # Process any incoming client commands with 0ms latency
            while not command_queue.empty():
                cmd = await command_queue.get()
                action = cmd.get("action")
                logger.info(f"WebSocket command received on {camera_id}: {action} | {cmd}")

                if action == "select_video":
                    new_vid = cmd.get("video")
                    if new_vid and os.path.exists(str(VIDEOS_DIR / new_vid)):
                        selected_video = new_vid
                        surveillance_service.select_video(camera_id, selected_video)

                elif action == "start_analysis":
                    if cmd.get("video"):
                        selected_video = cmd.get("video")
                    stride = cmd.get("frame_stride")
                    speed = cmd.get("speed_mode", "fast")
                    surveillance_service.start_session(
                        camera_id=camera_id,
                        video_filename=selected_video,
                        loop=False,
                        frame_stride=stride,
                        speed_mode=speed
                    )

                elif action == "stop_analysis":
                    surveillance_service.stop_session(camera_id)

                elif action == "pause":
                    surveillance_service.pause_session(camera_id)

                elif action == "resume":
                    surveillance_service.resume_session(camera_id)

                elif action == "completed":
                    surveillance_service.stop_session(camera_id)

            # If not running, send periodic heartbeat maintaining completed/stopped status
            if not surveillance_service.is_running(camera_id):
                current_job_status = job_manager.status if job_manager.status in ["COMPLETED", "STOPPED", "FAILED"] else "IDLE"
                idle_packet = {
                    "camera_id": camera_id,
                    "video_filename": surveillance_service.get_selected_video(camera_id),
                    "analysis_active": False,
                    "job_status": current_job_status,
                    "frame_index": job_manager.processed_frames,
                    "total_frames": job_manager.total_frames,
                    "progress_percent": job_manager.to_dict().get("progress_percent", 0.0),
                    "timestamp": asyncio.get_event_loop().time(),
                    "live_intelligence": {
                        "persons": 0 if current_job_status == "IDLE" else job_manager.to_dict().get("detections_count", 0),
                        "vehicles": 0,
                        "animals": 0,
                        "active_tracks": 0
                    },
                    "threat_assessment": {
                        "score": job_manager.current_threat_score if current_job_status == "COMPLETED" else 0,
                        "level": "SECURE" if current_job_status != "COMPLETED" or job_manager.current_threat_score == 0 else (
                            "CRITICAL" if job_manager.current_threat_score >= 75 else (
                                "HIGH RISK" if job_manager.current_threat_score >= 50 else (
                                    "MEDIUM RISK" if job_manager.current_threat_score >= 25 else "LOW RISK"
                                )
                            )
                        ),
                        "description": "Analysis complete. Results retained." if current_job_status == "COMPLETED" else "Sector monitoring active. Ready for analysis.",
                        "key_factors": ["Operational summary recorded"] if current_job_status == "COMPLETED" else ["Optical feed calibrated", "Sector perimeter secure"]
                    },
                    "active_entities": [],
                    "latest_event": None
                }
                try:
                    await websocket.send_text(json.dumps(idle_packet))
                except Exception:
                    break
                await asyncio.sleep(1.5)
            else:
                await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        manager.disconnect(websocket, camera_id)
    except Exception as e:
        logger.error(f"WebSocket error on {camera_id}: {e}", exc_info=True)
    finally:
        reader_task.cancel()
        manager.disconnect(websocket, camera_id)
