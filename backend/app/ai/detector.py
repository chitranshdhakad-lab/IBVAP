import os
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import cv2
import numpy as np

from app.config import MODELS_DIR

logger = logging.getLogger("surveillance.ai.detector")

PERSON_CLASSES = {"person"}
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck", "bicycle", "vehicle"}
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"}

# Weapon classes from reference project (keshav-077/AI-Driven-Border-Security)
# These match their YOLOv8 weapon detection training categories
WEAPON_CLASSES = {"knife", "pistol", "rifle", "gun", "sword", "weapon", "handgun", "firearm"}

ALL_SUPPORTED_CLASSES = PERSON_CLASSES | VEHICLE_CLASSES | ANIMAL_CLASSES | WEAPON_CLASSES | {"motion"}

def categorize_class(class_name: str) -> str:
    c = class_name.lower()
    if c in PERSON_CLASSES:
        return "person"
    if c in VEHICLE_CLASSES:
        return "vehicle"
    if c in ANIMAL_CLASSES:
        return "animal"
    if c in WEAPON_CLASSES:
        return "weapon"
    if c in {"motion", "movement"}:
        return "motion"
    return "other"


class FaceDetector:
    """
    Face Detector supporting both OpenCV YuNet (FaceDetectorYN) and Haar Cascade (CascadeClassifier).
    Provides real-time facial detection and overlays on surveillance feeds.
    """
    def __init__(self):
        self.yunet = None
        self.cascade = None
        self.current_size = (0, 0)
        self._frame_count = 0
        self._cached_faces: List[Dict[str, Any]] = []
        self._init_detector()

    def _init_detector(self):
        # 1. Try modern YuNet ONNX detector (OpenCV 5+ / dnn)
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

        # 2. Try Haar Cascade (OpenCV 4.x or custom build)
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

        logger.warning("No face detection backend available. Face detection disabled.")

    def detect_faces(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """Detect faces in frame with 4-frame caching for CPU smoothness."""
        if frame is None or frame.size == 0:
            return []

        self._frame_count += 1
        # Throttle heavy neural face inference: compute every 4 frames, return cache on intermediate frames
        if (self._frame_count % 4 != 1) and len(self._cached_faces) > 0:
            return self._cached_faces

        h, w = frame.shape[:2]

        # 1. YuNet inference
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

        # 2. Haar Cascade inference
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
                            min(1.0, (fy + fh) / h)
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
    # Optimize PyTorch CPU intra-op parallelism
    torch.set_num_threads(max(2, min(4, (os.cpu_count() or 4))))
except Exception:
    pass

class ObjectDetector:
    """
    Tactical Object Detection Engine for Border Surveillance.
    Uses YOLOv8n when available with fallback to OpenCV background subtraction.
    """
    def __init__(self, confidence_threshold: float = 0.35, imgsz: int = 320):
        self.confidence_threshold = confidence_threshold
        self.imgsz = imgsz
        self.model = None
        self.model_type = "OPENCV_TACTICAL"
        self._init_model()

    def _init_model(self):
        try:
            from ultralytics import YOLO
            candidates = [
                MODELS_DIR / "yolov8n.pt",
                Path("yolov8n.pt"),
                Path("backend/models/yolov8n.pt")
            ]
            model_path = None
            for c in candidates:
                if c.exists() and c.stat().st_size > 1000000:
                    model_path = str(c)
                    break

            if model_path:
                self.model = YOLO(model_path)
                self.model_type = "YOLOv8"
                logger.info(f"Loaded YOLOv8 detector from {model_path} (imgsz={self.imgsz})")
            else:
                logger.warning("YOLOv8 model file not found. Falling back to OpenCV detector.")
                self._init_opencv_fallback()
        except Exception as e:
            logger.warning(f"Error loading YOLO: {e}. Falling back to OpenCV detector.")
            self._init_opencv_fallback()

    def _init_opencv_fallback(self):
        self.model_type = "OPENCV_TACTICAL"
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=16, detectShadow=True)

    def detect(self, frame: np.ndarray, allowed_classes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        target_classes = set(allowed_classes) if allowed_classes is not None else ALL_SUPPORTED_CLASSES
        h, w = frame.shape[:2]
        detections: List[Dict[str, Any]] = []

        if self.model_type == "YOLOv8" and self.model is not None:
            try:
                import torch
                with torch.inference_mode():
                    results = self.model(frame, conf=self.confidence_threshold, imgsz=self.imgsz, verbose=False)
                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        raw_cls_name = self.model.names[cls_id].lower()
                        conf = float(box.conf[0].item())

                        if target_classes is not None and raw_cls_name not in target_classes:
                            continue

                        xyxy = box.xyxy[0].cpu().numpy()
                        x1 = max(0.0, min(1.0, float(xyxy[0] / w)))
                        y1 = max(0.0, min(1.0, float(xyxy[1] / h)))
                        x2 = max(0.0, min(1.0, float(xyxy[2] / w)))
                        y2 = max(0.0, min(1.0, float(xyxy[3] / h)))

                        category = categorize_class(raw_cls_name)
                        display_name = "vehicle" if raw_cls_name in ["car", "truck", "bus"] else raw_cls_name

                        detections.append({
                            "class": display_name,
                            "category": category,
                            "confidence": round(conf, 3),
                            "bbox": (x1, y1, x2, y2),
                            "pixel_bbox": (int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]))
                        })
                return detections
            except Exception as e:
                logger.warning(f"YOLOv8 inference exception: {e}. Falling back to OpenCV detector.")

        return self._detect_opencv(frame, target_classes)

    def track(self, frame: np.ndarray, persist: bool = True, allowed_classes: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Runs Ultralytics native ByteTrack on frame.
        Maintains persistent tracking IDs and returns tracked objects with bounding boxes.
        """
        target_classes = set(allowed_classes) if allowed_classes is not None else ALL_SUPPORTED_CLASSES
        h, w = frame.shape[:2]
        tracked_objects: List[Dict[str, Any]] = []

        if self.model_type == "YOLOv8" and self.model is not None:
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

                        if target_classes is not None and raw_cls_name not in target_classes:
                            continue

                        track_id = int(box.id[0].item()) if box.id is not None else 1

                        xyxy = box.xyxy[0].cpu().numpy()
                        x1 = max(0.0, min(1.0, float(xyxy[0] / w)))
                        y1 = max(0.0, min(1.0, float(xyxy[1] / h)))
                        x2 = max(0.0, min(1.0, float(xyxy[2] / w)))
                        y2 = max(0.0, min(1.0, float(xyxy[3] / h)))

                        category = categorize_class(raw_cls_name)
                        display_name = "vehicle" if raw_cls_name in ["car", "truck", "bus"] else raw_cls_name

                        tracked_objects.append({
                            "tracking_id": track_id,
                            "class": display_name,
                            "category": category,
                            "confidence": round(conf, 3),
                            "bbox": (x1, y1, x2, y2),
                            "pixel_bbox": (int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]))
                        })
                return tracked_objects
            except Exception as e:
                logger.warning(f"ByteTrack tracking exception: {e}. Falling back to standard detection.")

        # Fallback to standard detect
        return self.detect(frame, allowed_classes)

    def _detect_opencv(self, frame: np.ndarray, target_classes: Optional[set]) -> List[Dict[str, Any]]:
        h, w = frame.shape[:2]
        detections: List[Dict[str, Any]] = []

        fg_mask = self.bg_subtractor.apply(frame)
        _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        dilated = cv2.dilate(thresh, kernel, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for c in contours:
            area = cv2.contourArea(c)
            bx, by, bw, bh = cv2.boundingRect(c)
            if by < 30 or (by + bh) > (h - 20):
                continue
            if area < 400 or area > (h * w * 0.5):
                continue

            # OpenCV MOG2 produces motion blobs only — strictly classified as MOTION (not fake person/vehicle/animal)
            obj_cls = "motion"
            category = "motion"
            conf = min(0.60, max(0.35, 0.40 + (area / (h * w * 0.05)) * 0.10))

            if target_classes is not None and obj_cls not in target_classes and category not in target_classes:
                continue

            detections.append({
                "class": obj_cls,
                "category": category,
                "confidence": round(float(conf), 3),
                "bbox": (
                    max(0.0, min(1.0, bx / float(w))),
                    max(0.0, min(1.0, by / float(h))),
                    max(0.0, min(1.0, (bx + bw) / float(w))),
                    max(0.0, min(1.0, (by + bh) / float(h)))
                )
            })

        return detections
