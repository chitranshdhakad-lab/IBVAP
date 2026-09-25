import React, { useEffect } from 'react';
import {
  X, Download, ShieldAlert, CheckCircle, Clock, Video,
  Compass, Gauge, Eye, ZoomIn, AlertTriangle, ArrowLeft, Camera
} from 'lucide-react';

import { useTranslation } from '../services/i18n.js';
import { resolveMediaUrl } from '../services/apiConfig.js';

export default function SnapshotModal({
  event,
  onClose,
  onVerify,
  onJumpToVideo
}) {
  const { t } = useTranslation();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!event) return null;

  const severity = (event.severity || 'Low').toLowerCase();
  const sevLabel =
    severity === 'critical' ? t('levelCritical') :
    severity === 'high' ? t('levelHigh') :
    severity === 'medium' ? t('levelModerate') : t('levelLow');

  const snapshotSrc = resolveMediaUrl(event.snapshot_path || event.snapshotUrl);
  const cropSrc = resolveMediaUrl(event.crop_path || event.details?.crop_path);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = snapshotSrc;
    a.download = `IBVAP_Evidence_${event.camera || 'CAM-01'}_${event.id || 'snap'}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="snapshot-modal-backdrop" onClick={handleBackdropClick}>
      <div className="snapshot-modal-dialog">
        {/* Modal Top Header */}
        <div className="snapshot-modal-header">
          <div className="snapshot-modal-title-wrap">
            <ShieldAlert size={16} className={`text-sev-${severity}`} />
            <div>
              <div className="snapshot-modal-title">
                {event.event || event.event_type || 'Perimeter Incident'}
              </div>
              <div className="snapshot-modal-subtitle">
                EVIDENCE RECORD ID #{event.id || 'LIVE'} • {event.camera || 'CAM-01'} • {event.time || event.timestamp}
              </div>
            </div>
          </div>

          <div className="snapshot-modal-header-actions">
            <button
              type="button"
              className="btn-modal-back"
              onClick={onClose}
              title="Return to feed"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <span className={`severity-pill severity-${severity}`}>
              <span className={`severity-dot dot-${severity}`} />
              {sevLabel}
            </span>
            <button
              type="button"
              className="snapshot-modal-close-btn"
              onClick={onClose}
              title="Close (ESC)"
            >
              <X size={16} />
            </button>
          </div>

        </div>

        {/* Modal Body: Image Stage (Left) & Telemetry Inspector (Right) */}
        <div className="snapshot-modal-body">
          {/* Main Evidence Visual Preview */}
          <div className="snapshot-modal-visual-stage">
            <div className="snapshot-image-container">
              {snapshotSrc ? (
                <>
                  <img
                    src={snapshotSrc}
                    alt={`Evidence Snapshot #${event.id}`}
                    className="snapshot-main-img"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const p = e.target.parentElement;
                      if (p) {
                        const errEl = p.querySelector('.modal-snapshot-error');
                        if (errEl) errEl.style.display = 'flex';
                      }
                    }}
                  />
                  <div className="modal-snapshot-error" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '320px', color: 'var(--text-secondary)' }}>
                    <Camera size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>EVIDENCE FILE UNAVAILABLE</span>
                    <span style={{ fontSize: '11px', opacity: 0.7 }}>File not found on storage mount</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '320px', color: 'var(--text-secondary)' }}>
                  <Camera size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>NO EVIDENCE SNAPSHOT RECORDED</span>
                  <span style={{ fontSize: '11px', opacity: 0.7 }}>This event did not generate an optical capture</span>
                </div>
              )}
              <div className="snapshot-hud-stamp">
                <span>CLASSIFICATION: {event.object || event.object_class || 'Target'}</span>
                <span>CONFIDENCE: {event.confidence || '94%'}</span>
              </div>
            </div>

            {/* Target Zoom Crop (if available) */}
            {cropSrc && (
              <div className="snapshot-crop-preview-box">
                <div className="crop-box-label">
                  <ZoomIn size={11} /> TARGET ISOLATION ZOOM (100% CROP)
                </div>
                <img
                  src={cropSrc}
                  alt="Target Crop"
                  className="crop-preview-img"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          {/* Telemetry & Tactical Forensics Details */}
          <div className="snapshot-modal-details-pane">
            <div className="details-pane-section-title">TACTICAL INCIDENT TELEMETRY</div>

            <div className="forensics-grid">
              <div className="forensics-field">
                <span className="field-name">SURVEILLANCE POST</span>
                <span className="field-value text-accent">{event.camera || 'CAM-01'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">TIMESTAMP</span>
                <span className="field-value">{event.time || event.timestamp || '—'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">TARGET CLASSIFICATION</span>
                <span className="field-value font-mono">{event.object || event.object_class || 'Person'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">AI CONFIDENCE</span>
                <span className="field-value text-emerald">{event.confidence || '92%'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">ESTIMATED SPEED</span>
                <span className="field-value font-mono">{event.speed || event.details?.speed || 'Est. 0.0 px/s'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">TRAJECTORY BEARING</span>
                <span className="field-value font-mono">{event.direction || event.details?.direction || 'Northbound'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">SECTOR DWELL TIME</span>
                <span className="field-value font-mono">{event.dwell_time || event.details?.dwell_time || '0 sec'}</span>
              </div>
              <div className="forensics-field">
                <span className="field-name">DISTANCE TO IB FENCE</span>
                <span className="field-value font-mono">{event.distance || event.details?.distance || '14.2m'}</span>
              </div>
            </div>

            {/* Verification & Risk Level Banner */}
            <div className={`snapshot-verification-card ${event.verified ? 'is-verified' : 'is-unverified'}`}>
              <div className="v-card-top">
                {event.verified ? (
                  <>
                    <CheckCircle size={14} className="text-emerald" />
                    <span>VERIFIED & LOGGED BY OPERATOR</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-amber" />
                    <span>PENDING OPERATOR VERIFICATION</span>
                  </>
                )}
              </div>
              <p className="v-card-desc">
                {event.verified
                  ? 'This security event has been corroborated with perimeter radar telemetry and confirmed in the official boundary ledger.'
                  : 'Automated perimeter threat alert flagged by neural video analytics. Operator confirmation requested.'}
              </p>
            </div>

            {/* Modal Bottom Actions */}
            <div className="snapshot-modal-actions">
              <button
                type="button"
                className="btn-modal-action btn-back-action"
                onClick={onClose}
                title="Return to Surveillance"
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>

              <button
                type="button"
                className="btn-modal-action btn-download"
                onClick={handleDownload}
                title="Download full-resolution snapshot JPEG"
              >
                <Download size={13} />
                <span>Save JPEG</span>
              </button>

              {onJumpToVideo && (
                <button
                  type="button"
                  className="btn-modal-action btn-jump"
                  onClick={() => {
                    onJumpToVideo(event);
                    onClose();
                  }}
                  title="Jump playback to event timestamp"
                >
                  <Video size={13} />
                  <span>Replay Clip</span>
                </button>
              )}

              {!event.verified && onVerify && (
                <button
                  type="button"
                  className="btn-modal-action btn-verify"
                  onClick={() => {
                    onVerify(event.id);
                  }}
                  title="Verify and clear alert status"
                >
                  <CheckCircle size={13} />
                  <span>Verify Incident</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
