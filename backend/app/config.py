import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
MODELS_DIR = BACKEND_DIR / "models"
STORAGE_DIR = BACKEND_DIR / "storage"
VIDEOS_DIR = STORAGE_DIR / "videos"
EVIDENCE_DIR = STORAGE_DIR / "evidence"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

class Settings:
    PROJECT_NAME: str = "IBVAP - Intelligent Border Video Analysis Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = f"sqlite:///{STORAGE_DIR / 'surveillance.db'}"
    CORS_ORIGINS: list = ["*"]
    YOLO_CONFIDENCE_THRESHOLD: float = 0.22
    DEFAULT_DEBOUNCE_SECONDS: float = 3.0
    LOITERING_THRESHOLD_SECONDS: float = 4.0

settings = Settings()
