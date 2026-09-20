import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger("surveillance.services.connection_manager")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, camera_id: str):
        await websocket.accept()
        if camera_id not in self.active_connections:
            self.active_connections[camera_id] = []
        self.active_connections[camera_id].append(websocket)
        logger.info(f"WebSocket client connected to {camera_id}.")

    def disconnect(self, websocket: WebSocket, camera_id: str):
        if camera_id in self.active_connections:
            if websocket in self.active_connections[camera_id]:
                self.active_connections[camera_id].remove(websocket)
                logger.info(f"WebSocket client disconnected from {camera_id}.")

    async def broadcast_to_camera(self, camera_id: str, message: str):
        if camera_id in self.active_connections:
            dead_connections = []
            for ws in list(self.active_connections[camera_id]):
                try:
                    await ws.send_text(message)
                except Exception:
                    dead_connections.append(ws)
            for dead in dead_connections:
                self.disconnect(dead, camera_id)

manager = ConnectionManager()
