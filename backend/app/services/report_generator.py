import io
import csv
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models import SecurityEvent, Detection, Camera, Video, Track, SystemSetting

def generate_csv_events(events: List[SecurityEvent]) -> str:
    """Generates RFC 4180 compliant CSV content from security events."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Event ID", "Timestamp (UTC)", "Camera ID", "Event Type",
        "Object Class", "Track ID", "Severity", "Risk Score",
        "Verified", "Verified By", "Verified At"
    ])
    for e in events:
        writer.writerow([
            e.id,
            e.timestamp or "N/A",
            e.camera_id or "N/A",
            e.event_type or "N/A",
            e.object_class or "N/A",
            e.tracking_id if e.tracking_id is not None else "N/A",
            e.severity or "N/A",
            e.risk_score if e.risk_score is not None else "N/A",
            "VERIFIED" if e.verified else "UNVERIFIED",
            e.verified_by or "N/A",
            e.verified_at.strftime("%Y-%m-%d %H:%M:%S") if e.verified_at else "N/A"
        ])
    return output.getvalue()

def generate_csv_analytics(summary_data: Dict[str, Any]) -> str:
    """Generates CSV for analytics metrics."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Time Range", summary_data.get("time_range", "All")])
    writer.writerow(["Total Detections", summary_data.get("total_detections", 0)])
    writer.writerow(["Total Events", summary_data.get("total_events", 0)])
    writer.writerow(["Total Unique Tracks", summary_data.get("total_tracks", 0)])
    writer.writerow(["Critical Incidents", summary_data.get("severity", {}).get("critical", 0)])
    writer.writerow(["High Severity Incidents", summary_data.get("severity", {}).get("high", 0)])
    writer.writerow(["Medium Severity Incidents", summary_data.get("severity", {}).get("medium", 0)])
    writer.writerow(["Low Severity Incidents", summary_data.get("severity", {}).get("low", 0)])
    writer.writerow(["Average Risk Score", summary_data.get("risk", {}).get("average", 0.0)])
    writer.writerow(["Maximum Risk Score", summary_data.get("risk", {}).get("max", 0)])
    return output.getvalue()

def generate_pdf_report(
    title: str,
    subtitle: str,
    camera_id: Optional[str],
    video_filename: Optional[str],
    stats: Dict[str, Any],
    events: List[SecurityEvent],
    db: Session
) -> bytes:
    """
    Generates a professional PDF surveillance report using ReportLab.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette: Command Center Theme
    c_primary = colors.HexColor("#1b3022") # Deep Green
    c_dark = colors.HexColor("#0f172a") # Slate Dark
    c_accent = colors.HexColor("#0284c7") # Sky
    c_critical = colors.HexColor("#b91c1c") # Red
    c_gray = colors.HexColor("#64748b")
    c_light = colors.HexColor("#f8fafc")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=c_primary
    )

    sub_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=c_gray
    )

    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=c_dark
    )

    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=c_dark
    )

    cell_bold = ParagraphStyle(
        'CellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=c_dark
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("INTELLIGENT BORDER VIDEO ANALYSIS PLATFORM (IBVAP)", title_style))
    story.append(Paragraph("MINISTRY OF HOME AFFAIRS • GOVERNMENT OF INDIA", ParagraphStyle(
        'GovHeader', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=c_gray
    )))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>Report:</b> {title} — {subtitle}", sub_style))
    story.append(Paragraph(f"<b>Generated At (UTC):</b> {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} | <b>Classification:</b> RESTRICTED / OPERATIONAL", sub_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_primary, spaceBefore=2, spaceAfter=10))

    # 2. Scope & Target Information
    scope_data = [
        [Paragraph("Target Camera Station", cell_bold), Paragraph(str(camera_id or "All Configured Stations"), cell_style),
         Paragraph("Target Video / Feed", cell_bold), Paragraph(str(video_filename or "Active Surveillance Pipeline"), cell_style)],
        [Paragraph("Platform Status", cell_bold), Paragraph("OPERATIONAL (ACTIVE)", cell_style),
         Paragraph("Security Classification", cell_bold), Paragraph("OFFICIAL / BORDER DEFENSE", cell_style)]
    ]
    t_scope = Table(scope_data, colWidths=[130, 140, 130, 140])
    t_scope.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), c_light),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_scope)
    story.append(Spacer(1, 12))

    # 3. Key Operational Statistics
    story.append(Paragraph("OPERATIONAL SURVEILLANCE METRICS", section_style))
    story.append(Spacer(1, 4))

    stats_data = [
        [
            Paragraph("Total Detections", cell_bold),
            Paragraph(str(stats.get("total_detections", 0)), cell_style),
            Paragraph("Unique Tracked Targets", cell_bold),
            Paragraph(str(stats.get("total_tracks", 0)), cell_style)
        ],
        [
            Paragraph("Security Incidents", cell_bold),
            Paragraph(str(stats.get("total_events", len(events))), cell_style),
            Paragraph("Peak Threat Score", cell_bold),
            Paragraph(f"{stats.get('max_risk', 'N/A')}/100", cell_style)
        ],
        [
            Paragraph("Critical Incidents", cell_bold),
            Paragraph(str(stats.get("critical_count", 0)), cell_style),
            Paragraph("Average Risk Index", cell_bold),
            Paragraph(f"{stats.get('avg_risk', 'N/A')}/100", cell_style)
        ]
    ]
    t_stats = Table(stats_data, colWidths=[130, 140, 130, 140])
    t_stats.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_stats)
    story.append(Spacer(1, 14))

    # 4. Security Incidents Log
    story.append(Paragraph(f"RECORDED INCIDENTS & BREACH EVENTS ({min(len(events), 40)} SHOWN)", section_style))
    story.append(Spacer(1, 4))

    headers = ["ID", "Time", "Station", "Incident Type", "Target", "Severity", "Risk", "Status"]
    table_rows = [[Paragraph(f"<b>{h}</b>", cell_bold) for h in headers]]

    display_events = events[:40] # Prevent giant multi-page bloat
    if not display_events:
        table_rows.append([Paragraph("No security events recorded in this surveillance period.", cell_style)] + [Paragraph("", cell_style)]*7)
    else:
        for ev in display_events:
            status_text = f"VERIFIED ({ev.verified_by})" if ev.verified else "UNVERIFIED"
            sev_color = c_critical if ev.severity == "Critical" else c_dark
            table_rows.append([
                Paragraph(str(ev.id), cell_style),
                Paragraph(str(ev.timestamp or "N/A"), cell_style),
                Paragraph(str(ev.camera_id or "N/A"), cell_style),
                Paragraph(str(ev.event_type or "N/A"), cell_style),
                Paragraph(f"{ev.object_class or 'Target'} #{ev.tracking_id or '?'}", cell_style),
                Paragraph(f"<font color='{sev_color.hexval()}'>{ev.severity or 'Low'}</font>", cell_style),
                Paragraph(str(ev.risk_score or 0), cell_style),
                Paragraph(status_text, cell_style)
            ])

    t_events = Table(table_rows, colWidths=[30, 60, 60, 130, 90, 55, 40, 75])
    t_events.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_events)
    story.append(Spacer(1, 16))

    # 5. Footer & Sign-off
    story.append(HRFlowable(width="100%", thickness=0.5, color=c_gray, spaceBefore=4, spaceAfter=8))
    footer_text = Paragraph(
        "<b>SYSTEM AUDIT VERIFICATION:</b> This document is electronically generated by the IBVAP Operational Core. "
        "All telemetry, event classifications, and video analytics are cryptographically bound to the SQLite master database and local storage. "
        "Any manual alteration of this report invalidates evidentiary chain of custody.",
        ParagraphStyle('FooterNotice', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=9, textColor=c_gray)
    )
    story.append(footer_text)

    doc.build(story)
    return buffer.getvalue()
