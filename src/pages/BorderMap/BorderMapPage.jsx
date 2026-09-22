import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Map as MapIcon, Layers, BarChart3, Bell, ZoomIn, ZoomOut, Compass,
  Box, Maximize2, Minimize2, Check, Video, Home, Shield, AlertTriangle,
  Radio, Car, ChevronDown, ChevronRight, ArrowRight, Eye, Navigation,
  X, ExternalLink, Activity
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

  // Sector selection: 'all', 'sector-a', 'sector-b', 'sector-c', 'sector-d'
  const [selectedSector, setSelectedSector] = useState('all');

  // Layer Visibility Toggles (all matching user screenshot)
  const [layers, setLayers] = useState({
    cameras: true,
    borderLine: true,
    restrictedZone: true,
    patrolRoutes: true,
    borderOutposts: true,
    watchTowers: true,
    keyLocations: true,
    terrainLabels: false
  });

  const [isLayersOpen, setIsLayersOpen] = useState(true);

  // Pan and Zoom Canvas State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [is3DTilt, setIs3DTilt] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapContainerRef = useRef(null);

  // Interactive Inspection States
  const [activeCameraModal, setActiveCameraModal] = useState(null);
  const [activeEventHotspot, setActiveEventHotspot] = useState(null);

  // Real camera count synchronization from backend
  const realTotalCameras = (cameras && cameras.length > 0) ? cameras.length : 5;
  const sectorACamCount = cameras.filter(c => {
    const s = (c.sector || '').toLowerCase();
    return s.includes('alpha') || s.includes('samba') || s === 'sector a' || c.id === 'CAM-01' || c.id === 'CAM-EVID-AUDIT';
  }).length || 2;
  const sectorBCamCount = cameras.filter(c => {
    const s = (c.sector || '').toLowerCase();
    return s.includes('bravo') || s.includes('rajouri') || s === 'sector b' || c.id === 'CAM-02';
  }).length || 1;
  const sectorCCamCount = cameras.filter(c => {
    const s = (c.sector || '').toLowerCase();
    return s.includes('charlie') || s.includes('naushera') || s === 'sector c' || c.id === 'CAM-03';
  }).length || 1;
  const sectorDCamCount = cameras.filter(c => {
    const s = (c.sector || '').toLowerCase();
    return s.includes('delta') || s.includes('surankote') || s === 'sector d' || c.id === 'CAM-04';
  }).length || 1;

  // Sector Data Presets with Calibration Coordinates & Area Statistics
  const SECTORS_DATA = {
    all: {
      name: 'All Sectors',
      label: 'All Sectors (Western Border Command)',
      pan: { x: 0, y: 0 },
      zoom: 1,
      stats: {
        totalCameras: realTotalCameras,
        borderOutposts: 12,
        watchTowers: 18,
        patrolRoutes: 6,
        sensitiveZones: 4,
        borderLength: '124 km'
      }
    },
    'sector-a': {
      name: 'Sector A (Samba)',
      label: 'Sector A — Samba Border Line',
      pan: { x: 120, y: 150 },
      zoom: 1.45,
      stats: {
        totalCameras: sectorACamCount,
        borderOutposts: 4,
        watchTowers: 6,
        patrolRoutes: 2,
        sensitiveZones: 1,
        borderLength: '36 km'
      }
    },
    'sector-b': {
      name: 'Sector B (Rajouri)',
      label: 'Sector B — Rajouri Forward Line',
      pan: { x: -40, y: -20 },
      zoom: 1.5,
      stats: {
        totalCameras: sectorBCamCount,
        borderOutposts: 5,
        watchTowers: 7,
        patrolRoutes: 2,
        sensitiveZones: 2,
        borderLength: '48 km'
      }
    },
    'sector-c': {
      name: 'Sector C (Naushera)',
      label: 'Sector C — Naushera River Belt',
      pan: { x: 80, y: -100 },
      zoom: 1.4,
      stats: {
        totalCameras: sectorCCamCount,
        borderOutposts: 2,
        watchTowers: 3,
        patrolRoutes: 1,
        sensitiveZones: 1,
        borderLength: '24 km'
      }
    },
    'sector-d': {
      name: 'Sector D (Surankote)',
      label: 'Sector D — Surankote High Ridge',
      pan: { x: -140, y: -180 },
      zoom: 1.6,
      stats: {
        totalCameras: sectorDCamCount,
        borderOutposts: 1,
        watchTowers: 2,
        patrolRoutes: 1,
        sensitiveZones: 0,
        borderLength: '16 km'
      }
    }
  };

  const currentStats = SECTORS_DATA[selectedSector]?.stats || SECTORS_DATA.all.stats;

  // Handle Sector Change
  const handleSectorChange = (sectorKey) => {
    setSelectedSector(sectorKey);
    const target = SECTORS_DATA[sectorKey];
    if (target) {
      setPan(target.pan);
      setZoom(target.zoom);
    }
  };

  // Zoom Helpers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.75));
  const handleResetCompass = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIs3DTilt(false);
  };

  // Mouse Pan Handlers
  const handleMouseDown = (e) => {
    if (e.target.closest('.map-control-floating') || e.target.closest('.map-legend-box')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Wheel Zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.75), 2.5));
  };

  // Toggle Fullscreen on map container
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (mapContainerRef.current?.requestFullscreen) {
        mapContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Calibrated positions for cameras along the border topology
  const CAM_POSITIONS = {
    'CAM-01': { code: 'RS-12', x: 258, y: 165, defSector: 'Sector A', defLoc: 'North Station / Samba' },
    'CAM-02': { code: 'RS-11', x: 390, y: 450, defSector: 'Sector C', defLoc: 'River Basin / Naushera' },
    'CAM-03': { code: 'RS-10', x: 346, y: 638, defSector: 'Sector B', defLoc: 'Ridge Line / Rajouri' },
    'CAM-04': { code: 'RS-04', x: 180, y: 780, defSector: 'Sector D', defLoc: 'Delta Pass / Surankote' },
    'CAM-EVID-AUDIT': { code: 'RS-09', x: 290, y: 320, defSector: 'Sector A', defLoc: 'Forward Audit Post' }
  };

  const activeCamSource = (cameras && cameras.length > 0) ? cameras : [
    { id: 'CAM-01', name: 'CAM-01 - North Perimeter', sector: 'Sector Alpha', status: 'ACTIVE' },
    { id: 'CAM-02', name: 'CAM-02 - River Crossing', sector: 'Sector Bravo', status: 'ACTIVE' },
    { id: 'CAM-03', name: 'CAM-03 - Ridge Line', sector: 'Sector Charlie', status: 'ACTIVE' },
    { id: 'CAM-04', name: 'CAM-04 - South Gate', sector: 'Sector Delta', status: 'IDLE' }
  ];

  const mapCameras = activeCamSource.map((cam, idx) => {
    const pos = CAM_POSITIONS[cam.id] || {
      code: `RS-${String(15 - idx).padStart(2, '0')}`,
      x: 210 + (idx * 55) % 550,
      y: 200 + (idx * 120) % 650,
      defSector: cam.sector || 'Sector A',
      defLoc: cam.location || 'Border Post'
    };
    const isOnline = (cam.status === 'ACTIVE' || cam.status === 'ONLINE' || cam.status === 'CONNECTED');
    return {
      id: cam.id,
      code: pos.code,
      name: cam.name || `${pos.code} (${cam.id})`,
      location: cam.location || pos.defLoc,
      x: pos.x,
      y: pos.y,
      sector: cam.sector || pos.defSector,
      status: isOnline ? 'ONLINE' : (cam.status || 'IDLE'),
      ip: `192.168.1.${101 + idx}`,
      fps: 30,
      res: '1920x1080'
    };
  });

  const watchTowers = [
    { id: 'WT-01', name: 'Watch Tower Alpha 1', x: 368, y: 205 },
    { id: 'WT-02', name: 'Watch Tower Bravo 4', x: 508, y: 520 },
    { id: 'WT-03', name: 'Watch Tower Charlie 2', x: 610, y: 680 }
  ];

  const borderOutposts = [
    { id: 'BOP-01', name: 'Border Outpost (BOP Alpha)', x: 352, y: 265, label: 'Border Outpost (BOP)' }
  ];

  const keyLocations = [
    { id: 'LOC-01', name: 'Samba', x: 138, y: 172 },
    { id: 'LOC-02', name: 'Naushera', x: 54, y: 405 },
    { id: 'LOC-03', name: 'Rajouri', x: 92, y: 535 },
    { id: 'LOC-04', name: 'Surankote', x: 258, y: 810 }
  ];

  // Tactical Recent Events Feed items matching the user screenshot
  const recentEventsData = [
    {
      id: 'evt-1',
      type: 'intrusion',
      title: 'Intrusion Alert',
      sectorDesc: 'Sector B - 1.2 km from IB',
      time: '10:21 AM',
      color: '#ef4444',
      hotspotId: 'HOTSPOT-01',
      x: 448,
      y: 415
    },
    {
      id: 'evt-2',
      type: 'movement',
      title: 'Movement Detected',
      sectorDesc: 'Sector C - Near River Belt',
      time: '09:47 AM',
      color: '#f59e0b',
      hotspotId: 'HOTSPOT-02',
      x: 472,
      y: 575
    },
    {
      id: 'evt-3',
      type: 'patrol',
      title: 'Patrol Update',
      sectorDesc: 'Sector A - Route Completed',
      time: '08:32 AM',
      color: '#3b82f6',
      hotspotId: null,
      x: 290,
      y: 220
    },
    {
      id: 'evt-4',
      type: 'camera',
      title: 'Camera Online',
      sectorDesc: 'RS-11 - Back to Online',
      time: '07:15 AM',
      color: '#10b981',
      hotspotId: null,
      x: 390,
      y: 450
    }
  ];

  // Click on a recent event centers the map on that position
  const handleEventClick = (evt) => {
    if (evt.x && evt.y) {
      setPan({
        x: (500 - evt.x) * 1.3,
        y: (400 - evt.y) * 1.3
      });
      setZoom(1.5);
    }
    setActiveEventHotspot(evt.hotspotId || evt.id);
  };

  // Open camera dossier
  const handleCameraClick = (cam) => {
    setActiveCameraModal(cam);
  };

  // Navigate to Live Monitor for this camera
  const handleOpenLiveMonitor = (camId) => {
    if (setSelectedCamera) {
      setSelectedCamera(camId);
    }
    if (onNavigateToTab) {
      onNavigateToTab('live-monitor');
    }
  };

  return (
    <div className="border-map-screen-wrapper">
      {/* 1. TOP HEADER & SECTOR SELECTOR */}
      <div className="border-map-top-header">
        <div className="border-map-header-left">
          <div className="border-map-icon-box">
            <MapIcon size={22} color="#f8fafc" />
          </div>
          <div>
            <h1 className="border-map-main-title">{t('borderMap')}</h1>
            <div className="border-map-breadcrumb">
              <span>Home</span>
              <ChevronRight size={12} />
              <span className="breadcrumb-active">Border Map</span>
            </div>
          </div>
        </div>

        <div className="border-map-header-right">
          <div className="sector-selector-container">
            <span className="sector-selector-label">Select Sector</span>
            <div className="sector-dropdown-wrap">
              <select
                className="sector-dropdown-select"
                value={selectedSector}
                onChange={(e) => handleSectorChange(e.target.value)}
              >
                <option value="all">All Sectors</option>
                <option value="sector-a">Sector A (Samba)</option>
                <option value="sector-b">Sector B (Rajouri)</option>
                <option value="sector-c">Sector C (Naushera)</option>
                <option value="sector-d">Sector D (Surankote)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN SPLIT LAYOUT: MAP VIEWPORT (LEFT) + TELEMETRY PANELS (RIGHT) */}
      <div className="border-map-layout-grid">
        {/* LEFT COLUMN: TACTICAL SATELLITE MAP VIEWPORT */}
        <div
          ref={mapContainerRef}
          className={`border-map-viewport ${is3DTilt ? 'tilt-3d' : ''} ${isDragging ? 'is-dragging' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* SATELLITE TERRAIN IMAGE BACKDROP */}
          <div
            className="border-map-canvas-stage"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
            <img
              src="/assets/border-satellite-terrain.jpg"
              alt="Border Satellite Topography"
              className="satellite-terrain-img"
              draggable="false"
            />

            {/* SVG OVERLAY WITH CALIBRATED TACTICAL VECTORS */}
            <svg
              className="tactical-vector-layer"
              viewBox="0 0 1000 950"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                {/* Diagonal Red Hatch Pattern for Restricted Buffer Zone */}
                <pattern
                  id="restrictedZoneHatch"
                  width="10"
                  height="10"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#ef4444" strokeWidth="2.2" strokeOpacity="0.85" />
                </pattern>

                {/* Tactical Radar Ping Filter */}
                <radialGradient id="radarPulseGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.7" />
                  <stop offset="60%" stopColor="#ef4444" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* 1. LAYER: RESTRICTED BUFFER ZONE (DIAGONAL HATCHED PATTERN) */}
              {layers.restrictedZone && (
                <g className="layer-restricted-zone">
                  <polygon
                    points="300,90 338,140 375,230 428,360 482,450 515,540 642,690 735,840 765,830 680,660 550,510 500,410 440,290 380,180 340,90"
                    fill="url(#restrictedZoneHatch)"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    strokeOpacity="0.8"
                  />
                  <polygon
                    points="300,90 338,140 375,230 428,360 482,450 515,540 642,690 735,840 765,830 680,660 550,510 500,410 440,290 380,180 340,90"
                    fill="rgba(239, 68, 68, 0.14)"
                  />
                </g>
              )}

              {/* 2. LAYER: RIVER / WATER BODY (WINDING BLUE ARTERY) */}
              <g className="layer-rivers">
                <path
                  d="M 285,75 Q 310,135 295,200 T 260,320 T 282,460 T 385,580 T 475,690 T 510,880"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 285,75 Q 310,135 295,200 T 260,320 T 282,460 T 385,580 T 475,690 T 510,880"
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </g>

              {/* 3. LAYER: ROADS NETWORK */}
              <g className="layer-roads">
                <path
                  d="M 120,180 Q 200,240 280,310 T 330,450 T 350,620 T 310,750 T 260,820"
                  fill="none"
                  stroke="#475569"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <path
                  d="M 120,180 Q 200,240 280,310 T 330,450 T 350,620 T 310,750 T 260,820"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="8 4"
                />
              </g>

              {/* 4. LAYER: PATROL ROUTES (DASHED WHITE / LIGHT GREY WITH PATROL CARS) */}
              {layers.patrolRoutes && (
                <g className="layer-patrol-routes">
                  {/* Route 1: North Patrol Corridor */}
                  <path
                    d="M 320,105 Q 355,175 365,260 T 410,380 T 440,510 T 470,620 T 560,780"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.4"
                    strokeDasharray="7 5"
                    strokeOpacity="0.9"
                  />
                  {/* Route 2: Secondary Intercept Track */}
                  <path
                    d="M 270,170 Q 330,230 380,330 T 415,500 T 470,650"
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    strokeOpacity="0.75"
                  />
                </g>
              )}

              {/* 5. LAYER: INTERNATIONAL BORDER LINE (SOLID BOLD RED) */}
              {layers.borderLine && (
                <g className="layer-border-line">
                  <path
                    d="M 300,90 Q 335,135 348,200 T 400,340 T 450,470 T 505,550 T 630,705 T 725,845"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="4"
                    strokeLinecap="round"
                    filter="drop-shadow(0px 0px 4px rgba(239, 68, 68, 0.7))"
                  />
                  {/* Text Label on Border */}
                  <text
                    x="355"
                    y="275"
                    fill="#f87171"
                    fontSize="11"
                    fontWeight="700"
                    letterSpacing="1"
                    transform="rotate(65 355 275)"
                    filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.9))"
                  >
                    International Border Line
                  </text>
                </g>
              )}

              {/* 6. LAYER: TERRITORY & TERRAIN LABELS */}
              <g className="layer-territory-labels">
                <text
                  x="155"
                  y="310"
                  fill="#ffffff"
                  fontSize="28"
                  fontWeight="800"
                  letterSpacing="3"
                  opacity="0.9"
                  filter="drop-shadow(0px 2px 6px rgba(0,0,0,0.95))"
                >
                  INDIA
                </text>
                <text
                  x="510"
                  y="245"
                  fill="#ffffff"
                  fontSize="28"
                  fontWeight="800"
                  letterSpacing="3"
                  opacity="0.85"
                  filter="drop-shadow(0px 2px 6px rgba(0,0,0,0.95))"
                >
                  PAKISTAN
                </text>
              </g>

              {/* 7. LAYER: KEY TOWN LOCATIONS */}
              {layers.keyLocations && (
                <g className="layer-key-locations">
                  {keyLocations.map((loc) => (
                    <g key={loc.id} className="key-location-marker">
                      <circle cx={loc.x} cy={loc.y} r="5" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
                      <text
                        x={loc.x + 9}
                        y={loc.y + 4}
                        fill="#ffffff"
                        fontSize="13"
                        fontWeight="600"
                        filter="drop-shadow(0px 1px 4px rgba(0,0,0,0.95))"
                      >
                        {loc.name}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* 8. LAYER: WATCH TOWERS */}
              {layers.watchTowers && (
                <g className="layer-watch-towers">
                  {watchTowers.map((wt) => (
                    <g key={wt.id} className="watch-tower-marker" transform={`translate(${wt.x - 12}, ${wt.y - 14})`}>
                      <rect x="0" y="0" width="24" height="24" rx="4" fill="rgba(15, 23, 42, 0.75)" stroke="#64748b" strokeWidth="1" />
                      {/* Tower Icon Path */}
                      <path
                        d="M 6,20 L 12,4 L 18,20 M 8,14 L 16,14 M 10,9 L 14,9"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}
                </g>
              )}

              {/* 9. LAYER: BORDER OUTPOSTS (BOP) */}
              {layers.borderOutposts && (
                <g className="layer-border-outposts">
                  {borderOutposts.map((bop) => (
                    <g key={bop.id} className="bop-marker" transform={`translate(${bop.x - 14}, ${bop.y - 14})`}>
                      <circle cx="14" cy="14" r="14" fill="rgba(15, 23, 42, 0.85)" stroke="#38bdf8" strokeWidth="1.5" />
                      {/* House / Outpost Icon */}
                      <path
                        d="M 8,17 L 8,13 L 14,8 L 20,13 L 20,17 Z"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="1.6"
                      />
                      <text
                        x="-20"
                        y="38"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="600"
                        filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.9))"
                      >
                        {bop.label}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* 10. LAYER: PATROL VEHICLES MOVING/STATIONED ALONG ROUTES */}
              {layers.patrolRoutes && (
                <g className="layer-patrol-vehicles">
                  {/* Vehicle 1 */}
                  <g transform="translate(438, 672)">
                    <circle cx="8" cy="8" r="10" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                    <path
                      d="M 4,9 L 6,6 L 10,6 L 12,9 L 12,11 L 4,11 Z"
                      fill="#ffffff"
                    />
                  </g>
                  {/* Vehicle 2 */}
                  <g transform="translate(524, 820)">
                    <circle cx="8" cy="8" r="10" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                    <path
                      d="M 4,9 L 6,6 L 10,6 L 12,9 L 12,11 L 4,11 Z"
                      fill="#ffffff"
                    />
                  </g>
                </g>
              )}

              {/* 11. LAYER: RECENT ACTIVITY HOTSPOTS & RADAR CIRCLES */}
              <g className="layer-threat-hotspots">
                {/* Hotspot 1: Animated Concentric Pulse Ring */}
                <g transform="translate(448, 415)">
                  <circle cx="0" cy="0" r="38" fill="url(#radarPulseGrad)" />
                  <circle cx="0" cy="0" r="28" fill="none" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6">
                    <animate attributeName="r" values="12;38;44" dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.3;0" dur="2.4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="0" cy="0" r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="2" filter="drop-shadow(0px 0px 6px #ef4444)" />
                </g>

                {/* Hotspot 2: Alert Triangle Badge (Near River Belt) */}
                <g
                  className="interactive-hotspot"
                  transform="translate(472, 575)"
                  onClick={() => handleEventClick({ x: 472, y: 575, hotspotId: 'HOTSPOT-02' })}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx="10" cy="10" r="18" fill="rgba(245, 158, 11, 0.25)" />
                  <polygon points="10,0 20,18 0,18" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                  <text x="8" y="15" fill="#000000" fontSize="12" fontWeight="900">!</text>
                </g>

                {/* Hotspot 3: Alert Triangle Badge (Caution Area) */}
                <g
                  className="interactive-hotspot"
                  transform="translate(535, 715)"
                  onClick={() => handleEventClick({ x: 535, y: 715, hotspotId: 'HOTSPOT-03' })}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx="10" cy="10" r="16" fill="rgba(245, 158, 11, 0.25)" />
                  <polygon points="10,2 19,18 1,18" fill="#eab308" stroke="#ffffff" strokeWidth="1.5" />
                  <text x="8" y="15" fill="#000000" fontSize="12" fontWeight="900">!</text>
                </g>
              </g>

              {/* 12. LAYER: TACTICAL CAMERAS (MATCHING EXACT GREEN RS-12, RS-11, RS-10 PINS) */}
              {layers.cameras && (
                <g className="layer-cameras">
                  {mapCameras.map((cam) => {
                    const isSelected = selectedCamera === cam.id;
                    return (
                      <g
                        key={cam.id}
                        className={`map-camera-pin ${isSelected ? 'active-cam' : ''}`}
                        transform={`translate(${cam.x - 14}, ${cam.y - 14})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCameraClick(cam);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Green Camera Box Pin */}
                        <rect
                          x="0"
                          y="0"
                          width="28"
                          height="28"
                          rx="6"
                          fill="#10b981"
                          stroke={isSelected ? '#ffffff' : '#059669'}
                          strokeWidth={isSelected ? '2.5' : '1.5'}
                          filter="drop-shadow(0px 2px 6px rgba(0,0,0,0.8))"
                        />
                        {/* Camera Lens Glyphs */}
                        <circle cx="14" cy="14" r="5.5" fill="#ffffff" />
                        <circle cx="14" cy="14" r="3" fill="#047857" />
                        <circle cx="19" cy="9" r="1.5" fill="#ffffff" />

                        {/* Station Tag Code Badge (e.g. RS-12) */}
                        <g transform="translate(0, 32)">
                          <rect
                            x="-4"
                            y="0"
                            width="36"
                            height="15"
                            rx="3"
                            fill="rgba(15, 23, 42, 0.85)"
                            stroke="rgba(255,255,255,0.2)"
                            strokeWidth="0.8"
                          />
                          <text
                            x="14"
                            y="11"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="700"
                            letterSpacing="0.5"
                          >
                            {cam.code}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* TOP-RIGHT FLOATING MAP TOOLS */}
          <div className="map-control-floating map-tools-stack">
            <button className="map-tool-btn" onClick={handleZoomIn} title="Zoom In (+)">
              <ZoomIn size={16} />
            </button>
            <button className="map-tool-btn" onClick={handleZoomOut} title="Zoom Out (−)">
              <ZoomOut size={16} />
            </button>
            <button className="map-tool-btn" onClick={handleResetCompass} title="Reset Orientation (Compass)">
              <Compass size={16} />
            </button>
            <button
              className={`map-tool-btn ${is3DTilt ? 'active' : ''}`}
              onClick={() => setIs3DTilt(!is3DTilt)}
              title="Toggle 3D Perspective Tilt"
            >
              <Box size={16} />
            </button>
            <button className="map-tool-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* BOTTOM-RIGHT DISTANCE SCALE BAR */}
          <div className="map-scale-bar-container">
            <div className="map-scale-ticks">
              <span>0</span>
              <span>5</span>
              <span>10</span>
              <span>20 km</span>
            </div>
            <div className="map-scale-line">
              <div className="scale-segment" />
              <div className="scale-segment active" />
              <div className="scale-segment" />
              <div className="scale-segment active" />
            </div>
          </div>

          {/* BOTTOM-LEFT FLOATING TACTICAL LEGEND BOX (MATCHING SCREENSHOT) */}
          <div className="map-legend-box">
            <div className="legend-items-list">
              <div className="legend-item">
                <span className="legend-line border-line" />
                <span className="legend-label">International Border</span>
              </div>
              <div className="legend-item">
                <span className="legend-box-hatched" />
                <span className="legend-label">Restricted Zone</span>
              </div>
              <div className="legend-item">
                <span className="legend-line patrol-line" />
                <span className="legend-label">Patrol Route</span>
              </div>
              <div className="legend-item">
                <span className="legend-line river-line" />
                <span className="legend-label">River / Water Body</span>
              </div>
              <div className="legend-item">
                <span className="legend-line road-line" />
                <span className="legend-label">Road</span>
              </div>
              <div className="legend-item">
                <div className="legend-icon-badge cam-badge">
                  <Video size={10} color="#ffffff" />
                </div>
                <span className="legend-label">Camera Location</span>
              </div>
              <div className="legend-item">
                <span className="legend-icon-text">🗼</span>
                <span className="legend-label">Watch Tower</span>
              </div>
              <div className="legend-item">
                <span className="legend-icon-text">🏠</span>
                <span className="legend-label">Border Outpost (BOP)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot-pulse" />
                <span className="legend-label">Recent Activity</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot-white" />
                <span className="legend-label">Key Location</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 CONTROL & TELEMETRY PANELS */}
        <div className="border-map-sidebar-panels">
          {/* PANEL 1: MAP LAYERS CHECKLIST */}
          <div className="map-sidebar-card">
            <div
              className="sidebar-card-header clickable"
              onClick={() => setIsLayersOpen(!isLayersOpen)}
            >
              <div className="card-header-left">
                <Layers size={18} color="#60a5fa" />
                <h3 className="card-title">Map Layers</h3>
              </div>
              <ChevronDown
                size={16}
                className={`collapse-chevron ${isLayersOpen ? 'open' : ''}`}
              />
            </div>

            {isLayersOpen && (
              <div className="map-layers-checklist">
                {[
                  { key: 'cameras', label: 'Cameras' },
                  { key: 'borderLine', label: 'Border Line' },
                  { key: 'restrictedZone', label: 'Restricted Zone' },
                  { key: 'patrolRoutes', label: 'Patrol Routes' },
                  { key: 'borderOutposts', label: 'Border Outposts (BOP)' },
                  { key: 'watchTowers', label: 'Watch Towers' },
                  { key: 'keyLocations', label: 'Key Locations' },
                  { key: 'terrainLabels', label: 'Terrain Labels' }
                ].map(({ key, label }) => {
                  const checked = layers[key];
                  return (
                    <label key={key} className="layer-checkbox-row">
                      <div
                        className={`custom-checkbox ${checked ? 'checked' : ''}`}
                        onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}
                      >
                        {checked && <Check size={12} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <span className="checkbox-label" onClick={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))}>
                        {label}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* PANEL 2: AREA STATISTICS (SELECTED VIEW) */}
          <div className="map-sidebar-card">
            <div className="sidebar-card-header">
              <div className="card-header-left">
                <BarChart3 size={18} color="#38bdf8" />
                <h3 className="card-title">Area Statistics <span className="view-sublabel">(Selected View)</span></h3>
              </div>
            </div>

            <div className="area-statistics-list">
              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <Video size={14} className="stat-icon" color="#94a3b8" />
                  <span>Total Cameras</span>
                </div>
                <span className="stat-value">{currentStats.totalCameras}</span>
              </div>

              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <Home size={14} className="stat-icon" color="#94a3b8" />
                  <span>Border Outposts</span>
                </div>
                <span className="stat-value">{currentStats.borderOutposts}</span>
              </div>

              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <span className="stat-icon-emoji">🗼</span>
                  <span>Watch Towers</span>
                </div>
                <span className="stat-value">{currentStats.watchTowers}</span>
              </div>

              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <span className="stat-icon-emoji">〰️</span>
                  <span>Patrol Routes</span>
                </div>
                <span className="stat-value">{currentStats.patrolRoutes}</span>
              </div>

              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <span className="stat-icon-hatched" />
                  <span>Sensitive Zones</span>
                </div>
                <span className="stat-value">{currentStats.sensitiveZones}</span>
              </div>

              <div className="statistic-row">
                <div className="stat-label-wrap">
                  <span className="stat-icon-emoji">📏</span>
                  <span>Total Border Length (in view)</span>
                </div>
                <span className="stat-value bold-metric">{currentStats.borderLength}</span>
              </div>
            </div>
          </div>

          {/* PANEL 3: RECENT EVENTS (MAP VIEW) */}
          <div className="map-sidebar-card">
            <div className="sidebar-card-header">
              <div className="card-header-left">
                <Bell size={18} color="#f59e0b" />
                <h3 className="card-title">Recent Events <span className="view-sublabel">(Map View)</span></h3>
              </div>
              <button
                className="btn-view-all-events"
                onClick={() => onNavigateToTab && onNavigateToTab('events-alerts')}
              >
                <span>View All</span>
                <ArrowRight size={12} />
              </button>
            </div>

            <div className="recent-events-list">
              {recentEventsData.map((evt) => (
                <div
                  key={evt.id}
                  className={`map-event-item ${activeEventHotspot === evt.hotspotId ? 'selected-event' : ''}`}
                  onClick={() => handleEventClick(evt)}
                >
                  <div
                    className="event-icon-badge"
                    style={{ backgroundColor: `${evt.color}20`, borderColor: evt.color }}
                  >
                    {evt.type === 'intrusion' && <AlertTriangle size={14} color={evt.color} />}
                    {evt.type === 'movement' && <Activity size={14} color={evt.color} />}
                    {evt.type === 'patrol' && <Car size={14} color={evt.color} />}
                    {evt.type === 'camera' && <Video size={14} color={evt.color} />}
                  </div>

                  <div className="event-info-col">
                    <div className="event-title" style={{ color: evt.color }}>
                      {evt.title}
                    </div>
                    <div className="event-sector">
                      {evt.sectorDesc}
                    </div>
                  </div>

                  <div className="event-timestamp">
                    {evt.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. TACTICAL CAMERA DOSSIER MODAL (WHEN A CAMERA MARKER IS CLICKED) */}
      {activeCameraModal && (
        <div className="modal-backdrop-c4isr" onClick={() => setActiveCameraModal(null)}>
          <div className="modal-tactical-dossier" onClick={(e) => e.stopPropagation()}>
            <div className="modal-dossier-header">
              <div className="modal-header-left">
                <div className="cam-status-dot online" />
                <div>
                  <h3 className="modal-cam-title">{activeCameraModal.name}</h3>
                  <span className="modal-cam-sub">Station ID: {activeCameraModal.id} // {activeCameraModal.sector}</span>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setActiveCameraModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-dossier-body">
              <div className="dossier-grid">
                <div className="dossier-field">
                  <span className="field-key">Operational Status:</span>
                  <span className="field-val status-badge-online">ACTIVE / ONLINE</span>
                </div>
                <div className="dossier-field">
                  <span className="field-key">IP Endpoint:</span>
                  <span className="field-val">{activeCameraModal.ip}</span>
                </div>
                <div className="dossier-field">
                  <span className="field-key">Resolution:</span>
                  <span className="field-val">{activeCameraModal.res}</span>
                </div>
                <div className="dossier-field">
                  <span className="field-key">Target FPS:</span>
                  <span className="field-val">{activeCameraModal.fps} FPS</span>
                </div>
              </div>

              {/* Feed Preview Thumbnail */}
              <div className="dossier-preview-box">
                <img
                  src="/assets/border-feed-analysis.jpg"
                  alt="Live Camera Feed Preview"
                  className="feed-preview-thumbnail"
                />
                <div className="feed-live-overlay">
                  <span className="live-pill">● LIVE OPTICAL FEED</span>
                  <span className="time-pill">{new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <div className="modal-dossier-footer">
              <button
                className="btn-open-live-monitor"
                onClick={() => {
                  handleOpenLiveMonitor(activeCameraModal.id);
                  setActiveCameraModal(null);
                }}
              >
                <Video size={16} />
                <span>Open in Live Monitor</span>
                <ExternalLink size={14} />
              </button>
              <button
                className="btn-dismiss-modal"
                onClick={() => setActiveCameraModal(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
