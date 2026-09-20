import React, { useState } from 'react';
import {
  MapPin, Shield, Camera, AlertTriangle, Layers, Navigation,
  Crosshair, Radio, CheckCircle, Info, ArrowLeft
} from 'lucide-react';

import { useTranslation } from '../../services/i18n.js';

export default function BorderMapPage({
  cameras = [],
  selectedCamera,
  setSelectedCamera,
  eventsList = [],
  onNavigateToTab
}) {
  const { t } = useTranslation();
  const [activeLayer, setActiveLayer] = useState('all'); // 'all', 'zones', 'cameras', 'incidents'
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Calibrated layout positions for Sector Alpha border stations
  const cameraCoordinates = {
    'CAM-01': { x: 38, y: 44, calibrated: true, gps: '32.114° N, 74.891° E' },
    'CAM-02': { x: 58, y: 55, calibrated: true, gps: '32.138° N, 74.912° E' },
    'CAM-03': { x: 74, y: 38, calibrated: true, gps: '32.162° N, 74.935° E' },
    'CAM-04': { x: 22, y: 68, calibrated: true, gps: '32.091° N, 74.872° E' }
  };

  const selectedCamData = cameras.find(c => c.id === selectedCamera) || cameras[0] || {};
  const currentCoords = cameraCoordinates[selectedCamera] || { calibrated: false };

  // Filtered active incidents
  const activeIncidents = eventsList.slice(0, 8);

  return (
    <div className="border-map-page">
      {/* 1. Header */}
      <div className="tab-page-header">
        <div>
          <h2 className="tab-page-title">{t('borderMap')}</h2>
          <p className="tab-page-desc">
            {t('tagline')} — Multi-sector perimeter topology with restricted zones and incident localization.
          </p>
        </div>

        <div className="tab-header-actions">
          <div className="layer-selector-group">
            <Layers size={13} style={{ color: '#94a3b8' }} />
            <button
              className={`layer-btn ${activeLayer === 'all' ? 'active' : ''}`}
              onClick={() => setActiveLayer('all')}
            >
              All Layers
            </button>
            <button
              className={`layer-btn ${activeLayer === 'zones' ? 'active' : ''}`}
              onClick={() => setActiveLayer('zones')}
            >
              Restricted Zones
            </button>
            <button
              className={`layer-btn ${activeLayer === 'incidents' ? 'active' : ''}`}
              onClick={() => setActiveLayer('incidents')}
            >
              Active Incidents
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Map Canvas & Sector Telemetry */}
      <div className="tactical-map-layout">
        <div className="tactical-map-viewport">
          <svg className="tactical-svg-canvas" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="tacticalGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#tacticalGrid)" />

            {/* Configured International Border Line */}
            <path
              d="M 50,420 L 250,400 L 450,430 L 700,390 L 950,410"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              strokeDasharray="6,4"
            />
            <text x="80" y="440" fill="#ef4444" fontSize="10" fontFamily="monospace" fontWeight="bold">
              INTERNATIONAL BORDER FENCE LINE (ZERO LINE)
            </text>

            {/* Configured Restricted Perimeter Buffer Zone */}
            {(activeLayer === 'all' || activeLayer === 'zones') && (
              <polygon
                points="100,280 480,330 460,420 80,390"
                fill="rgba(239, 68, 68, 0.12)"
                stroke="#dc2626"
                strokeWidth="1.5"
                strokeDasharray="4,3"
              />
            )}
            <text x="120" y="320" fill="#fca5a5" fontSize="10" fontFamily="monospace">
              RESTRICTED BUFFER ZONE #01 (SECTOR ALPHA)
            </text>

            {/* Secondary Buffer Zone for River Crossing */}
            {(activeLayer === 'all' || activeLayer === 'zones') && (
              <polygon
                points="520,310 750,290 730,380 500,370"
                fill="rgba(245, 158, 11, 0.12)"
                stroke="#d97706"
                strokeWidth="1.5"
                strokeDasharray="4,3"
              />
            )}
            <text x="530" y="335" fill="#fcd34d" fontSize="10" fontFamily="monospace">
              BUFFER ZONE #02 (RIVER TRANSIT)
            </text>

            {/* Station Markers */}
            {cameras.map((cam) => {
              const coords = cameraCoordinates[cam.id] || { x: 50, y: 50 };
              const px = (coords.x / 100) * 1000;
              const py = (coords.y / 100) * 600;
              const isSelected = cam.id === selectedCamera;
              const isOnline = cam.status === 'ACTIVE';

              return (
                <g
                  key={cam.id}
                  transform={`translate(${px}, ${py})`}
                  onClick={() => setSelectedCamera(cam.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Selection Pulse Ring */}
                  {isSelected && (
                    <circle r="22" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.6">
                      <animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Camera Icon Base */}
                  <circle
                    r="14"
                    fill={isOnline ? '#1b3022' : '#1e293b'}
                    stroke={isSelected ? '#22c55e' : isOnline ? '#34d399' : '#64748b'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />

                  {/* Icon Center */}
                  <circle
                    r="4"
                    fill={isSelected ? '#22c55e' : isOnline ? '#10b981' : '#94a3b8'}
                  />

                  {/* Station Label */}
                  <text
                    x="20"
                    y="4"
                    fill={isSelected ? '#22c55e' : '#f1f5f9'}
                    fontSize="11"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    fontFamily="monospace"
                  >
                    {cam.id}
                  </text>
                  <text
                    x="20"
                    y="16"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="sans-serif"
                  >
                    {cam.sector} ({isOnline ? 'ONLINE' : 'OFFLINE'})
                  </text>
                </g>
              );
            })}

            {/* Active Incident Markers */}
            {(activeLayer === 'all' || activeLayer === 'incidents') && activeIncidents.map((evt, idx) => {
              const camCoords = cameraCoordinates[evt.camera] || { x: 40, y: 40 };
              const offsetX = (idx % 3) * 20 - 20;
              const offsetY = Math.floor(idx / 3) * 20 - 20;
              const px = (camCoords.x / 100) * 1000 + offsetX;
              const py = (camCoords.y / 100) * 600 + offsetY + 25;

              return (
                <g
                  key={evt.id}
                  transform={`translate(${px}, ${py})`}
                  onClick={() => setSelectedIncident(evt)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle r="7" fill="#dc2626" stroke="#ffffff" strokeWidth="1.5">
                    <animate attributeName="r" values="6;9;6" dur="1.2s" repeatCount="indefinite" />
                  </circle>
                  <text x="10" y="4" fill="#fca5a5" fontSize="9" fontWeight="bold">
                    ! #{evt.id}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Calibrated Coordinates HUD Overlay */}
          <div className="map-hud-overlay">
            <div className="map-hud-item">
              <span className="hud-label">SELECTED STATION</span>
              <span className="hud-val">{selectedCamData.id || 'CAM-01'}</span>
            </div>
            <div className="map-hud-item">
              <span className="hud-label">GEODETIC POSITION</span>
              <span className="hud-val">
                {currentCoords.calibrated ? currentCoords.gps : 'LOCATION NOT CONFIGURED'}
              </span>
            </div>
            <div className="map-hud-item">
              <span className="hud-label">HARDWARE STATUS</span>
              <span className={`hud-val ${selectedCamData.status === 'ACTIVE' ? 'text-green' : 'text-gray'}`}>
                {selectedCamData.status === 'ACTIVE' ? 'CONNECTED / ACTIVE' : 'OFFLINE / NOT CONNECTED'}
              </span>
            </div>
          </div>
        </div>

        {/* Tactical Station Inspector Sidebar */}
        <div className="tactical-station-sidebar">
          <div className="station-sidebar-header">
            <Crosshair size={15} color="#22c55e" />
            <h3>Station Telemetry: {selectedCamData.id}</h3>
          </div>

          <div className="station-spec-card">
            <div className="spec-row">
              <span className="spec-label">Station Name</span>
              <span className="spec-val">{selectedCamData.name}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Assigned Sector</span>
              <span className="spec-val">{selectedCamData.sector}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Deployment Post</span>
              <span className="spec-val">{selectedCamData.location}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Feed Protocol</span>
              <span className="spec-val">{selectedCamData.source_type || 'FILE (MP4 Feed)'}</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Geographic Coords</span>
              <span className="spec-val">
                {currentCoords.calibrated ? currentCoords.gps : (
                  <span className="text-warning">LOCATION NOT CONFIGURED</span>
                )}
              </span>
            </div>
          </div>

          <div className="station-actions-box">
            <button
              className="btn-primary full-width"
              onClick={() => onNavigateToTab('live-monitor')}
            >
              Open in Live Monitor
            </button>
            <button
              className="btn-secondary full-width"
              onClick={() => onNavigateToTab('camera-management')}
            >
              Configure Station Hardware
            </button>
          </div>

          {/* Active Sector Incidents List */}
          <div className="station-incidents-list">
            <h4>Active Sector Events ({activeIncidents.filter(e => e.camera === selectedCamera).length})</h4>
            {activeIncidents.filter(e => e.camera === selectedCamera).length === 0 ? (
              <div className="empty-incidents-note">
                <CheckCircle size={14} color="#22c55e" /> No active alerts at this post
              </div>
            ) : (
              activeIncidents
                .filter(e => e.camera === selectedCamera)
                .map(evt => (
                  <div key={evt.id} className="sector-incident-chip" onClick={() => setSelectedIncident(evt)}>
                    <AlertTriangle size={12} color="#ef4444" />
                    <span className="incident-name">{evt.event}</span>
                    <span className="incident-time">{evt.time}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Incident Detail Popup */}
      {selectedIncident && (
        <div className="incident-map-popup">
          <div className="popup-header">
            <b>Incident #{selectedIncident.id} — {selectedIncident.event}</b>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button className="popup-back-btn" onClick={() => setSelectedIncident(null)}>
                <ArrowLeft size={11} /> Back
              </button>
              <button onClick={() => setSelectedIncident(null)}>×</button>
            </div>
          </div>

          <div className="popup-body">
            <div>Station: <b>{selectedIncident.camera}</b></div>
            <div>Target: <b>{selectedIncident.object}</b></div>
            <div>Severity: <b className="text-danger">{selectedIncident.severity}</b></div>
            <div>Risk Score: <b>{selectedIncident.risk_score}/100</b></div>
          </div>
        </div>
      )}
    </div>
  );
}
