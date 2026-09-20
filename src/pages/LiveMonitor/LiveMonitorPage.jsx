import React, { useState, useEffect } from 'react';
import VideoPanel from '../../components/VideoPanel.jsx';
import IntelligencePanel from '../../components/IntelligencePanel.jsx';
import ThreatAssessment from '../../components/ThreatAssessment.jsx';
import BorderMap from '../../components/BorderMap.jsx';
import CurrentEvent from '../../components/CurrentEvent.jsx';
import RecentEvents from '../../components/RecentEvents.jsx';
import EventTimeline from '../../components/EventTimeline.jsx';
import ActiveTargetsLedger from '../../components/ActiveTargetsLedger.jsx';
import { Camera, Activity, AlertTriangle, Shield, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import { getStoredSettings, subscribeSettings } from '../../services/settingsManager.js';
import { useTranslation } from '../../services/i18n.js';

export default function LiveMonitorPage({
  selectedCamera,
  setSelectedCamera,
  cameras,
  selectedVideo,
  setSelectedVideo,
  videos,
  onVideoUploaded,
  onVideoDeleted,
  analysisMode,
  setAnalysisMode,
  activeEntities,
  videoTimestamp,
  analysisActive,
  jobStatus,
  frameIndex,
  totalFrames,
  onToggleAnalysis,
  seekTargetTime,
  sendCommand,
  liveIntelligence,
  threatAssessment,
  eventsList,
  currentEvent,
  onVerifyEvent,
  onSelectEvent,
  onOpenSnapshot,
  onNavigateToTab
}) {
  const { t } = useTranslation();
  const [speedMode, setSpeedMode] = useState('fast');
  const [monitorSettings, setMonitorSettings] = useState(getStoredSettings);

  useEffect(() => {
    const unsub = subscribeSettings((updated) => {
      setMonitorSettings(updated);
    });
    return unsub;
  }, []);

  // Selected camera record & video duration
  const currentCam = cameras.find(c => c.id === selectedCamera) || cameras[0] || {};
  const isCamActive = currentCam.status === 'ACTIVE';
  const currentVid = (videos || []).find(v => v.filename === selectedVideo || v.id === selectedVideo);
  const currentDuration = currentVid?.duration || 180;

  const handleStartWithSpeed = () => {
    if (onToggleAnalysis) {
      onToggleAnalysis(speedMode);
    }
  };

  return (
    <div className="live-monitor-page-viewport">
      {/* 1. Camera Quick-Selector Bar */}
      <div className="live-monitor-camera-bar">
        <div className="cam-bar-left">
          <Camera size={13} className="cam-bar-icon" />
          <span className="cam-bar-label">{t('tacticalFeed')}</span>
          <div className="cam-quick-chips">
            {cameras.map((cam) => {
              const isSelected = cam.id === selectedCamera;
              const isOnline = cam.status === 'ACTIVE';
              return (
                <button
                  key={cam.id}
                  className={`cam-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedCamera(cam.id)}
                  title={`${cam.name} (${cam.sector}) - ${isOnline ? 'ONLINE' : 'NOT CONNECTED'}`}
                >
                  <span className={`cam-chip-dot ${isOnline ? 'dot-online' : 'dot-offline'}`} />
                  <span className="cam-chip-id">{cam.id}</span>
                  <span className="cam-chip-sector">{cam.sector?.replace('Sector ', 'Sec-')}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="cam-bar-right">
          {/* Analysis Speed Selector */}
          <div className="cam-status-badge speed-badge-container">
            <Zap size={11} className="speed-icon" />
            <span className="cam-status-label">{t('analysisSpeed')}</span>
            <div className="speed-chips-group">
              <button
                type="button"
                className={`speed-chip ${speedMode === 'realtime' ? 'active' : ''}`}
                onClick={() => setSpeedMode('realtime')}
                title="1x Real-time video clock"
              >
                1x
              </button>
              <button
                type="button"
                className={`speed-chip ${speedMode === 'fast' ? 'active' : ''}`}
                onClick={() => setSpeedMode('fast')}
                title="2x Fast Surveillance Analysis (Recommended)"
              >
                2x Fast
              </button>
              <button
                type="button"
                className={`speed-chip ${speedMode === 'max' ? 'active' : ''}`}
                onClick={() => setSpeedMode('max')}
                title="4x High-Speed Rapid Sector Scan"
              >
                4x Max
              </button>
            </div>
          </div>

          <div className="cam-status-badge">
            <span className="cam-status-label">{t('statusLabel')}</span>
            <span className={`cam-status-val ${isCamActive ? 'val-online' : 'val-offline'}`}>
              {isCamActive ? t('connected') : t('offline')}
            </span>
          </div>
          <div className="cam-status-badge">
            <span className="cam-status-label">{t('processingLabel')}</span>
            <span className={`cam-status-val ${analysisActive ? 'val-processing' : 'val-idle'}`}>
              {analysisActive ? `${t('running')} (${jobStatus})` : t('noActiveAnalysis')}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Screen Layout (Strict Single-Viewport, Zero Scroll) */}
      <div className="live-monitor-main-grid">
        {/* Left Main Stage (72% width): Video + Tactical Timeline & Snapshots */}
        <div className="live-monitor-left-stage">
          <div className="live-monitor-video-slot">
            <VideoPanel
              selectedCamera={selectedCamera}
              setSelectedCamera={setSelectedCamera}
              cameras={cameras}
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
              videos={videos}
              onVideoUploaded={onVideoUploaded}
              onVideoDeleted={onVideoDeleted}
              analysisMode={analysisMode}
              setAnalysisMode={setAnalysisMode}
              activeEntities={activeEntities}
              videoTimestamp={videoTimestamp}
              analysisActive={analysisActive}
              jobStatus={jobStatus}
              frameIndex={frameIndex}
              totalFrames={totalFrames}
              onToggleAnalysis={handleStartWithSpeed}
              seekTarget={seekTargetTime}
              sendCommand={sendCommand}
              speedMode={speedMode}
            />
          </div>

          {/* Sleek Compact Tactical Timeline & Evidence Snapshots Strip */}
          <div className="live-monitor-timeline-slot">
            <EventTimeline
              events={eventsList}
              videoTimestamp={videoTimestamp}
              duration={currentDuration}
              onSeek={(secs) => {
                if (sendCommand) sendCommand({ action: 'seek', timestamp: secs });
              }}
              onSnapshotClick={(evt) => {
                if (onOpenSnapshot) onOpenSnapshot(evt);
                else if (onSelectEvent) onSelectEvent(evt);
              }}
              onSelectEvent={onSelectEvent}
            />
          </div>
        </div>

        {/* Right Tactical Console (28% width): Real-Time C4ISR Intelligence Stack */}
        <div className="live-monitor-right-console">
          {/* Threat Assessment Gauge */}
          <ThreatAssessment
            threatAssessment={threatAssessment}
            analysisActive={analysisActive}
          />

          {/* Live Target Counters */}
          <IntelligencePanel
            liveIntelligence={liveIntelligence}
            analysisActive={analysisActive}
          />

          {/* Active Target Ledger */}
          <ActiveTargetsLedger
            activeEntities={activeEntities}
            analysisActive={analysisActive}
            selectedCamera={selectedCamera}
            threatAssessment={threatAssessment}
          />

          {/* Current Active Incident Card */}
          <CurrentEvent
            currentEvent={currentEvent}
            event={currentEvent}
            analysisActive={analysisActive}
            onVerify={onVerifyEvent}
            onEventVerified={onVerifyEvent}
            onOpenSnapshot={onOpenSnapshot}
          />
        </div>
      </div>
    </div>
  );
}
