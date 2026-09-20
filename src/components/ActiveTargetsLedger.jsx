import React from 'react';
import { User, Car, PawPrint, Compass, Clock, Gauge, Radar } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function ActiveTargetsLedger({
  activeEntities = [],
  analysisActive = false,
  selectedCamera = 'CAM-01',
  threatAssessment = {}
}) {
  const { t, settings } = useTranslation();

  // Strict extra filter against disabled detection classes
  const displayedTargets = (activeEntities || []).filter((ent) => {
    const cat = (ent.category || '').toLowerCase();
    const cls = (ent.class || ent.object_class || '').toLowerCase();
    if ((cat === 'person' || cls === 'person') && settings.personDetection === false) return false;
    if ((cat === 'vehicle' || ['car', 'truck', 'bus', 'vehicle', 'motorcycle'].includes(cls)) && settings.vehicleDetection === false) return false;
    if ((cat === 'animal' || ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'].includes(cls)) && settings.animalDetection === false) return false;
    if (cat !== 'person' && cat !== 'vehicle' && cat !== 'animal' && settings.unknownObjectDetection === false) return false;
    return true;
  });

  const targetCount = displayedTargets.length;

  return (
    <div className="bottom-card active-targets-ledger-card">
      <div className="card-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="section-label">{t('targetLedger')}</span>
          <span className={`live-pulse-badge ${targetCount > 0 ? 'pulse-alert' : 'pulse-nominal'}`}>
            <span className="pulse-dot" />
            {targetCount > 0 ? `${targetCount} ${t('activeTargets')}` : t('scanning')}
          </span>
        </div>
        <span className="radar-channel-id">{selectedCamera} GRID</span>
      </div>

      {targetCount > 0 ? (
        <div className="targets-ledger-list">
          {displayedTargets.map((ent, idx) => {
            const tid = ent.tracking_id || (idx + 1);
            const rawCls = (ent.class || 'person').toLowerCase();
            const conf = ent.confidence || 0.75;
            const confPercent = Math.round(conf * 100);
            const speed = ent.speed || 'Est. 12 px/s';
            const direction = ent.direction || 'Towards Fence';
            const dwell = ent.dwell_time || '2.4s';
            const isBreaching = ent.is_breaching || direction.toLowerCase().includes('fence') || (threatAssessment?.score || 0) > 40;

            return (
              <div key={tid} className={`target-ledger-item ${isBreaching ? 'item-breaching' : ''}`}>
                <div className="target-item-top">
                  <div className="target-id-badge">
                    {rawCls === 'vehicle' ? <Car size={11} /> : rawCls === 'animal' ? <PawPrint size={11} /> : <User size={11} />}
                    <span>TRK #{tid}</span>
                    <span className="target-class-tag">{rawCls.toUpperCase()}</span>
                  </div>
                  <span className={`target-risk-tag ${isBreaching ? 'risk-warn' : 'risk-ok'}`}>
                    {isBreaching ? 'PERIMETER THREAT' : 'TRACKING'}
                  </span>
                </div>

                {/* Confidence Bar */}
                <div className="target-conf-row">
                  <span className="conf-label">{t('confidence')}: {confPercent}%</span>
                  <div className="conf-bar-bg">
                    <div
                      className="conf-bar-fill"
                      style={{
                        width: `${confPercent}%`,
                        backgroundColor: confPercent > 70 ? '#22c55e' : '#f59e0b'
                      }}
                    />
                  </div>
                </div>

                {/* Vector Metrics Grid */}
                <div className="target-metrics-grid">
                  <div className="metric-chip">
                    <Compass size={10} className="chip-icon" />
                    <span>{direction}</span>
                  </div>
                  <div className="metric-chip">
                    <Gauge size={10} className="chip-icon" />
                    <span>{speed}</span>
                  </div>
                  <div className="metric-chip">
                    <Clock size={10} className="chip-icon" />
                    <span>{dwell}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="radar-standby-container">
          <div className="radar-sweep-visual">
            <div className="radar-ring radar-ring-3" />
            <div className="radar-ring radar-ring-2" />
            <div className="radar-ring radar-ring-1" />
            <div className="radar-crosshair-h" />
            <div className="radar-crosshair-v" />
            <div className="radar-scanner-line" />
            <Radar size={16} className="radar-center-icon" />
          </div>

          <div className="radar-status-text">
            <div className="radar-title">
              {analysisActive
                ? (settings.personDetection === false ? 'SECTOR SCANNING (PERSON DETECTION OFF)' : 'SECTOR SCANNING (ZERO TARGETS)')
                : 'PERIMETER GRID STANDBY'}
            </div>
            <div className="radar-sub">
              {analysisActive
                ? 'ByteTrack active on current video timeline. Bounding box HUD armed.'
                : 'Sensor matrix ready. Start analysis to engage target tracking.'}
            </div>
          </div>

          <div className="radar-zones-mini">
            <div className="zone-mini-item">
              <span className="zone-dot zone-dot-green" />
              <span>Zone A: CLEAR</span>
            </div>
            <div className="zone-mini-item">
              <span className="zone-dot zone-dot-cyan" />
              <span>Fence: ARMED</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
