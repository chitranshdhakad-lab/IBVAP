import React, { useState, useEffect } from 'react';
import { Check, ShieldCheck, Camera } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';
import { resolveMediaUrl } from '../services/apiConfig.js';

export default function CurrentEvent({
  onViewClip,
  currentEvent,
  event,
  onEventVerified,
  onVerify,
  onOpenSnapshot
}) {
  const { t } = useTranslation();
  const activeEvt = currentEvent || event;
  const verifyHandler = onEventVerified || onVerify;
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    if (activeEvt && activeEvt.verified !== undefined) {
      setIsVerified(Boolean(activeEvt.verified));
    } else {
      setIsVerified(false);
    }
  }, [activeEvt]);

  const handleVerifyToggle = async () => {
    if (!activeEvt || !activeEvt.id) return;
    const eventId = activeEvt.id;
    try {
      const res = await fetch(`/api/events/${eventId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified_by: 'Operator - Tactical HUD' })
      });
      if (res.ok) {
        setIsVerified(true);
        if (verifyHandler) {
          verifyHandler(eventId);
        }
      }
    } catch (e) {
      console.warn('Verify request error:', e);
      setIsVerified(true);
    }
  };

  // If no active boundary incident has been logged
  if (!activeEvt || !activeEvt.id || activeEvt.has_event === false) {
    return (
      <div className="bottom-card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: '160px' }}>
        <div className="current-event-header" style={{ width: '100%', marginBottom: '12px' }}>
          <span className="section-label">{t('currentIncident')}</span>
          <span className="badge-secure">{t('perimeterClear')}</span>
        </div>
        <div style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={36} color="#16a34a" />
          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-heading)' }}>
            {t('noActiveIncident')}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', maxWidth: '220px' }}>
            {t('sensorGridActive')}
          </div>
        </div>
      </div>
    );
  }

  const imageSrc = resolveMediaUrl(activeEvt.snapshot_path);

  return (
    <div className="bottom-card">
      {/* Header with Title and Severity Badge */}
      <div className="current-event-header">
        <span className="section-label">{t('currentIncident')}</span>
        <span className={`badge-${(activeEvt.severity || 'critical').toLowerCase()}`}>
          {activeEvt.severity || 'Critical'}
        </span>
      </div>

      <div className="current-event-title">{activeEvt.event || activeEvt.event_type || 'Zone Breach'}</div>

      {/* Body: Person Photo and Metadata Key-Values */}
      <div className="current-event-body">
        <div
          className="current-event-img-wrap"
          onClick={() => onOpenSnapshot && onOpenSnapshot(activeEvt)}
          title="Click to inspect full tactical evidence snapshot"
          style={{ cursor: 'pointer', position: 'relative' }}
        >
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Detected Incident Snapshot"
              className="current-event-img"
              onError={(e) => {
                e.target.style.display = 'none';
                const p = e.target.parentElement;
                if (p) {
                  const errBox = p.querySelector('.current-event-no-img');
                  if (errBox) errBox.style.display = 'flex';
                }
              }}
            />
          ) : null}
          <div
            className="current-event-no-img"
            style={{
              display: imageSrc ? 'none' : 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              background: 'rgba(15,23,42,0.8)',
              color: 'var(--text-secondary)'
            }}
          >
            <Camera size={24} style={{ opacity: 0.5, marginBottom: '4px' }} />
            <span style={{ fontSize: '9.5px', fontWeight: 600 }}>OPTICAL FEED</span>
          </div>
          <div className="event-img-inspect-badge">INSPECT</div>
        </div>

        <div className="current-event-details">
          <div className="detail-row">
            <span className="detail-label">{t('time')}</span>
            <span className="detail-value">{activeEvt.time || activeEvt.timestamp}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('station')}</span>
            <span className="detail-value">{activeEvt.camera || activeEvt.camera_id}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Track ID</span>
            <span className="detail-value">{activeEvt.track_id || activeEvt.tracking_id || '?'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('confidence')}</span>
            <span className="detail-value">{activeEvt.confidence || 'AI'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('direction')}</span>
            <span className="detail-value">{activeEvt.direction || 'Boundary'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('speed')}</span>
            <span className="detail-value">{activeEvt.speed || 'Active'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('dwellTime')}</span>
            <span className="detail-value">{activeEvt.dwell_time || 'Recorded'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Distance</span>
            <span className="detail-value">{activeEvt.distance || 'Exclusion zone'}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: View Clip and Mark as Verified */}
      <div className="current-event-actions">
        <button
          className="btn-view-clip"
          onClick={() => onViewClip && onViewClip(activeEvt)}
        >
          {t('viewClip')}
        </button>
        <button
          className={`btn-verify ${isVerified ? 'verified' : ''}`}
          onClick={handleVerifyToggle}
          title={isVerified ? 'Event verified by operator' : 'Confirm and verify incident in database'}
        >
          {isVerified && <Check size={12} />}
          <span>{isVerified ? t('verified') : t('verify')}</span>
        </button>
      </div>
    </div>
  );
}
