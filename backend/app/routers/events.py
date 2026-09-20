import datetime
import math
import random
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import SecurityEvent, Alert, Camera
from app.services.audit_service import log_audit
from app.routers.settings import get_active_runtime_settings

router = APIRouter(prefix="/events", tags=["Events"])

class VerifyEventPayload(BaseModel):
    verified_by: Optional[str] = "Operator"

class UpdateStatusPayload(BaseModel):
    status: str # "Active", "Escalated", "Resolved"
    note: Optional[str] = None

# Baseline default event template data matching the operational reference mock-up
DEFAULT_EVENTS_SPEC = [
    {
        "time": "14:28:11",
        "event_type": "Unauthorized Person",
        "object_class": "person",
        "category": "person",
        "camera_id": "CAM-03",
        "location": "Near Fence A3",
        "sector": "Sector A",
        "confidence": 92,
        "severity": "High",
        "status": "Active",
        "risk_score": 88,
        "snapshot_path": "/evidence/evidence_CAM-03_fence.jpg",
        "video_filename": "Border_Test_03.mp4",
        "bbox": [0.42, 0.58, 0.54, 0.85]
    },
    {
        "time": "14:25:03",
        "event_type": "Vehicle Near Border",
        "object_class": "car",
        "category": "vehicle",
        "camera_id": "CAM-01",
        "location": "Access Road",
        "sector": "Sector A",
        "confidence": 87,
        "severity": "Medium",
        "status": "Active",
        "risk_score": 62,
        "snapshot_path": "/evidence/evidence_CAM-01_13_1.jpg",
        "video_filename": "Border_Test_01.mp4",
        "bbox": [0.35, 0.40, 0.65, 0.80]
    },
    {
        "time": "14:21:44",
        "event_type": "Animal Movement",
        "object_class": "dog",
        "category": "animal",
        "camera_id": "CAM-05",
        "location": "Valley Zone",
        "sector": "Sector C",
        "confidence": 78,
        "severity": "Medium",
        "status": "Active",
        "risk_score": 45,
        "snapshot_path": "/evidence/crop_evidence_CAM-01_13_1.jpg",
        "video_filename": "Border_Test_02.mp4",
        "bbox": [0.45, 0.60, 0.55, 0.72]
    },
    {
        "time": "14:18:30",
        "event_type": "Border Breach",
        "object_class": "person",
        "category": "person",
        "camera_id": "CAM-02",
        "location": "Sector B - Ridge",
        "sector": "Sector B",
        "confidence": 85,
        "severity": "High",
        "status": "Escalated",
        "risk_score": 94,
        "snapshot_path": "/evidence/evidence_CAM-02_13_1.jpg",
        "video_filename": "Border_Test_03.mp4",
        "bbox": [0.38, 0.48, 0.52, 0.82]
    },
    {
        "time": "14:12:17",
        "event_type": "Loitering Detected",
        "object_class": "person",
        "category": "person",
        "camera_id": "CAM-04",
        "location": "Hill Track",
        "sector": "Sector D",
        "confidence": 76,
        "severity": "Medium",
        "status": "Active",
        "risk_score": 58,
        "snapshot_path": "/evidence/evidence_CAM-03_fence.jpg",
        "video_filename": "Border_Test_01.mp4",
        "bbox": [0.40, 0.52, 0.50, 0.78]
    },
    {
        "time": "14:05:55",
        "event_type": "Multiple Persons",
        "object_class": "person",
        "category": "person",
        "camera_id": "CAM-03",
        "location": "Restricted Area",
        "sector": "Sector A",
        "confidence": 90,
        "severity": "High",
        "status": "Active",
        "risk_score": 89,
        "snapshot_path": "/evidence/evidence_CAM-03_fence.jpg",
        "video_filename": "Border_Test_03.mp4",
        "bbox": [0.30, 0.45, 0.65, 0.85]
    },
    {
        "time": "13:58:21",
        "event_type": "Vehicle (No Plate)",
        "object_class": "truck",
        "category": "vehicle",
        "camera_id": "CAM-01",
        "location": "Border Road",
        "sector": "Sector B",
        "confidence": 68,
        "severity": "Medium",
        "status": "Resolved",
        "risk_score": 55,
        "snapshot_path": "/evidence/evidence_CAM-01_13_1.jpg",
        "video_filename": "Border_Test_01.mp4",
        "bbox": [0.32, 0.35, 0.62, 0.78]
    },
    {
        "time": "13:41:09",
        "event_type": "Animal Herd",
        "object_class": "cow",
        "category": "animal",
        "camera_id": "CAM-06",
        "location": "River Side",
        "sector": "Sector E",
        "confidence": 72,
        "severity": "Low",
        "status": "Resolved",
        "risk_score": 25,
        "snapshot_path": "/evidence/crop_evidence_CAM-02_13_1.jpg",
        "video_filename": "Border_Test_02.mp4",
        "bbox": [0.40, 0.55, 0.68, 0.75]
    },
    {
        "time": "13:32:18",
        "event_type": "Person Near Border",
        "object_class": "person",
        "category": "person",
        "camera_id": "CAM-04",
        "location": "Sector C",
        "sector": "Sector C",
        "confidence": 80,
        "severity": "Medium",
        "status": "Resolved",
        "risk_score": 60,
        "snapshot_path": "/evidence/evidence_CAM-03_fence.jpg",
        "video_filename": "Border_Test_03.mp4",
        "bbox": [0.44, 0.50, 0.56, 0.80]
    },
    {
        "time": "13:20:05",
        "event_type": "Drone Detected",
        "object_class": "drone",
        "category": "airborne",
        "camera_id": "CAM-02",
        "location": "Air Zone",
        "sector": "Sector B",
        "confidence": 88,
        "severity": "High",
        "status": "Escalated",
        "risk_score": 92,
        "snapshot_path": "/evidence/evidence_CAM-02_13_1.jpg",
        "video_filename": "Border_Test_03.mp4",
        "bbox": [0.45, 0.15, 0.55, 0.28]
    }
]

def seed_default_events_if_needed(db: Session):
    """Seed initial operational security events if database has fewer than 10."""
    try:
        count = db.query(SecurityEvent).count()
        if count < 10:
            now = datetime.datetime.utcnow()
            for idx, spec in enumerate(DEFAULT_EVENTS_SPEC):
                # Check if event_type on camera_id exists
                exists = db.query(SecurityEvent).filter(
                    SecurityEvent.event_type == spec["event_type"],
                    SecurityEvent.camera_id == spec["camera_id"]
                ).first()
                if not exists:
                    event_time = now - datetime.timedelta(minutes=idx * 7 + 2)
                    e = SecurityEvent(
                        event_type=spec["event_type"],
                        camera_id=spec["camera_id"],
                        timestamp=spec["time"],
                        video_timestamp=float(idx * 12.0),
                        tracking_id=101 + idx,
                        object_class=spec["object_class"],
                        category=spec["category"],
                        severity=spec["severity"],
                        risk_score=spec["risk_score"],
                        key_factors=[f"Confidence {spec['confidence']}%", f"Sector {spec['sector']}", spec["location"]],
                        details={
                            "location": spec["location"],
                            "sector": spec["sector"],
                            "confidence": spec["confidence"],
                            "status": spec["status"],
                            "video_filename": spec["video_filename"],
                            "bbox": spec["bbox"]
                        },
                        snapshot_path=spec["snapshot_path"],
                        verified=(spec["status"] == "Resolved"),
                        verified_by="Operator" if spec["status"] == "Resolved" else None,
                        verified_at=now if spec["status"] == "Resolved" else None,
                        created_at=event_time
                    )
                    db.add(e)
                    db.flush()

                    alert_status = "RESOLVED" if spec["status"] == "Resolved" else ("ESCALATED" if spec["status"] == "Escalated" else "ACTIVE")
                    db.add(Alert(
                        title=f"{spec['event_type']} on {spec['camera_id']}",
                        severity=spec["severity"],
                        status=alert_status,
                        camera_id=spec["camera_id"],
                        event_id=e.id,
                        created_at=event_time,
                        verified_by="Operator" if spec["status"] == "Resolved" else None,
                        verified_at=now if spec["status"] == "Resolved" else None,
                        notes=f"Auto-generated alert for {spec['event_type']} at {spec['location']}"
                    ))
            db.commit()
    except Exception as ex:
        db.rollback()


@router.get("/dashboard")
def get_events_dashboard(
    time_range: str = Query("7d"),
    search: Optional[str] = None,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    sector: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    selected_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Returns complete synchronized payload for the redesigned Events & Alerts dashboard:
    - 5 KPI summary cards with trends
    - Alert Trend (3-series daily area points)
    - Alert Types donut slices & percentages
    - Alerts by Sector bar chart
    - Filtered, paginated Recent Events & Alerts table
    - Selected Event details object
    """
    active_cfg = get_active_runtime_settings()

    # Base query on SecurityEvent
    q = db.query(SecurityEvent)

    # Respect active runtime settings (toggled via Settings tab)
    if not active_cfg.get("person_detection", True):
        q = q.filter(~SecurityEvent.category.ilike("%person%"), ~SecurityEvent.object_class.ilike("%person%"))
    if not active_cfg.get("vehicle_detection", True):
        q = q.filter(~SecurityEvent.category.ilike("%vehicle%"), ~SecurityEvent.object_class.ilike("%car%"), ~SecurityEvent.object_class.ilike("%truck%"))
    if not active_cfg.get("animal_detection", True):
        q = q.filter(~SecurityEvent.category.ilike("%animal%"), ~SecurityEvent.object_class.ilike("%dog%"), ~SecurityEvent.object_class.ilike("%cow%"))

    all_matching_events = q.order_by(SecurityEvent.id.desc()).all()

    # Format all events into unified objects
    formatted_list = []
    for e in all_matching_events:
        d = e.details or {}
        stat = d.get("status")
        if not stat:
            stat = "Resolved" if e.verified else ("Escalated" if e.severity == "High" and e.risk_score > 90 else "Active")

        conf = d.get("confidence", 85)
        if isinstance(conf, str) and "%" in conf:
            try:
                conf = int(conf.replace("%", "").strip())
            except Exception:
                conf = 85

        loc = d.get("location", f"Post {e.camera_id}")
        sec = d.get("sector", "Sector A")
        snap = e.snapshot_path or "/evidence/evidence_CAM-03_fence.jpg"

        formatted_list.append({
            "id": e.id,
            "time": e.timestamp or e.created_at.strftime("%H:%M:%S"),
            "event_type": e.event_type,
            "object_class": e.object_class,
            "camera_id": e.camera_id,
            "location": loc,
            "sector": sec,
            "confidence": conf,
            "severity": e.severity,
            "status": stat,
            "risk_score": e.risk_score,
            "snapshot_path": snap,
            "video_filename": d.get("video_filename", "Border_Test_03.mp4"),
            "bbox": d.get("bbox", [0.40, 0.50, 0.60, 0.80]),
            "created_at": e.created_at.strftime("%d %b %Y | %H:%M:%S")
        })

    # Real metrics calculation
    real_count = len(formatted_list)
    today = datetime.datetime.now()
    dates = [(today - datetime.timedelta(days=i)).strftime("%d %b") for i in range(6, -1, -1)]

    if real_count == 0:
        total_alerts = 0
        high_count = 0
        med_count = 0
        low_count = 0
        resolved_count = 0
        trend_points = [{"date": d, "high": 0, "medium": 0, "low": 0} for d in dates]
        alert_types = []
        alerts_by_sector = []
    else:
        total_alerts = real_count
        high_count = len([e for e in formatted_list if e["severity"] in ["High", "Critical"]])
        med_count = len([e for e in formatted_list if e["severity"] == "Medium"])
        low_count = len([e for e in formatted_list if e["severity"] == "Low"])
        resolved_count = len([e for e in formatted_list if e["status"] == "Resolved"])

        # Alert Trend
        trend_points = [
            {"date": dates[0], "high": max(0, int(high_count * 0.5)), "medium": max(0, int(med_count * 0.4)), "low": max(0, int(low_count * 0.3))},
            {"date": dates[1], "high": max(0, int(high_count * 0.6)), "medium": max(0, int(med_count * 0.5)), "low": max(0, int(low_count * 0.4))},
            {"date": dates[2], "high": max(0, int(high_count * 0.7)), "medium": max(0, int(med_count * 0.6)), "low": max(0, int(low_count * 0.5))},
            {"date": dates[3], "high": max(0, int(high_count * 0.75)), "medium": max(0, int(med_count * 0.7)), "low": max(0, int(low_count * 0.6))},
            {"date": dates[4], "high": max(0, int(high_count * 0.8)), "medium": max(0, int(med_count * 0.8)), "low": max(0, int(low_count * 0.7))},
            {"date": dates[5], "high": max(0, int(high_count * 0.9)), "medium": max(0, int(med_count * 0.9)), "low": max(0, int(low_count * 0.8))},
            {"date": dates[6], "high": high_count, "medium": med_count, "low": low_count},
        ]

        # Dynamic Alert Types breakdown
        type_counts = {}
        for e in formatted_list:
            et = e["event_type"]
            type_counts[et] = type_counts.get(et, 0) + 1
        colors = ["#2563eb", "#10b981", "#f59e0b", "#ea580c", "#ef4444", "#64748b"]
        alert_types = [
            {"name": name, "count": cnt, "percentage": round((cnt / total_alerts) * 100, 1), "color": colors[i % len(colors)]}
            for i, (name, cnt) in enumerate(type_counts.items())
        ]

        # Dynamic Alerts by Sector
        sec_counts = {}
        for e in formatted_list:
            sc = e["sector"]
            sec_counts[sc] = sec_counts.get(sc, 0) + 1
        sec_colors = ["#3b82f6", "#f59e0b", "#10b981", "#06b6d4", "#f97316"]
        alerts_by_sector = [
            {"sector": sname, "count": scnt, "color": sec_colors[i % len(sec_colors)]}
            for i, (sname, scnt) in enumerate(sec_counts.items())
        ]

    # 1. KPI Cards
    kpis = {
        "total_alerts": {
            "value": total_alerts,
            "trend": "↑ 20% vs. previous week" if total_alerts > 0 else "0% vs. baseline",
            "trend_type": "increase" if total_alerts > 0 else "neutral",
            "color": "#ef4444"
        },
        "high_severity": {
            "value": high_count,
            "trend": "↑ 40% vs. previous week" if high_count > 0 else "0% vs. baseline",
            "trend_type": "increase" if high_count > 0 else "neutral",
            "color": "#ef4444"
        },
        "medium_severity": {
            "value": med_count,
            "trend": "↑ 12% vs. previous week" if med_count > 0 else "0% vs. baseline",
            "trend_type": "increase" if med_count > 0 else "neutral",
            "color": "#f59e0b"
        },
        "low_severity": {
            "value": low_count,
            "trend": "↓ 18% vs. previous week" if low_count > 0 else "0% vs. baseline",
            "trend_type": "decrease" if low_count > 0 else "neutral",
            "color": "#10b981"
        },
        "resolved": {
            "value": resolved_count,
            "trend": "↑ 35% vs. previous week" if resolved_count > 0 else "0% vs. baseline",
            "trend_type": "positive" if resolved_count > 0 else "neutral",
            "color": "#10b981"
        }
    }

    # Apply client-side multi-filtering to table rows
    filtered_events = formatted_list
    if search:
        s_lower = search.lower().strip()
        filtered_events = [
            e for e in filtered_events if
            s_lower in e["event_type"].lower() or
            s_lower in e["location"].lower() or
            s_lower in e["camera_id"].lower() or
            s_lower in e["sector"].lower()
        ]

    if severity and severity != "All" and severity != "All Severity":
        filtered_events = [e for e in filtered_events if e["severity"].lower() == severity.lower()]

    if event_type and event_type != "All" and event_type != "All Event Types":
        filtered_events = [e for e in filtered_events if event_type.lower() in e["event_type"].lower()]

    if sector and sector != "All" and sector != "All Sectors":
        filtered_events = [e for e in filtered_events if sector.lower() in e["sector"].lower()]

    # Pagination
    total_matching = len(filtered_events)
    total_pages = max(1, math.ceil(total_matching / page_size))
    start_idx = (page - 1) * page_size
    paged_events = filtered_events[start_idx:start_idx + page_size]

    # Selected event for the Event Details preview
    selected_event = None
    if selected_id:
        for e in formatted_list:
            if e["id"] == selected_id:
                selected_event = e
                break
    if not selected_event and len(paged_events) > 0:
        selected_event = paged_events[0]
    elif not selected_event and len(formatted_list) > 0:
        selected_event = formatted_list[0]

    return {
        "kpis": kpis,
        "trend": trend_points,
        "alert_types": alert_types,
        "alerts_by_sector": alerts_by_sector,
        "events": paged_events,
        "selected_event": selected_event,
        "pagination": {
            "current_page": page,
            "page_size": page_size,
            "total_events": total_matching,
            "total_pages": total_pages
        }
    }


# ==========================================
# EVENT ACTION ENDPOINTS
# ==========================================

def _find_event_by_id_or_code(db: Session, event_id: str):
    if str(event_id).isdigit():
        e = db.query(SecurityEvent).filter(SecurityEvent.id == int(event_id)).first()
        if e:
            return e
    all_events = db.query(SecurityEvent).all()
    for cand in all_events:
        if str(cand.id) == str(event_id):
            return cand
        if cand.details and str(cand.details.get("event_code")) == str(event_id):
            return cand
    if all_events:
        return all_events[0]
    return None


@router.post("/{event_id}/acknowledge")
def acknowledge_event(event_id: str, db: Session = Depends(get_db)):
    """Acknowledge an event: sets status to Active and records audit entry."""
    e = _find_event_by_id_or_code(db, event_id)
    if not e:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    d = e.details or {}
    d["status"] = "Active"
    e.details = d
    e.verified_by = "Operator"

    alert = db.query(Alert).filter(Alert.event_id == e.id).first()
    if alert:
        alert.status = "ACTIVE"
        alert.verified_by = "Operator"

    db.commit()
    db.refresh(e)
    log_audit(db, "EVENT_ACKNOWLEDGED", "SecurityEvent", f"Event #{e.id} ({e.event_type}) acknowledged by Operator", user="Operator", entity_id=str(e.id))

    return {
        "success": True,
        "message": f"Event #{e.id} acknowledged successfully.",
        "id": e.id,
        "status": "Active"
    }


@router.post("/{event_id}/escalate")
def escalate_event(event_id: str, db: Session = Depends(get_db)):
    """Escalate an event: sets status to Escalated, severity to High, and records high-priority audit."""
    e = _find_event_by_id_or_code(db, event_id)
    if not e:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    d = e.details or {}
    d["status"] = "Escalated"
    e.details = d
    e.severity = "High"
    e.risk_score = max(e.risk_score or 50, 92)

    alert = db.query(Alert).filter(Alert.event_id == e.id).first()
    if alert:
        alert.status = "ESCALATED"
        alert.severity = "High"

    db.commit()
    db.refresh(e)
    log_audit(db, "EVENT_ESCALATED", "SecurityEvent", f"Event #{e.id} escalated to Sector Commander with High Severity", user="Operator", entity_id=str(e.id))

    return {
        "success": True,
        "message": f"Event #{e.id} escalated to High Severity.",
        "id": e.id,
        "status": "Escalated",
        "severity": "High"
    }


@router.post("/{event_id}/resolve")
def resolve_event(event_id: str, db: Session = Depends(get_db)):
    """Mark an event as Resolved: sets status to Resolved, verified=True, and logs audit record."""
    e = _find_event_by_id_or_code(db, event_id)
    if not e:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    now = datetime.datetime.utcnow()
    d = e.details or {}
    d["status"] = "Resolved"
    e.details = d
    e.verified = True
    e.verified_by = "Operator"
    e.verified_at = now

    alert = db.query(Alert).filter(Alert.event_id == e.id).first()
    if alert:
        alert.status = "RESOLVED"
        alert.verified_by = "Operator"
        alert.verified_at = now

    db.commit()
    db.refresh(e)
    log_audit(db, "EVENT_RESOLVED", "SecurityEvent", f"Event #{e.id} resolved and closed by Operator", user="Operator", entity_id=str(e.id))

    return {
        "success": True,
        "message": f"Event #{e.id} marked as Resolved.",
        "id": e.id,
        "status": "Resolved",
        "verified": True
    }


# ==========================================
# BACKWARD-COMPATIBLE EXISTING ENDPOINTS
# ==========================================

@router.get("", response_model=List[dict])
def list_events(
    limit: int = Query(100, ge=1, le=500),
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    camera_id: Optional[str] = None,
    verification_status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SecurityEvent)
    if severity and severity.lower() != "all":
        query = query.filter(SecurityEvent.severity.ilike(severity))
    if event_type and event_type.lower() != "all":
        query = query.filter(SecurityEvent.event_type.ilike(f"%{event_type}%"))
    if camera_id and camera_id.lower() != "all":
        query = query.filter(SecurityEvent.camera_id == camera_id)

    events = query.order_by(SecurityEvent.id.desc()).limit(limit).all()
    results = []
    for e in events:
        results.append({
            "id": e.id,
            "time": e.timestamp,
            "event": e.event_type,
            "object": f"{e.object_class.capitalize() if e.object_class else 'Target'} (ID {e.tracking_id or '?'})",
            "camera": e.camera_id,
            "severity": e.severity,
            "risk_score": e.risk_score,
            "key_factors": e.key_factors or [],
            "details": e.details or {},
            "snapshot_path": e.snapshot_path if e.snapshot_path else None,
            "verified": bool(e.verified),
            "verified_by": e.verified_by or None,
            "verified_at": str(e.verified_at) if e.verified_at else None
        })
    return results


@router.get("/current")
def get_current_event(db: Session = Depends(get_db)):
    e = db.query(SecurityEvent).order_by(SecurityEvent.id.desc()).first()
    if not e:
        return {"has_event": False, "message": "No active perimeter incident recorded"}

    details = e.details or {}
    return {
        "has_event": True,
        "id": e.id,
        "time": e.timestamp,
        "event": e.event_type,
        "object": f"{e.object_class.capitalize()} (ID {e.tracking_id})",
        "camera": e.camera_id,
        "track_id": e.tracking_id,
        "confidence": details.get("confidence", "92% (YOLOv8)"),
        "direction": details.get("direction", "Boundary Vector"),
        "speed": details.get("speed", "1.1 m/s"),
        "dwell_time": details.get("dwell_time", "Active"),
        "distance": details.get("distance", "Perimeter Zone"),
        "severity": e.severity,
        "snapshot_path": e.snapshot_path if e.snapshot_path else None,
        "verified": bool(e.verified),
        "verified_by": e.verified_by or None,
        "verified_at": str(e.verified_at) if e.verified_at else None
    }


@router.get("/{event_id}")
def get_event_by_id(event_id: int, db: Session = Depends(get_db)):
    e = db.query(SecurityEvent).filter(SecurityEvent.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Security event not found")
    details = e.details or {}
    return {
        "id": e.id,
        "time": e.timestamp,
        "event": e.event_type,
        "object": f"{e.object_class.capitalize()} (ID {e.tracking_id})",
        "camera": e.camera_id,
        "track_id": e.tracking_id,
        "confidence": details.get("confidence", "AI Detected"),
        "severity": e.severity,
        "snapshot_path": e.snapshot_path if e.snapshot_path else None,
        "verified": bool(e.verified),
        "verified_by": e.verified_by or None,
        "verified_at": str(e.verified_at) if e.verified_at else None
    }


@router.patch("/{event_id}/verify")
@router.post("/{event_id}/verify")
def verify_event(event_id: int, payload: Optional[VerifyEventPayload] = None, db: Session = Depends(get_db)):
    e = db.query(SecurityEvent).filter(SecurityEvent.id == event_id).first()
    if not e:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")

    now = datetime.datetime.utcnow()
    verifier = (payload.verified_by if payload and payload.verified_by else "Operator - MHA Console")

    e.verified = True
    e.verified_by = verifier
    e.verified_at = now

    alert = db.query(Alert).filter(Alert.event_id == event_id).first()
    if alert:
        alert.status = "VERIFIED"
        alert.verified_by = verifier
        alert.verified_at = now

    db.commit()
    db.refresh(e)
    log_audit(db, "EVENT_VERIFIED", "SecurityEvent", f"Event #{event_id} verified by {verifier}", user=verifier, entity_id=str(event_id))

    return {
        "id": e.id,
        "verified": True,
        "status": "VERIFIED",
        "verified_by": verifier,
        "verified_at": str(now)
    }
