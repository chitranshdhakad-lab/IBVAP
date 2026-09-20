import React, { useState } from 'react';
import { Camera, MapPin, Eye, Satellite } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function BorderMap({
  cameras = [],
  selectedCamera = 'CAM-01',
  onSelectCamera,
  onExpand
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'satellite'

  const camList = cameras.length > 0 ? cameras : [
    { id: 'CAM-01', name: 'North Perimeter', status: 'ACTIVE', x: 38, y: 44 },
    { id: 'CAM-02', name: 'River Crossing', status: 'ACTIVE', x: 62, y: 55 },
    { id: 'CAM-03', name: 'Ridge Line', status: 'ACTIVE', x: 80, y: 35 },
    { id: 'CAM-04', name: 'South Gate', status: 'IDLE', x: 22, y: 70 }
  ];

  return (
    <div className="map-card">
      {/* Header with Title and Map/Satellite Segmented Tabs */}
      <div className="map-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="section-label" style={{ marginBottom: 0 }}>{t('borderSectorMap')}</span>
          <span style={{ fontSize: '9px', color: '#656d66', fontWeight: 600 }}>[{t('fixedPosts')}]</span>
        </div>
        <div className="map-tabs">
          <button
            className={`map-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            {t('tacticalMap')}
          </button>
          <button
            className={`map-tab-btn ${activeTab === 'satellite' ? 'active' : ''}`}
            onClick={() => setActiveTab('satellite')}
          >
            {t('orthophoto')}
          </button>
        </div>
      </div>

      {/* Map Graphic Display */}
      <div className="map-visual-container" style={{ position: 'relative', overflow: 'hidden' }}>
        {activeTab === 'map' ? (
          /* Tactical Sector SVG Grid Map */
          <svg viewBox="0 0 100 65" className="map-visual-img" style={{ backgroundColor: '#131a14' }}>
            {/* Grid Lines */}
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#222d24" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100" height="65" fill="url(#grid)" />

            {/* Terrain Contours */}
            <path
              d="M0,25 Q30,15 60,30 T100,20 L100,65 L0,65 Z"
              fill="#18221a"
              opacity="0.6"
            />

            {/* Restricted Zone Polygon */}
            <polygon
              points="10,25 60,32 55,48 10,40"
              fill="rgba(220, 38, 38, 0.2)"
              stroke="#ef4444"
              strokeWidth="0.6"
              strokeDasharray="1.5,1"
            />
            <text x="18" y="38" fill="#f87171" fontSize="2.5" fontWeight="bold">
              RESTRICTED BUFFER ZONE
            </text>

            {/* International Border Line */}
            <line
              x1="0"
              y1="36"
              x2="100"
              y2="36"
              stroke="#22c55e"
              strokeWidth="0.8"
              strokeDasharray="2,1"
            />
            <text x="75" y="34" fill="#4ade80" fontSize="2.2" fontWeight="bold">
              BORDER LINE (IB)
            </text>

            {/* Camera Station Nodes */}
            {camList.map((cam, idx) => {
              const cx = cam.x || 25 + idx * 22;
              const cy = cam.y || 42 - (idx % 2) * 12;
              const isOnline = cam.status === 'ACTIVE';
              const isSelected = selectedCamera === cam.id;
              return (
                <g
                  key={cam.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectCamera && onSelectCamera(cam.id)}
                >
                  {/* Selected ring */}
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="4.2"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="0.8"
                    />
                  )}

                  {/* Pulse ring for active stations */}
                  {isOnline && !isSelected && (
                    <circle cx={cx} cy={cy} r="3" fill="none" stroke="#22c55e" strokeWidth="0.3" opacity="0.7">
                      <animate attributeName="r" values="2;5;2" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0;0.8" dur="3s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="2"
                    fill={isSelected ? '#f59e0b' : isOnline ? '#22c55e' : '#9ca3af'}
                    stroke="#ffffff"
                    strokeWidth="0.5"
                  />
                  <text
                    x={cx}
                    y={cy - 3.2}
                    fill={isSelected ? '#fbbf24' : '#ffffff'}
                    fontSize="2.4"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {cam.id}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          /* Calibrated Aerial Orthophoto Image */
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <img
              src="/assets/map-view.png"
              alt="Calibrated Aerial Orthophoto (Sector Reference)"
              className="map-visual-img"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute',
              bottom: '4px',
              right: '6px',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: '#d1d5db',
              fontSize: '8px',
              padding: '2px 5px',
              borderRadius: '2px'
            }}>
              Calibrated Fixed Base (Optical Sensor Grid)
            </div>
          </div>
        )}
      </div>

      {/* Legend Below Map */}
      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-dot-camera"></span>
          <span>Optical Station</span>
        </div>
        <div className="legend-item">
          <span className="legend-dash-border"></span>
          <span>Border Line</span>
        </div>
        <div className="legend-item">
          <span className="legend-dash-restricted"></span>
          <span>Restricted Zone</span>
        </div>
      </div>
    </div>
  );
}
