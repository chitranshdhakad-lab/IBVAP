import React, { useState } from 'react';
import { Camera, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function EventTimeline({
  onSnapshotClick,
  onSeek,
  events = [],
  videoTimestamp = 0,
  duration = 180
}) {
  const { t } = useTranslation();
  const [scrubberPos, setScrubberPos] = useState(null);

  const effectiveProgress = duration > 0 ? Math.min(100, (videoTimestamp / duration) * 100) : 0;
  const currentPos = scrubberPos !== null ? scrubberPos : effectiveProgress;

  const handleTrackClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    setScrubberPos(pct);
    if (onSeek && duration > 0) {
      const seekSec = (pct / 100) * duration;
      onSeek(seekSec);
    }
  };

  const formatTickTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const ticks = [
    0,
    duration * 0.25,
    duration * 0.5,
    duration * 0.75,
    duration
  ];

  // Up to 6 recent snapshots with valid images
  const snapshots = events
    .filter((e) => e.snapshot_path)
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      src: e.snapshot_path,
      label: e.event || e.event_type || 'Perimeter Alert',
      time: e.time || e.timestamp || '—',
      severity: (e.severity || 'Low').toLowerCase(),
      event: e
    }));

  return (
    <div className="tactical-timeline-strip">
      {/* Top Header Line */}
      <div className="timeline-strip-top">
        <div className="strip-title-group">
          <Clock size={11} className="text-accent" />
          <span className="strip-title">{t('eventTimeline')}</span>
          <span className="strip-playback-time">
            [{formatTickTime(videoTimestamp)} / {formatTickTime(duration)}]
          </span>
        </div>

        <div className="timeline-legend-compact">
          <span className="leg-item"><span className="leg-dot bg-crit" /> {t('levelCritical')}</span>
          <span className="leg-item"><span className="leg-dot bg-mod" /> {t('levelModerate')}</span>
          <span className="leg-item"><span className="leg-dot bg-low" /> {t('levelLow')}</span>
        </div>
      </div>

      {/* Interactive Horizontal Scrubber Track */}
      <div className="timeline-ruler-track" onClick={handleTrackClick} title="Click anywhere along timeline to seek video">
        {events.slice(0, 12).map((evt, idx) => {
          const sev = (evt.severity || 'low').toLowerCase();
          const pinClass =
            sev === 'critical' ? 'pin-crit' :
            sev === 'high' ? 'pin-high' :
            sev === 'medium' ? 'pin-mod' : 'pin-low';

          const pinLeft = evt.video_timestamp && duration > 0
            ? `${Math.min(96, Math.max(3, (evt.video_timestamp / duration) * 100))}%`
            : `${8 + idx * 8}%`;

          return (
            <div
              key={evt.id || idx}
              className={`timeline-marker-pin ${pinClass}`}
              style={{ left: pinLeft }}
              title={`${evt.severity || 'Alert'}: ${evt.event} at ${evt.time} (Click to inspect snapshot)`}
              onClick={(e) => {
                e.stopPropagation();
                if (evt.video_timestamp !== undefined && onSeek) {
                  onSeek(evt.video_timestamp);
                }
                if (onSnapshotClick) onSnapshotClick(evt);
              }}
            />
          );
        })}

        {/* Current Scrubber Needle */}
        <div className="timeline-needle" style={{ left: `${currentPos}%` }} />
      </div>

      {/* Ticks Row & Snapshots Carousel */}
      <div className="timeline-strip-bottom">
        <div className="timeline-mini-ticks">
          {ticks.map((tVal, idx) => (
            <span key={idx}>{formatTickTime(tVal)}</span>
          ))}
        </div>

        <div className="timeline-snapshot-scroller">
          {snapshots.length > 0 ? (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className={`snap-card snap-sev-${snap.severity}`}
                onClick={() => onSnapshotClick && onSnapshotClick(snap.event)}
                title={`Open evidence for ${snap.label} (${snap.time})`}
              >
                <img
                  src={snap.src}
                  alt={snap.label}
                  className="snap-card-img"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/assets/snapshot-person.jpg';
                  }}
                />
                <div className="snap-card-meta">
                  <span className="snap-card-name">{snap.label}</span>
                  <span className="snap-card-time">{snap.time}</span>
                </div>
              </div>
            ))
          ) : (
            <span className="no-snaps-notice">
              <Camera size={11} style={{ opacity: 0.5, marginRight: '4px' }} />
              Active perimeter scanning — Evidence snapshots archive automatically on threat detection
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
