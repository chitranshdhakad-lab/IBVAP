import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Upload,
  ChevronDown,
  Activity,
  Square,
  CheckCircle,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { getStoredSettings, subscribeSettings } from '../services/settingsManager.js';
import { useTranslation } from '../services/i18n.js';
import { resolveMediaUrl } from '../services/apiConfig.js';

export default function VideoPanel({
  selectedCamera,
  setSelectedCamera,
  cameras = [],
  selectedVideo,
  setSelectedVideo,
  videos = [],
  onVideoUploaded,
  onVideoDeleted,
  analysisMode = 'analysis',
  setAnalysisMode,
  activeEntities = [],
  videoTimestamp = 0,
  analysisActive = false,
  jobStatus = 'IDLE',
  frameIndex = 0,
  totalFrames = 0,
  onToggleAnalysis,
  seekTarget = null,
  onTimeUpdate,
  sendCommand
}) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState('1x');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(180);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [videoError, setVideoError] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [panelSettings, setPanelSettings] = useState(getStoredSettings);
  const isAnalyzing = Boolean(analysisActive || jobStatus === 'RUNNING');

  useEffect(() => {
    const unsub = subscribeSettings((updated) => {
      setPanelSettings(updated);
    });
    return unsub;
  }, []);

  // Auto Reconnect effect for camera stream drops
  useEffect(() => {
    if (streamError && panelSettings.autoReconnect !== false) {
      const reconnectTimer = setTimeout(() => {
        setStreamError(null);
      }, 3000);
      return () => clearTimeout(reconnectTimer);
    }
  }, [streamError, panelSettings.autoReconnect]);

  const videoRef = useRef(null);
  const videoCardRef = useRef(null);
  const fileInputRef = useRef(null);

  // Current video object
  const currentVideoObj = videos.find(
    (v) => v.filename === selectedVideo || v.id === selectedVideo
  );

  const rawVideoSrc = currentVideoObj
    ? `/videos/${currentVideoObj.filename}`
    : (selectedVideo ? `/videos/${selectedVideo}` : '');
  const videoSrc = resolveMediaUrl(rawVideoSrc);

  // Reset errors when video or camera switches
  useEffect(() => {
    setVideoError(null);
    setStreamError(null);
  }, [selectedVideo, selectedCamera]);

  // Synchronize duration from active video metadata
  useEffect(() => {
    if (currentVideoObj?.duration && !isNaN(currentVideoObj.duration) && currentVideoObj.duration > 0) {
      setDuration(currentVideoObj.duration);
    }
  }, [currentVideoObj]);

  // NOTE: We intentionally do NOT sync the <video> element to videoTimestamp here.
  // When analysis is active, the MJPEG <img> stream is rendered instead of the <video>.
  // Forcing seeks on the <video> element during analysis causes the browser decoder to
  // reset on every WebSocket packet (~5-10x/sec), which produces the 'vibrating frame' artifact.

  // Turn off starting spinner once analysis is confirmed active & sync video playback
  useEffect(() => {
    if (isAnalyzing) {
      setIsStarting(false);
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      setIsStarting(false);
      if (videoRef.current && !videoRef.current.paused && jobStatus === 'STOPPED') {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [isAnalyzing, jobStatus]);

  const handleVideoError = () => {
    const err = videoRef.current?.error;
    let reason = 'Unable to decode or load media file.';
    if (err) {
      if (err.code === 1) reason = 'Video loading was aborted by operator or network.';
      else if (err.code === 2) reason = 'Network communication failure occurred while fetching media.';
      else if (err.code === 3) reason = 'Video decoding failed or codec is unsupported by browser.';
      else if (err.code === 4) reason = 'Video file not found or format is not supported (404/MIME error).';
    }
    setVideoError(reason);
  };

  // Handle external seek targets from timeline or events
  useEffect(() => {
    if (seekTarget !== null && seekTarget !== undefined && videoRef.current) {
      videoRef.current.currentTime = seekTarget;
      setCurrentTime(seekTarget);
      if (sendCommand) {
        sendCommand({ action: 'seek', timestamp: seekTarget });
      }
    }
  }, [seekTarget, sendCommand]);

  // Sync video play/pause
  const togglePlay = () => {
    if (analysisMode === 'analysis' || isAnalyzing) {
      if (isPlaying || isAnalyzing) {
        setIsPlaying(false);
        if (sendCommand) {
          sendCommand({ action: 'pause' });
        }
      } else {
        setIsPlaying(true);
        if (onToggleAnalysis && !isAnalyzing) {
          onToggleAnalysis();
        } else if (sendCommand) {
          sendCommand({ action: 'resume' });
        }
      }
      return;
    }
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Playback error:', e);
      });
    }
  };

  const handleAnalysisToggleClick = () => {
    if (!isAnalyzing) {
      // Starting analysis: show starting status and trigger pipeline
      setIsStarting(true);
      // Safety timeout: reset starting flag after 2.5s if no backend packet
      setTimeout(() => setIsStarting(false), 2500);
      if (videoRef.current) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      // Stopping analysis: cleanly pause video element if present
      setIsStarting(false);
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch (e) {}
        setIsPlaying(false);
      }
    }
    if (onToggleAnalysis) {
      onToggleAnalysis('realtime');
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const cycleSpeed = () => {
    const speeds = [0.5, 1, 1.5, 2];
    const speedLabels = ['0.5x', '1x', '1.5x', '2x'];
    const currentIdx = speedLabels.indexOf(playbackSpeed);
    const nextIdx = (currentIdx + 1) % speeds.length;
    setPlaybackSpeed(speedLabels[nextIdx]);
    if (videoRef.current) {
      videoRef.current.playbackRate = speeds[nextIdx];
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (videoCardRef.current?.requestFullscreen) {
        videoCardRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);
      if (onTimeUpdate) onTimeUpdate(cur);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (sendCommand && analysisActive) {
      sendCommand({ action: 'completed' });
    }
  };

  const handleTimelineClick = (e) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = newPercent * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    if (sendCommand && analysisActive) {
      sendCommand({ action: 'seek', timestamp: newTime });
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('camera_id', selectedCamera || 'CAM-01');

    setUploading(true);
    setUploadMessage(`Uploading ${file.name}...`);
    try {
      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setUploadMessage(`Registered ${data.filename} (${data.total_frames || 0} frames). Job Ready.`);
        setTimeout(() => setUploadMessage(''), 4000);
        if (onVideoUploaded) {
          onVideoUploaded(data);
        }
        setSelectedVideo(data.filename);
        if (sendCommand) {
          sendCommand({ action: 'select_video', video: data.filename });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Video upload failed: ${errData.detail || 'Server error'}`);
        setUploadMessage('');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadMessage('');
      alert(`Video upload error: ${err.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDeleteCurrentVideo = async () => {
    if (!selectedVideo) return;
    if (analysisActive) {
      alert('Cannot delete video while surveillance analysis is actively running. Please stop analysis first.');
      return;
    }
    if (!window.confirm(`Permanently delete video "${selectedVideo}" from disk and database? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/videos/${selectedVideo}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (onVideoDeleted) {
          onVideoDeleted(selectedVideo);
        }
        setUploadMessage(`Deleted ${selectedVideo}`);
        setTimeout(() => setUploadMessage(''), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to delete video: ${err.detail || 'Server error'}`);
      }
    } catch (e) {
      alert(`Delete error: ${e.message}`);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const displayTime = isAnalyzing && videoTimestamp ? videoTimestamp : currentTime;
  const progressPercent = jobStatus === 'COMPLETED'
    ? 100
    : (isAnalyzing && totalFrames > 0
      ? Math.min(100, Math.max(0, (frameIndex / totalFrames) * 100))
      : (duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0));

  // Render dynamic status pill for HUD
  const renderJobStatusBadge = () => {
    if (isAnalyzing) {
      return (
        <div className="hud-analysis-pill" style={{ backgroundColor: 'rgba(22, 101, 52, 0.85)', border: '1px solid #16a34a' }}>
          <span className="hud-analysis-dot"></span>
          <span>RUNNING {frameIndex > 0 ? `(${frameIndex}/${totalFrames || currentVideoObj?.total_frames || '—'})` : 'ANALYSIS'}</span>
        </div>
      );
    }
    if (jobStatus === 'COMPLETED') {
      return (
        <div className="hud-analysis-pill" style={{ backgroundColor: 'rgba(30, 58, 138, 0.85)', border: '1px solid #3b82f6' }}>
          <CheckCircle size={11} style={{ marginRight: '4px', color: '#60a5fa' }} />
          <span>ANALYSIS COMPLETED</span>
        </div>
      );
    }
    if (jobStatus === 'PAUSED') {
      return (
        <div className="hud-analysis-pill" style={{ backgroundColor: 'rgba(120, 53, 15, 0.85)', border: '1px solid #f59e0b' }}>
          <span className="hud-analysis-dot" style={{ backgroundColor: '#f59e0b' }}></span>
          <span>ANALYSIS PAUSED</span>
        </div>
      );
    }
    if (uploading) {
      return (
        <div className="hud-analysis-pill" style={{ backgroundColor: 'rgba(120, 53, 15, 0.85)', border: '1px solid #f59e0b' }}>
          <span>PROCESSING UPLOAD...</span>
        </div>
      );
    }
    return (
      <div className="hud-analysis-pill" style={{ backgroundColor: 'rgba(30, 38, 31, 0.7)', border: '1px solid #3f4e41' }}>
        <span style={{ fontSize: '10px', color: '#9ba39c' }}>STANDBY / READY</span>
      </div>
    );
  };

  return (
    <div className="video-panel-wrapper" ref={videoCardRef}>
      {/* Hidden file input for Upload Videos button */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".mp4,.avi,.mov,.mkv,video/mp4,video/avi,video/quicktime,video/x-matroska"
        style={{ display: 'none' }}
      />

      {/* Main Top Control Bar */}
      <div className="control-bar">
        <div className="control-bar-left">
          <span className="control-label">Camera / Video</span>

          {/* Dynamic Camera Dropdown */}
          <div className="control-select-wrapper">
            <select
              className="control-select"
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
            >
              {cameras.length > 0 ? (
                cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.name || `${cam.id} - Perimeter`}
                  </option>
                ))
              ) : (
                <option value="CAM-01">CAM-01 - North Perimeter</option>
              )}
            </select>
            <ChevronDown className="control-select-arrow" size={12} />
          </div>

          {/* Dynamic Video Dropdown */}
          <div className="control-select-wrapper">
            <select
              className="control-select"
              value={selectedVideo}
              onChange={(e) => {
                setSelectedVideo(e.target.value);
                if (sendCommand) {
                  sendCommand({ action: 'select_video', video: e.target.value });
                }
              }}
            >
              {videos.length > 0 ? (
                videos.map((vid) => (
                  <option key={vid.id || vid.filename} value={vid.filename}>
                    {vid.filename}
                  </option>
                ))
              ) : (
                <option value="">No Video Loaded</option>
              )}
            </select>
            <ChevronDown className="control-select-arrow" size={12} />
          </div>

          {/* Quick Delete Video Button */}
          <button
            type="button"
            className="btn-icon-square"
            onClick={handleDeleteCurrentVideo}
            title={`Delete ${selectedVideo} permanently`}
            style={{ color: '#f87171', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', width: '28px', height: '28px' }}
          >
            <Trash2 size={13} />
          </button>

          {/* Analysis / Original Segmented Control */}
          <div className="segmented-control">
            <button
              className={`segmented-btn ${analysisMode === 'analysis' ? 'active' : ''}`}
              onClick={() => setAnalysisMode('analysis')}
              title="Show tactical AI detection overlay"
            >
              {t('analysis')}
            </button>
            <button
              className={`segmented-btn ${analysisMode === 'original' ? 'active' : ''}`}
              onClick={() => setAnalysisMode('original')}
              title="Show clean original camera footage"
            >
              {t('original')}
            </button>
          </div>

          {/* Start / Stop Analysis Control Button */}
          <button
            className={`btn-upload btn-analysis-toggle ${isAnalyzing ? 'active-stop' : ''}`}
            onClick={handleAnalysisToggleClick}
            disabled={isStarting}
            style={{
              backgroundColor: isAnalyzing ? '#7f1d1d' : isStarting ? '#b45309' : '#1e261f',
              border: isAnalyzing ? '1px solid #ef4444' : isStarting ? '1px solid #f59e0b' : 'none',
              opacity: isStarting ? 0.85 : 1
            }}
            title={isAnalyzing ? 'Halt YOLOv8 Detection Pipeline' : 'Initiate YOLOv8 + Tracker Pipeline'}
          >
            {isAnalyzing ? <Square size={11} /> : <Activity size={11} />}
            <span>{isStarting ? t('starting') : isAnalyzing ? t('stopAnalysis') : (jobStatus === 'COMPLETED' ? t('rerunAnalysis') : t('startAnalysis'))}</span>
          </button>

          {/* Upload Feedback Message */}
          {uploadMessage && (
            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginLeft: '6px' }}>
              {uploadMessage}
            </span>
          )}
        </div>

        <div className="control-bar-right">
          {/* Upload Videos Button */}
          <button
            className="btn-upload"
            onClick={handleUploadClick}
            disabled={uploading}
            title="Upload custom CCTV surveillance footage"
          >
            <Upload size={12} />
            <span>{uploading ? 'Uploading...' : t('upload')}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            className="btn-icon-square"
            onClick={toggleFullscreen}
            title="Expand Fullscreen"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Video Panel Card */}
      <div className="video-panel-card">
        <div className="video-screen-container">
          {!videoSrc || !selectedVideo ? (
            <div className="video-standby-c4isr-screen">
              <img
                src="/assets/border-cctv-standby.jpg"
                alt="Optical Surveillance Standby Feed"
                className="video-standby-bg"
              />
              <div className="video-standby-hud-overlay">
                {/* Tactical Top Bar */}
                <div className="standby-top-telemetry">
                  <div className="telemetry-pill">
                    <span className="standby-live-dot" />
                    <span>C4ISR OPTICAL FEED // SENSOR STANDBY</span>
                  </div>
                  <div className="telemetry-coords">
                    <span>{selectedCamera || 'CAM-01'}</span>
                    <span>•</span>
                    <span>32.114° N, 74.891° E</span>
                    <span>•</span>
                    <span>1080P / 30 FPS</span>
                  </div>
                </div>

                {/* Central Targeting Crosshairs Reticle */}
                <div className="standby-crosshairs-center">
                  <div className="crosshair-reticle">
                    <div className="reticle-center-circle" />
                    <div className="reticle-line h" />
                    <div className="reticle-line v" />
                  </div>
                  <div className="standby-center-info">
                    <div className="standby-badge">OPTICAL CHANNEL READY</div>
                    <div className="standby-main-text">Awaiting Surveillance Footage or Live Link</div>
                    <p className="standby-sub-text">
                      Upload an MP4 recording or select a camera channel to execute neural AI detection.
                    </p>
                    <button
                      type="button"
                      className="btn-standby-upload"
                      onClick={handleUploadClick}
                    >
                      <Upload size={14} />
                      <span>+ Ingest Footage / Upload Video</span>
                    </button>
                  </div>
                </div>

                {/* Corner Brackets */}
                <div className="standby-corner top-left" />
                <div className="standby-corner top-right" />
                <div className="standby-corner bottom-left" />
                <div className="standby-corner bottom-right" />

                {/* Bottom Status Bar */}
                <div className="standby-bottom-status">
                  <span>SECURE BORDER PATROL CORPS • STATION {selectedCamera || 'CAM-01'}</span>
                  <span>ENCRYPTION: AES-256 GCM</span>
                </div>
              </div>
            </div>
          ) : videoError ? (
            <div className="video-standby-c4isr-screen">
              <img
                src="/assets/border-cctv-standby.jpg"
                alt="Optical Surveillance Standby Feed"
                className="video-standby-bg error-tint"
              />
              <div className="video-standby-hud-overlay">
                <div className="video-unavailable-overlay tactical-glass">
                  <AlertCircle size={36} color="#ef4444" />
                  <div className="video-unavailable-title">{t('videoUnavailable')}</div>
                  <div className="video-unavailable-filename">{selectedVideo}</div>
                  <div className="video-unavailable-reason">{videoError}</div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      className="btn-retry-video"
                      onClick={() => {
                        setVideoError(null);
                        if (videoRef.current) videoRef.current.load();
                      }}
                    >
                      {t('retryLoading')}
                    </button>
                    <button
                      className="btn-retry-video upload-alt"
                      onClick={handleUploadClick}
                      style={{ background: '#0284c7', borderColor: '#0284c7', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Upload size={12} />
                      Upload New Video
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : streamError && analysisMode === 'analysis' && isAnalyzing ? (
            <div className="video-unavailable-overlay">
              <AlertCircle size={36} color="#ef4444" />
              <div className="video-unavailable-title">{t('streamUnavailable')}</div>
              <div className="video-unavailable-filename">{selectedCamera}</div>
              <div className="video-unavailable-reason">{streamError}</div>
              <button
                className="btn-retry-video"
                onClick={() => setStreamError(null)}
              >
                {t('reconnectStream')}
              </button>
            </div>
          ) : analysisMode === 'analysis' && isAnalyzing ? (
            <img
              key={`stream-${selectedCamera}-${selectedVideo}`}
              src={resolveMediaUrl(`/api/analysis/stream/${selectedCamera}?video=${encodeURIComponent(selectedVideo || '')}`)}
              alt="Live Tactical CV Analysis Feed"
              className="video-media-layer"
              style={{ filter: panelSettings.nightModeEnhancement ? 'contrast(1.3) brightness(1.15) hue-rotate(65deg) saturate(0.85)' : 'none' }}
              onError={() => {
                setStreamError('The annotated analysis stream could not be reached.');
              }}
            />
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
              <video
                key={`media-${videoSrc}`}
                ref={videoRef}
                src={videoSrc}
                className="video-media-layer"
                style={{ filter: panelSettings.nightModeEnhancement ? 'contrast(1.3) brightness(1.15) hue-rotate(65deg) saturate(0.85)' : 'none' }}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                onError={handleVideoError}
              />
              {/* Tactical AI Bounding Box HUD Overlay for Video Mode */}
              {analysisMode === 'analysis' && panelSettings.showDetectionBoxes && activeEntities && activeEntities.length > 0 && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {activeEntities
                    .filter((ent) => {
                      const cat = (ent.category || '').toLowerCase();
                      const cls = (ent.class || ent.object_class || '').toLowerCase();
                      if ((cat === 'person' || cls === 'person') && !panelSettings.personDetection) return false;
                      if ((cat === 'vehicle' || ['car', 'truck', 'bus', 'vehicle', 'motorcycle'].includes(cls)) && !panelSettings.vehicleDetection) return false;
                      if ((cat === 'animal' || ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'].includes(cls)) && !panelSettings.animalDetection) return false;
                      if (cat !== 'person' && cat !== 'vehicle' && cat !== 'animal' && !panelSettings.unknownObjectDetection) return false;
                      return true;
                    })
                    .map((ent) => {
                      const [x1, y1, x2, y2] = ent.bbox || [0, 0, 0, 0];
                      const left = `${(x1 * 100).toFixed(1)}%`;
                      const top = `${(y1 * 100).toFixed(1)}%`;
                      const width = `${Math.max(1.5, (x2 - x1) * 100).toFixed(1)}%`;
                      const height = `${Math.max(1.5, (y2 - y1) * 100).toFixed(1)}%`;
                      const isPerson = ent.category === 'person';
                      const color = isPerson ? '#ef4444' : ent.category === 'vehicle' ? '#22c55e' : '#f59e0b';
                      return (
                        <div
                          key={ent.tracking_id}
                          style={{
                            position: 'absolute',
                            left,
                            top,
                            width,
                            height,
                            border: `2px solid ${color}`,
                            boxShadow: `0 0 8px ${color}aa`,
                            borderRadius: '2px',
                            boxSizing: 'border-box',
                            transition: 'all 0.08s ease-out'
                          }}
                        >
                          <div style={{
                            position: 'absolute',
                            top: '-18px',
                            left: '-2px',
                            background: color,
                            color: '#ffffff',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            fontFamily: 'monospace',
                            padding: '0 4px',
                            borderRadius: '2px 2px 0 0',
                            whiteSpace: 'nowrap'
                          }}>
                            {(ent.object_class || 'TARGET').toUpperCase()} ID:{ent.tracking_id}{panelSettings.showConfidenceScore ? ` (${Math.round((ent.confidence || 0.8) * 100)}%)` : ''}
                          </div>
                          <div style={{
                            position: 'absolute',
                            bottom: '-16px',
                            left: '-2px',
                            background: 'rgba(15, 23, 42, 0.88)',
                            color: '#cbd5e1',
                            fontSize: '9px',
                            fontFamily: 'monospace',
                            padding: '0 4px',
                            borderRadius: '0 0 2px 2px',
                            whiteSpace: 'nowrap',
                            border: `1px solid ${color}66`,
                            borderTop: 'none'
                          }}>
                            {ent.direction || 'Stationary'} • {ent.speed || '0 px/s'}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* HUD Top-Left Camera Info */}
          {(panelSettings.showCameraStatus || panelSettings.showTimestamps) && (
            <div className="hud-top-left">
              {panelSettings.showCameraStatus && (
                <div className="hud-camera-name">
                  {selectedCamera} | {cameras.find((c) => c.id === selectedCamera)?.name || 'Perimeter Feed'}
                </div>
              )}
              {panelSettings.showTimestamps && (
                <div>
                  {new Date().toLocaleDateString('en-GB', { timeZone: panelSettings.timeZone || 'Asia/Kolkata' })} {new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: panelSettings.timeZone || 'Asia/Kolkata' })}
                </div>
              )}
              <div className="hud-fps" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                <span>FPS: {currentVideoObj?.fps || 25}</span>
                <span style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.25)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 700
                }}>
                  {(panelSettings.defaultStreamQuality || '1080p').toUpperCase()}
                </span>
                {panelSettings.videoRecording && (
                  <span style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.25)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
                    {t('recBadge')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* HUD Top-Right Analysis Status Badge */}
          <div className="hud-top-right">
            {renderJobStatusBadge()}
          </div>
        </div>

        {/* Video Player Bottom Controls */}
        <div className="video-controls">
          {/* Play / Pause Toggle */}
          <button
            className="video-ctrl-btn"
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>

          {/* Time Code */}
          <div className="video-time">
            {formatTime(displayTime)} / {formatTime(duration)}
          </div>

          {/* Interactive Timeline Bar */}
          <div
            className="video-timeline-bar"
            onClick={handleTimelineClick}
            title="Seek playback"
          >
            <div
              className="video-timeline-progress"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="video-timeline-thumb"></div>
            </div>
          </div>

          {/* Volume Control */}
          <button
            className="video-ctrl-btn"
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Playback Speed */}
          <button
            className="video-speed-btn"
            onClick={cycleSpeed}
            title="Cycle Playback Speed"
          >
            {playbackSpeed}
          </button>

          {/* Fullscreen Button in Player */}
          <button
            className="video-ctrl-btn"
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
