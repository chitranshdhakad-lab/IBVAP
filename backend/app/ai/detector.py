import os
import threading
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import cv2
import numpy as np

from app.config import MODELS_DIR

logger = logging.getLogger("surveillance.ai.detector")

PERSON_CLASSES = {"person"}
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle"}
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}
ALLOWED_SURVEILLANCE_CLASSES = PERSON_CLASSES | VEHICLE_CLASSES | ANIMAL_CLASSES

def categorize_class(class_name: str) -> str:
    c = class_name.lower()
    if c in PERSON_CLASSES:
        return "person"
    if c in VEHICLE_CLASSES:
        return "vehicle"
    if c in ANIMAL_CLASSES:
        return "animal"
    return "other"


# ==============================================================================
# Global Thread-Safe YOLOv8 Singleton Cache
# Ensures weights load exactly once across all pipelines, cameras, and loops
# ==============================================================================
_GLOBAL_YOLO_MODEL = None
_MODEL_LOCK = threading.Lock()
_GLOBAL_WEAPON_MODEL = None
_WEAPON_MODEL_LOCK = threading.Lock()

def get_yolo_model(model_name_or_path: Optional[str] = None):
    """
    Retrieves the global YOLOv8 model singleton.
    Loads neural network weights once from disk and caches in memory.
    """
    global _GLOBAL_YOLO_MODEL
    with _MODEL_LOCK:
        if _GLOBAL_YOLO_MODEL is None:
            from ultralytics import YOLO
            candidates = [
                MODELS_DIR / "yolov8n.pt",
                Path("backend/models/yolov8n.pt"),
                Path("models/yolov8n.pt"),
                Path("yolov8n.pt")
            ]
            if model_name_or_path:
                candidates.insert(0, Path(model_name_or_path))
                candidates.insert(1, MODELS_DIR / model_name_or_path)

            resolved_path = None
            for c in candidates:
                if c.exists() and c.stat().st_size > 1000000:
                    resolved_path = str(c.resolve())
                    break

            if resolved_path:
                logger.info(f"Loading YOLOv8 weights ONCE from {resolved_path}...")
                _GLOBAL_YOLO_MODEL = YOLO(resolved_path)
                logger.info(f"YOLOv8 model loaded successfully and cached. Classes: {len(_GLOBAL_YOLO_MODEL.names)}")
            else:
                logger.error(f"YOLOv8 weights file not found in {[str(p) for p in candidates]}")
                raise FileNotFoundError("yolov8n.pt model file not found.")

    return _GLOBAL_YOLO_MODEL


class FaceDetector:
    """
    Lazy-initialized Face Detector supporting YuNet and Haar Cascade.
    Only loads when facial detection is explicitly activated.
    """
    def __init__(self):
        self.yunet = None
        self.cascade = None
        self.current_size = (0, 0)
        self._frame_count = 0
        self._cached_faces: List[Dict[str, Any]] = []
        self._initialized = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        self._initialized = True
        # Try modern YuNet ONNX detector
        yunet_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        if yunet_path.exists() and hasattr(cv2, "FaceDetectorYN_create"):
            try:
                self.yunet = cv2.FaceDetectorYN_create(
                    str(yunet_path),
                    "",
                    (320, 320),
                    0.5,
                    0.3,
                    500
                )
                self.current_size = (320, 320)
                logger.info(f"YuNet Face Detector loaded from {yunet_path}")
                return
            except Exception as e:
                logger.warning(f"Could not load YuNet Face Detector: {e}")

        # Try Haar Cascade
        if hasattr(cv2, "CascadeClassifier"):
            try:
                cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                if os.path.exists(cascade_path):
                    self.cascade = cv2.CascadeClassifier(cascade_path)
                    logger.info(f"Haar Cascade face detector loaded from {cascade_path}")
                    return
            except Exception:
                pass

            model_path = MODELS_DIR / "haarcascade_frontalface_default.xml"
            if model_path.exists():
                try:
                    self.cascade = cv2.CascadeClassifier(str(model_path))
                    logger.info(f"Haar Cascade face detector loaded from {model_path}")
                    return
                except Exception as e:
                    logger.warning(f"Failed to load Haar Cascade from models dir: {e}")

    def detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Detect faces in frame with caching for CPU smoothness."""
        if frame is None or frame.size == 0:
            return []

        self._ensure_initialized()
        self._frame_count += 1
        if (self._frame_count % 4 != 1) and len(self._cached_faces) > 0:
            return self._cached_faces

        h, w = frame.shape[:2]

        if self.yunet is not None:
            try:
                if self.current_size != (w, h):
                    self.yunet.setInputSize((w, h))
                    self.current_size = (w, h)
                _, faces = self.yunet.detect(frame)
                results = []
                if faces is not None:
                    for face in faces:
                        fx, fy, fw, fh = face[0:4]
                        score = float(face[14]) if len(face) > 14 else 0.85
                        results.append({
                            "class": "face",
                            "category": "face",
                            "confidence": round(score, 2),
                            "bbox": (
                                max(0.0, float(fx) / w),
                                max(0.0, float(fy) / h),
                                min(1.0, float(fx + fw) / w),
                                min(1.0, float(fy + fh) / h)
                            )
                        })
                self._cached_faces = results
                return results
            except Exception as e:
                logger.error(f"YuNet detection error: {e}")
                return self._cached_faces

        if self.cascade is not None and hasattr(self.cascade, "empty") and not self.cascade.empty():
            try:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                gray = cv2.equalizeHist(gray)
                faces = self.cascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(30, 30),
                    flags=cv2.CASCADE_SCALE_IMAGE
                )
                results = []
                for (fx, fy, fw, fh) in faces:
                    results.append({
                        "class": "face",
                        "category": "face",
                        "confidence": 0.85,
                        "bbox": (
                            max(0.0, fx / w),
                            max(0.0, fy / h),
                            min(1.0, (fx + fw) / w),
                            min(1.0, (fx + fh) / h)
                        )
                    })
                self._cached_faces = results
                return results
            except Exception as e:
                logger.error(f"Haar Cascade detection error: {e}")
                return self._cached_faces

        return []


try:
    import torch
    # Optimize PyTorch CPU parallelism
    torch.set_num_threads(max(2, min(4, (os.cpu_count() or 4))))
except Exception:
    pass


class ObjectDetector:
    """
    High-Precision YOLOv8 Object Detection Engine for Surveillance.
    Guarantees genuine model inference using preloaded neural weights.
    Strictly filters for real person, vehicle, and animal detections.
    """
    def __init__(self, confidence_threshold: float = 0.25, imgsz: int = 512):
        self.confidence_threshold = confidence_threshold
        self.imgsz = imgsz
        self.model = None
        self.model_type = "YOLOv8"
        self._init_model()

    def _init_model(self):
        try:
            self.model = get_yolo_model()
            self.model_type = "YOLOv8"
        except Exception as e:
            logger.error(f"Critical error loading YOLOv8 model: {e}")
            raise RuntimeError(f"YOLOv8 detector initialization failed: {e}")

    def detect(self, frame: np.ndarray, allowed_classes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Runs pure YOLOv8 inference on input frame.
        Returns genuine detections with inference confidence scores and normalized bounding boxes.
        """
        if frame is None or frame.size == 0 or self.model is None:
            return []

        h, w = frame.shape[:2]
        if w <= 0 or h <= 0:
            return []

        target_classes = set(allowed_classes) if allowed_classes is not None else ALLOWED_SURVEILLANCE_CLASSES
        detections: List[Dict[str, Any]] = []

        try:
            import torch
            with torch.inference_mode():
                results = self.model(
                    frame,
                    conf=self.confidence_threshold,
                    imgsz=self.imgsz,
                    verbose=False
                )

            for r in results:
                if r.boxes is None or len(r.boxes) == 0:
                    continue
                for box in r.boxes:
                    cls_id = int(box.cls[0].item())
                    raw_cls_name = self.model.names[cls_id].lower()
                    conf = float(box.conf[0].item())

                    # Strict filter: only real person, vehicle, or animal classes
                    if raw_cls_name not in ALLOWED_SURVEILLANCE_CLASSES:
                        continue
                    if target_classes is not None and raw_cls_name not in target_classes:
                        continue

                    # Bounding box extraction with strict clamping to frame dimensions
                    xyxy = box.xyxy[0].cpu().numpy()
                    px1 = max(0, min(w - 1, int(round(xyxy[0]))))
                    py1 = max(0, min(h - 1, int(round(xyxy[1]))))
                    px2 = max(px1 + 1, min(w, int(round(xyxy[2]))))
                    py2 = max(py1 + 1, min(h, int(round(xyxy[3]))))

                    x1 = max(0.0, min(1.0, float(px1 / w)))
                    y1 = max(0.0, min(1.0, float(py1 / h)))
                    x2 = max(x1, min(1.0, float(px2 / w)))
                    y2 = max(y1, min(1.0, float(py2 / h)))

                    category = categorize_class(raw_cls_name)
                    display_name = "vehicle" if raw_cls_name in ["car", "truck", "bus", "motorcycle"] else raw_cls_name

                    detections.append({
                        "class": display_name,
                        "raw_class": raw_cls_name,
                        "category": category,
                        "confidence": round(conf, 3),
                        "bbox": (x1, y1, x2, y2),
                        "pixel_bbox": (px1, py1, px2, py2)
                    })

            return detections
        except Exception as e:
            logger.error(f"YOLOv8 inference exception: {e}", exc_info=True)
            return []

    def track(self, frame: np.ndarray, persist: bool = True, allowed_classes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Runs Ultralytics native ByteTrack on frame with model inference.
        Returns tracked objects with native tracking IDs or None (for upstream tracking).
        """
        if frame is None or frame.size == 0 or self.model is None:
            return []

        h, w = frame.shape[:2]
        if w <= 0 or h <= 0:
            return []

        target_classes = set(allowed_classes) if allowed_classes is not None else ALLOWED_SURVEILLANCE_CLASSES
        tracked_objects: List[Dict[str, Any]] = []

        try:
            import torch
            with torch.inference_mode():
                results = self.model.track(
                    frame,
                    persist=persist,
                    tracker="bytetrack.yaml",
                    conf=self.confidence_threshold,
                    imgsz=self.imgsz,
                    verbose=False
                )

            if results and len(results) > 0 and results[0].boxes is not None:
                for box in results[0].boxes:
                    cls_id = int(box.cls[0].item())
                    raw_cls_name = self.model.names[cls_id].lower()
                    conf = float(box.conf[0].item())

                    # Strict filter: only real person, vehicle, or animal classes
                    if raw_cls_name not in ALLOWED_SURVEILLANCE_CLASSES:
                        continue
                    if target_classes is not None and raw_cls_name not in target_classes:
                        continue

                    # Native ByteTrack ID if assigned, else None (NEVER hardcode ID 1)
                    track_id = int(box.id[0].item()) if (box.id is not None and len(box.id) > 0) else None

                    xyxy = box.xyxy[0].cpu().numpy()
                    px1 = max(0, min(w - 1, int(round(xyxy[0]))))
                    py1 = max(0, min(h - 1, int(round(xyxy[1]))))
                    px2 = max(px1 + 1, min(w, int(round(xyxy[2]))))
                    py2 = max(py1 + 1, min(h, int(round(xyxy[3]))))

                    x1 = max(0.0, min(1.0, float(px1 / w)))
                    y1 = max(0.0, min(1.0, float(py1 / h)))
                    x2 = max(x1, min(1.0, float(px2 / w)))
                    y2 = max(y1, min(1.0, float(py2 / h)))

                    category = categorize_class(raw_cls_name)
                    display_name = "vehicle" if raw_cls_name in ["car", "truck", "bus", "motorcycle"] else raw_cls_name

                    tracked_objects.append({
                        "tracking_id": track_id,
                        "class": display_name,
                        "raw_class": raw_cls_name,
                        "category": category,
                        "confidence": round(conf, 3),
                        "bbox": (x1, y1, x2, y2),
                        "pixel_bbox": (px1, py1, px2, py2)
                    })

            return tracked_objects
        except Exception as e:
            logger.warning(f"ByteTrack tracking exception: {e}. Falling back to standard YOLO detect.")
            return self.detect(frame, allowed_classes)


class WeaponDetector:
    """Optional Open Images detector for weapon classes absent from COCO weights."""
    WEAPON_TERMS = ("gun", "handgun", "rifle", "shotgun", "pistol", "knife", "weapon")

    def __init__(self, confidence_threshold: float = 0.30, imgsz: int = 512):
        self.confidence_threshold = confidence_threshold
        self.imgsz = imgsz
        self.model = self._load_model()

    @staticmethod
    def _load_model():
        global _GLOBAL_WEAPON_MODEL
        with _WEAPON_MODEL_LOCK:
            if _GLOBAL_WEAPON_MODEL is None:
                model_path = MODELS_DIR / "yolov8n-oiv7.pt"
                if not model_path.exists() or model_path.stat().st_size < 1_000_000:
                    raise FileNotFoundError("Weapon-capable Open Images model is missing: yolov8n-oiv7.pt")
                from ultralytics import YOLO
                logger.info("Loading Open Images weapon detector once from %s", model_path)
                _GLOBAL_WEAPON_MODEL = YOLO(str(model_path))
        return _GLOBAL_WEAPON_MODEL

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        if frame is None or frame.size == 0:
            return []
        h, w = frame.shape[:2]
        detections = []
        try:
            import torch
            with torch.inference_mode():
                results = self.model(frame, conf=self.confidence_threshold, imgsz=self.imgsz, verbose=False)
            for result in results:
                if result.boxes is None:
                    continue
                for box in result.boxes:
                    class_name = str(self.model.names[int(box.cls[0].item())]).lower()
                    if not any(term in class_name for term in self.WEAPON_TERMS):
                        continue
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    x1, x2 = max(0, min(w - 1, int(x1))), max(1, min(w, int(x2)))
                    y1, y2 = max(0, min(h - 1, int(y1))), max(1, min(h, int(y2)))
                    if x2 <= x1 or y2 <= y1:
                        continue
                    detections.append({"class": class_name, "raw_class": class_name, "category": "weapon",
                        "confidence": round(float(box.conf[0].item()), 3),
                        "bbox": (x1 / w, y1 / h, x2 / w, y2 / h), "pixel_bbox": (x1, y1, x2, y2)})
        except Exception as exc:
            logger.warning("Weapon inference failed: %s", exc)
        return detections
