import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import ExportReportModal from './ExportReportModal.jsx';
import SnapshotModal from './SnapshotModal.jsx';

// 8 Modular Section Pages
import LiveMonitorPage from '../pages/LiveMonitor/LiveMonitorPage.jsx';
import VideoLibraryPage from '../pages/VideoLibrary/VideoLibraryPage.jsx';
import EventsAlertsPage from '../pages/EventsAlerts/EventsAlertsPage.jsx';
import BorderMapPage from '../pages/BorderMap/BorderMapPage.jsx';
import AnalyticsPage from '../pages/Analytics/AnalyticsPage.jsx';
import CameraManagementPage from '../pages/CameraManagement/CameraManagementPage.jsx';
import SystemStatusPage from '../pages/SystemStatus/SystemStatusPage.jsx';
import SettingsPage from '../pages/Settings/SettingsPage.jsx';
import VehicleANPRPage from '../pages/VehicleANPR/VehicleANPRPage.jsx';

import { useSurveillanceWebSocket } from '../services/useSurveillanceWebSocket.js';
import { getStoredSettings, subscribeSettings, initSettingsFromServer } from '../services/settingsManager.js';
import { getStoredOperator, subscribeOperator } from '../services/operatorManager.js';
import WorkstationLockScreen from './WorkstationLockScreen.jsx';

export default function Dashboard() {
  const initialSettings = getStoredSettings();
  const [currentSettings, setCurrentSettings] = useState(initialSettings);
  const getInitialTab = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) return tabParam;
    return initialSettings.defaultView || 'live-monitor';
  };

  const [activeSidebarItem, setActiveSidebarItemState] = useState(getInitialTab);

  const setActiveSidebarItem = (tab) => {
    setActiveSidebarItemState(tab);
    window.location.hash = tab;
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) setActiveSidebarItemState(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);


  useEffect(() => {
    const unsub = subscribeSettings((updated) => {
      setCurrentSettings(updated);
    });
    return unsub;
  }, []);

  // Subscribe to operator session changes: dynamically adapt camera and sector
  useEffect(() => {
    const unsub = subscribeOperator((newOp) => {
      setCurrentOperator(newOp);
      if (newOp?.assigned_camera && newOp.assigned_camera !== 'ALL') {
        setSelectedCamera(newOp.assigned_camera);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    initSettingsFromServer().then((loaded) => {
      if (loaded) {
        setCurrentSettings(loaded);
        if (loaded.defaultView && !window.location.hash && !localStorage.getItem('ibvap_user_selected_tab')) {
          setActiveSidebarItem(loaded.defaultView);
        }
      }
    });

  }, []);
  const [selectedCamera, setSelectedCamera] = useState(initialSettings.defaultCamera || 'CAM-01');
  const [selectedVideo, setSelectedVideo] = useState('Border_Test_03.mp4');
  const [analysisMode, setAnalysisMode] = useState('analysis');
  const [seekTargetTime, setSeekTargetTime] = useState(null);

  // Global report export modal & snapshot inspection modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [activeSnapshotEvent, setActiveSnapshotEvent] = useState(null);

  // Backend state
  const [cameras, setCameras] = useState([]);
  const [videos, setVideos] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [currentEventData, setCurrentEventData] = useState(null);

  // WebSocket Live Stream Connection
  const {
    isConnected,
    analysisActive,
    jobStatus,
    frameIndex,
    totalFrames,
    progressPercent,
    liveIntelligence,
    threatAssessment,
    activeEntities,
    latestEvent,
    videoTimestamp,
    sendCommand
  } = useSurveillanceWebSocket(selectedCamera);

  // Strict double-layer filtering of entities and counters against AI settings
  const filteredActiveEntities = (activeEntities || []).filter((ent) => {
    const cat = (ent.category || '').toLowerCase();
    const cls = (ent.class || ent.object_class || '').toLowerCase();
    if ((cat === 'person' || cls === 'person') && currentSettings.personDetection === false) return false;
    if ((cat === 'vehicle' || ['car', 'truck', 'bus', 'vehicle', 'motorcycle'].includes(cls)) && currentSettings.vehicleDetection === false) return false;
    if ((cat === 'animal' || ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'].includes(cls)) && currentSettings.animalDetection === false) return false;
    if (cat !== 'person' && cat !== 'vehicle' && cat !== 'animal' && currentSettings.unknownObjectDetection === false) return false;
    return true;
  });

  const filteredLiveIntelligence = {
    ...liveIntelligence,
    persons: currentSettings.personDetection !== false ? (liveIntelligence?.persons ?? 0) : 0,
    vehicles: currentSettings.vehicleDetection !== false ? (liveIntelligence?.vehicles ?? 0) : 0,
    animals: currentSettings.animalDetection !== false ? (liveIntelligence?.animals ?? 0) : 0,
    active_tracks: filteredActiveEntities.length
  };

  // Strict double-layer filtering of incidents and current event against AI settings
  const filteredEventsList = (eventsList || []).filter((evt) => {
    const objStr = (evt.object || evt.object_class || evt.category || '').toLowerCase();
    if (objStr.includes('person') && currentSettings.personDetection === false) return false;
    if (['car', 'truck', 'bus', 'vehicle', 'motorcycle'].some(v => objStr.includes(v)) && currentSettings.vehicleDetection === false) return false;
    if (['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'animal'].some(a => objStr.includes(a)) && currentSettings.animalDetection === false) return false;
    return true;
  });

  const filteredCurrentEvent = (() => {
    if (!currentEventData) return null;
    const objStr = (currentEventData.object || currentEventData.object_class || currentEventData.category || '').toLowerCase();
    if (objStr.includes('person') && currentSettings.personDetection === false) return null;
    if (['car', 'truck', 'bus', 'vehicle', 'motorcycle'].some(v => objStr.includes(v)) && currentSettings.vehicleDetection === false) return null;
    if (['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'animal'].some(a => objStr.includes(a)) && currentSettings.animalDetection === false) return null;
    return currentEventData;
  })();

  const filteredThreatAssessment = (() => {
    if (!threatAssessment) return threatAssessment;
    if (filteredActiveEntities.length === 0 && (threatAssessment.score > 15 || threatAssessment.level !== 'SECURE')) {
      return {
        score: 8,
        level: 'SECURE',
        description: 'Perimeter scanning nominal. Zero active targets detected.',
        key_factors: ['Optical feed calibrated', 'Sector perimeter secure']
      };
    }
    return threatAssessment;
  })();

  // 1. Fetch cameras from backend
  const fetchCameras = useCallback(() => {
    fetch('/api/cameras')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (data && data.length > 0) {
          setCameras(data);
          if (!data.some((c) => c.id === selectedCamera)) {
            setSelectedCamera(data[0].id);
          }
        }
      })
      .catch(() => console.warn('Cameras API offline.'));
  }, [selectedCamera]);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  // 2. Fetch videos from backend
  const fetchVideos = useCallback(() => {
    fetch('/api/videos')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (data && data.length > 0) {
          setVideos(data);
          if (!selectedVideo || !data.some((v) => v.filename === selectedVideo)) {
            setSelectedVideo(data[0].filename);
          }
        }
      })
      .catch(() => console.warn('Videos API offline.'));
  }, [selectedVideo]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // 3. Fetch security events
  const fetchEvents = useCallback(() => {
    fetch('/api/events?limit=50')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (data) setEventsList(data);
      })
      .catch(() => console.warn('Events API offline.'));
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 6000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // 4. Fetch current active event
  const fetchCurrentEvent = useCallback(() => {
    fetch('/api/events/current')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.has_event) {
          setCurrentEventData(data);
        } else {
          setCurrentEventData(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCurrentEvent();
    const interval = setInterval(fetchCurrentEvent, 5000);
    return () => clearInterval(interval);
  }, [fetchCurrentEvent]);

  // Update current event when websocket reports a latest event - guarded to avoid reflow loop
  const lastEventIdRef = useRef(null);
  useEffect(() => {
    if (latestEvent) {
      setCurrentEventData(latestEvent);
      if (latestEvent.id && latestEvent.id !== lastEventIdRef.current) {
        lastEventIdRef.current = latestEvent.id;
        fetchEvents();

        // Check if sound notifications are enabled
        const s = getStoredSettings();
        if (s.soundNotifications && (latestEvent.severity === 'Critical' || latestEvent.severity === 'High')) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
          } catch (audioErr) {
            console.warn('Audio alert error:', audioErr);
          }
        }
      }
    }
  }, [latestEvent, fetchEvents]);

  // Video Deleted Callback
  const handleVideoDeleted = (deletedFilename) => {
    fetchVideos();
    setVideos((prev) => {
      const remaining = prev.filter((v) => v.filename !== deletedFilename && v.id !== deletedFilename);
      if (selectedVideo === deletedFilename && remaining.length > 0) {
        setSelectedVideo(remaining[0].filename);
      }
      return remaining;
    });
  };

  // Analysis Toggle Handler
  const handleToggleAnalysis = async (speedMode = 'fast') => {
    if (analysisActive) {
      try {
        await fetch('/api/analysis/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: selectedCamera })
        });
      } catch (err) {
        console.warn('Analysis stop request error', err);
      }
      sendCommand({ action: 'stop_analysis' });
    } else {
      try {
        await fetch('/api/analysis/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video: selectedVideo,
            video_filename: selectedVideo,
            camera_id: selectedCamera,
            speed_mode: typeof speedMode === 'string' ? speedMode : 'fast'
          })
        });
      } catch (err) {
        console.warn('Analysis start request error', err);
      }
      sendCommand({
        action: 'start_analysis',
        video: selectedVideo,
        camera_id: selectedCamera,
        speed_mode: typeof speedMode === 'string' ? speedMode : 'fast'
      });
    }
  };

  // Event Verification Handler
  const handleEventVerified = async (eventId) => {
    try {
      const res = await fetch(`/api/events/${eventId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified_by: 'Operator - MHA Tactical Console' })
      });
      if (res.ok) {
        setEventsList((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, verified: true } : e))
        );
        if (currentEventData && currentEventData.id === eventId) {
          setCurrentEventData((prev) => ({ ...prev, verified: true }));
        }
      }
    } catch (err) {
      console.warn('Error verifying alert', err);
    }
  };

  // Video Upload Handler
  const handleVideoUploaded = (newVideo) => {
    fetchVideos();
    if (newVideo && newVideo.filename) {
      setSelectedVideo(newVideo.filename);
    }
  };

  const unverifiedCount = eventsList.filter((e) => !e.verified).length;

  return (
    <div className="app-container">
      {/* 1. Left Fixed Sidebar */}
      <Sidebar
        activeItem={activeSidebarItem}
        setActiveItem={setActiveSidebarItem}
        unverifiedCount={unverifiedCount}
      />

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Header */}
        <Header
          notificationCount={unverifiedCount}
          isSystemOnline={isConnected}
          recentAlerts={eventsList.filter((e) => !e.verified).slice(0, 4)}
          onVerifyAlert={handleEventVerified}
          onSelectAlert={(evt) => {
            if (evt.camera) setSelectedCamera(evt.camera);
            setActiveSidebarItem('events-alerts');
          }}
          onSelectCamera={(camId) => setSelectedCamera(camId)}
          onSelectVideo={(vid) => setSelectedVideo(vid)}
          onNavigateToTab={(tab) => setActiveSidebarItem(tab)}
          onOpenReportModal={() => setReportModalOpen(true)}
        />

        {/* Dynamic Operational Page Views */}
        <main className="dashboard-content">
          {activeSidebarItem === 'live-monitor' && (
            <LiveMonitorPage
              selectedCamera={selectedCamera}
              setSelectedCamera={setSelectedCamera}
              cameras={cameras}
              selectedVideo={selectedVideo}
              setSelectedVideo={setSelectedVideo}
              videos={videos}
              onVideoUploaded={handleVideoUploaded}
              onVideoDeleted={handleVideoDeleted}
              analysisMode={analysisMode}
              setAnalysisMode={setAnalysisMode}
              activeEntities={filteredActiveEntities}
              videoTimestamp={videoTimestamp}
              analysisActive={analysisActive}
              jobStatus={jobStatus}
              frameIndex={frameIndex}
              totalFrames={totalFrames}
              onToggleAnalysis={handleToggleAnalysis}
              seekTargetTime={seekTargetTime}
              sendCommand={sendCommand}
              liveIntelligence={filteredLiveIntelligence}
              threatAssessment={filteredThreatAssessment}
              eventsList={filteredEventsList}
              currentEvent={filteredCurrentEvent}
              onVerifyEvent={handleEventVerified}
              onOpenSnapshot={(evt) => setActiveSnapshotEvent(evt)}
              onSelectEvent={(evt) => {
                if (evt.camera) setSelectedCamera(evt.camera);
                if (evt.video_timestamp !== undefined && !isNaN(evt.video_timestamp)) {
                  setSeekTargetTime(evt.video_timestamp);
                } else if (evt.time) {
                  const parts = evt.time.split(':').map(Number);
                  if (parts.length === 3) {
                    const secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    setSeekTargetTime(secs);
                  }
                }
                if (evt.snapshot_path) {
                  setActiveSnapshotEvent(evt);
                }
              }}
              onNavigateToTab={(tab) => setActiveSidebarItem(tab)}
            />
          )}

          {activeSidebarItem === 'video-library' && (
            <VideoLibraryPage
              videos={videos}
              onSelectVideo={(vid) => setSelectedVideo(vid)}
              onVideoDeleted={handleVideoDeleted}
              onStartAnalysis={(vid) => {
                setSelectedVideo(vid);
                sendCommand({
                  action: 'start_analysis',
                  video: vid,
                  camera_id: selectedCamera
                });
              }}
              onStopAnalysis={() => {
                sendCommand({ action: 'stop_analysis' });
              }}
              jobStatus={jobStatus}
              analysisActive={analysisActive}
              onVideoUploaded={handleVideoUploaded}
              onNavigateToTab={(tab) => setActiveSidebarItem(tab)}
              onExportReport={(camId, vid) => setReportModalOpen(true)}
            />
          )}

          {activeSidebarItem === 'events-alerts' && (
            <EventsAlertsPage
              cameras={cameras}
              onExportReport={() => setReportModalOpen(true)}
              onNavigateToTab={(tab, payload) => {
                setActiveSidebarItem(tab);
                if (payload?.cameraId) setSelectedCamera(payload.cameraId);
              }}
            />
          )}

          {activeSidebarItem === 'vehicle-anpr' && (
            <VehicleANPRPage
              cameras={cameras}
            />
          )}

          {activeSidebarItem === 'border-map' && (
            <BorderMapPage
              cameras={cameras}
              selectedCamera={selectedCamera}
              setSelectedCamera={setSelectedCamera}
              eventsList={eventsList}
              onNavigateToTab={(tab) => setActiveSidebarItem(tab)}
            />
          )}

          {activeSidebarItem === 'analytics' && (
            <AnalyticsPage
              onExportReport={() => setReportModalOpen(true)}
              onNavigateToTab={(tab) => setActiveSidebarItem(tab)}
            />
          )}


          {activeSidebarItem === 'camera-management' && (
            <CameraManagementPage
              cameras={cameras}
              onRefreshCameras={fetchCameras}
            />
          )}

          {activeSidebarItem === 'system-status' && (
            <SystemStatusPage />
          )}

          {activeSidebarItem === 'settings' && (
            <SettingsPage
              cameras={cameras}
            />
          )}
        </main>
      </div>

      {/* Global Operational Report Export Modal */}
      <ExportReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        cameras={cameras}
        selectedCamera={selectedCamera}
        selectedVideo={selectedVideo}
      />

      {/* Global Evidence Snapshot Lightbox Modal */}
      {activeSnapshotEvent && (
        <SnapshotModal
          event={activeSnapshotEvent}
          onClose={() => setActiveSnapshotEvent(null)}
          onVerify={handleEventVerified}
          onJumpToVideo={(evt) => {
            if (evt.camera) setSelectedCamera(evt.camera);
            if (evt.video_timestamp !== undefined) {
              setSeekTargetTime(evt.video_timestamp);
            }
          }}
        />
      )}

      {/* Workstation Lock Screen (Full Defense Auth Screen) */}
      <WorkstationLockScreen />
    </div>
  );
}
