import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import SecurityEvent, Detection, Camera, Video
from app.services.report_generator import generate_pdf_report, generate_csv_events, generate_csv_analytics
from app.services.audit_service import log_audit

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/export")
def export_report(
    report_type: str = Query("events", description="Type: events, analysis, cameras, analytics"),
    format: str = Query("pdf", description="Format: pdf or csv"),
    camera_id: Optional[str] = None,
    video_id: Optional[str] = None,
    time_range: str = Query("all", description="24h, 7d, 30d, all"),
    db: Session = Depends(get_db)
):
    """
    Exports genuine operational surveillance data as PDF or CSV.
    Uses real database queries with zero placeholder or simulated data.
    """
    now = datetime.datetime.utcnow()
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")

    # Time filter cutoff
    cutoff = None
    if time_range == "24h":
        cutoff = now - datetime.timedelta(hours=24)
    elif time_range == "7d":
        cutoff = now - datetime.timedelta(days=7)
    elif time_range == "30d":
        cutoff = now - datetime.timedelta(days=30)

    # Base event query
    eq = db.query(SecurityEvent)
    if cutoff:
        eq = eq.filter(SecurityEvent.created_at >= cutoff)
    if camera_id and camera_id != "All":
        eq = eq.filter(SecurityEvent.camera_id == camera_id)

    events = eq.order_by(SecurityEvent.id.desc()).all()

    # Base metrics
    total_detections = db.query(Detection).count()
    unique_tracks = db.query(func.count(func.distinct(Detection.tracking_id))).scalar() or 0
    critical_count = eq.filter(SecurityEvent.severity == "Critical").count()
    avg_risk = eq.with_entities(func.avg(SecurityEvent.risk_score)).scalar()
    max_risk = eq.with_entities(func.max(SecurityEvent.risk_score)).scalar()

    stats = {
        "total_detections": total_detections,
        "total_tracks": unique_tracks,
        "total_events": len(events),
        "critical_count": critical_count,
        "avg_risk": round(float(avg_risk), 1) if avg_risk is not None else 0.0,
        "max_risk": int(max_risk) if max_risk is not None else 0
    }

    log_audit(db, "REPORT_EXPORTED", "Report", f"Exported {report_type.upper()} report as {format.upper()} ({time_range})")

    if format.lower() == "csv":
        if report_type == "analytics":
            content = generate_csv_analytics(stats)
            filename = f"IBVAP_Analytics_Report_{timestamp_str}.csv"
        else:
            content = generate_csv_events(events)
            filename = f"IBVAP_Surveillance_Events_{timestamp_str}.csv"

        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    elif format.lower() == "pdf":
        title = f"{report_type.upper()} SURVEILLANCE REPORT"
        subtitle = f"Time Filter: {time_range.upper()} • Station: {camera_id or 'All Stations'}"
        pdf_bytes = generate_pdf_report(
            title=title,
            subtitle=subtitle,
            camera_id=camera_id,
            video_filename=video_id,
            stats=stats,
            events=events,
            db=db
        )
        filename = f"IBVAP_{report_type.capitalize()}_Report_{timestamp_str}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format. Supported formats: pdf, csv")
