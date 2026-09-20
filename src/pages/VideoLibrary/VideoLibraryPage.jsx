import React, { useState, useEffect } from 'react';
import {
  Film, Play, Square, AlertTriangle, CheckCircle, Clock,
  Upload, Trash2, RotateCw, FileText, ExternalLink, HardDrive, Info
} from 'lucide-react';
import { useTranslation } from '../../services/i18n.js';

export default function VideoLibraryPage({
  videos,
  onSelectVideo,
  onStartAnalysis,
  onStopAnalysis,
  jobStatus,
  analysisActive,
  onVideoUploaded,
  onVideoDeleted,
  onNavigateToTab,
  onExportReport
}) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState('uploaded'); // 'uploaded', 'queue', 'history', 'completed', 'failed'
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [historyJobs, setHistoryJobs] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch processing history from backend
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/videos');
      if (res.ok) {
        const data = await res.json();
        // Construct history items from video records
        setHistoryJobs(data);
      }
    } catch (err) {
      console.error('Failed to load job history', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('camera_id', 'CAM-01');

    try {
      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const newVid = await res.json();
      if (onVideoUploaded) onVideoUploaded(newVid);
      loadHistory();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVideo = async (video) => {
    if (!window.confirm(`Are you sure you want to delete video "${video.filename}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/videos/${video.id || video.filename}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        if (onVideoDeleted) {
          onVideoDeleted(video.filename);
        }
        loadHistory();
      } else {
        const err = await res.json();
        alert(`Failed to delete video: ${err.detail || 'Server error'}`);
      }
    } catch (err) {
      alert(`Error communicating with backend: ${err.message}`);
    }
  };

  // Derived video subsets
  const completedVideos = videos.filter(v => v.processing_status === 'COMPLETED');
  const failedVideos = videos.filter(v => v.processing_status === 'FAILED' || v.processing_status === 'ERROR');

  return (
    <div className="video-library-page">
      {/* 1. Header with Upload & Sub-navigation */}
      <div className="tab-page-header">
        <div>
          <h2 className="tab-page-title">{t('videoLibrary')}</h2>
          <p className="tab-page-desc">
            {t('tagline')} — Surveillance Footage & Processing Logs
          </p>
        </div>

        <div className="tab-header-actions">
          <label className={`btn-primary ${isUploading ? 'disabled' : ''}`} style={{ cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Upload size={14} />
            {isUploading ? `${t('upload')}...` : `${t('upload')} Video`}
            <input
              type="file"
              accept="video/mp4,video/avi,video/mov,video/mkv"
              onChange={handleFileUpload}
              disabled={isUploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="alert-banner error" style={{ margin: '0 0 16px 0', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '4px', color: '#fca5a5', fontSize: '12px' }}>
          <b>Upload Error:</b> {uploadError}
        </div>
      )}

      {/* 2. Sub-Tab Filter Pills */}
      <div className="subtab-bar">
        <button
          className={`subtab-btn ${subTab === 'uploaded' ? 'active' : ''}`}
          onClick={() => setSubTab('uploaded')}
        >
          <Film size={13} />
          Uploaded Videos ({videos.length})
        </button>
        <button
          className={`subtab-btn ${subTab === 'queue' ? 'active' : ''}`}
          onClick={() => setSubTab('queue')}
        >
          <Clock size={13} />
          Processing Queue ({analysisActive ? '1 Active' : '0 Queued'})
        </button>
        <button
          className={`subtab-btn ${subTab === 'history' ? 'active' : ''}`}
          onClick={() => setSubTab('history')}
        >
          <RotateCw size={13} />
          Processing History ({videos.length})
        </button>
        <button
          className={`subtab-btn ${subTab === 'completed' ? 'active' : ''}`}
          onClick={() => setSubTab('completed')}
        >
          <CheckCircle size={13} />
          Completed Analysis ({completedVideos.length})
        </button>
        <button
          className={`subtab-btn ${subTab === 'failed' ? 'active' : ''}`}
          onClick={() => setSubTab('failed')}
        >
          <AlertTriangle size={13} />
          Failed Jobs ({failedVideos.length})
        </button>
      </div>

      {/* 3. Sub-Tab Content Views */}

      {/* TAB 1: UPLOADED VIDEOS */}
      {subTab === 'uploaded' && (
        <div className="library-card-grid">
          {videos.length === 0 ? (
            <div className="empty-state-card">
              <Film size={32} color="#64748b" />
              <h3>NO UPLOADED VIDEOS FOUND</h3>
              <p>Upload an MP4 surveillance recording to begin tactical computer vision analysis.</p>
            </div>
          ) : (
            videos.map((vid) => (
              <div key={vid.id || vid.filename} className="video-card">
                <div className="video-card-header">
                  <div className="video-card-title-row">
                    <span className="video-card-filename" title={vid.filename}>{vid.filename}</span>
                    <span className={`badge-status ${vid.processing_status?.toLowerCase()}`}>
                      {vid.processing_status || 'IDLE'}
                    </span>
                  </div>
                  <div className="video-card-meta">
                    <span>Camera: <b>{vid.camera_id || 'CAM-01'}</b></span>
                    <span>•</span>
                    <span>Duration: <b>{vid.duration}s</b></span>
                    <span>•</span>
                    <span>Resolution: <b>{vid.resolution}</b></span>
                    <span>•</span>
                    <span>FPS: <b>{vid.fps}</b></span>
                    <span>•</span>
                    <span>Size: <b>{vid.file_size}</b></span>
                  </div>
                </div>

                <div className="video-card-actions">
                  <button
                    className="btn-card-action primary"
                    onClick={() => {
                      onSelectVideo(vid.filename);
                      onNavigateToTab('live-monitor');
                    }}
                    title="Load into Live Monitor player"
                  >
                    <Play size={12} /> Play in Monitor
                  </button>

                  <button
                    className="btn-card-action success"
                    onClick={() => {
                      onSelectVideo(vid.filename);
                      if (onStartAnalysis) onStartAnalysis(vid.filename);
                      onNavigateToTab('live-monitor');
                    }}
                    title="Execute YOLOv8 + ByteTrack pipeline on this video"
                  >
                    <RotateCw size={12} /> Analyze
                  </button>

                  <button
                    className="btn-card-action danger"
                    onClick={() => handleDeleteVideo(vid)}
                    title="Delete video file and metadata"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: PROCESSING QUEUE */}
      {subTab === 'queue' && (
        <div className="queue-section">
          {analysisActive ? (
            <div className="queue-active-card">
              <div className="queue-header-row">
                <div className="queue-status-pulse">
                  <span className="pulse-dot" />
                  <h3>CURRENT PROCESSING JOB: RUNNING</h3>
                </div>
                <span className="queue-status-tag">{jobStatus}</span>
              </div>

              <div className="queue-detail-grid">
                <div className="queue-metric">
                  <span className="q-label">PIPELINE STATUS</span>
                  <span className="q-val text-green">ACTIVE STREAMING</span>
                </div>
                <div className="queue-metric">
                  <span className="q-label">INFERENCE ENGINE</span>
                  <span className="q-val">YOLOv8 Nano (ONNX/Torch)</span>
                </div>
                <div className="queue-metric">
                  <span className="q-label">TRACKING ALGORITHM</span>
                  <span className="q-val">ByteTrack IoU Multi-Object</span>
                </div>
                <div className="queue-metric">
                  <span className="q-label">STREAM PROTOCOL</span>
                  <span className="q-val">MJPEG Real-time Direct</span>
                </div>
              </div>

              {/* Pause notice per prompt rules */}
              <div className="honest-notice-banner">
                <Info size={14} className="notice-icon" />
                <div>
                  <b>PAUSE NOT AVAILABLE:</b> Direct OpenCV frame decoding does not support arbitrary thread suspension without frame drift. Stop and Restart are fully supported.
                </div>
              </div>

              <div className="queue-actions-row">
                <button
                  className="btn-queue-stop"
                  onClick={() => onStopAnalysis && onStopAnalysis()}
                >
                  <Square size={13} /> Stop Analysis Job
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state-card">
              <Clock size={32} color="#64748b" />
              <h3>NO ACTIVE JOBS IN QUEUE</h3>
              <p>Select any uploaded video from the "Uploaded Videos" tab and click "Analyze" to queue a job.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROCESSING HISTORY */}
      {subTab === 'history' && (
        <div className="table-wrapper">
          <table className="operational-table">
            <thead>
              <tr>
                <th>Video Asset</th>
                <th>Target Station</th>
                <th>Duration</th>
                <th>Resolution</th>
                <th>Framerate</th>
                <th>Storage Size</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((vid) => (
                <tr key={vid.id || vid.filename}>
                  <td style={{ fontWeight: 600 }}>{vid.filename}</td>
                  <td>{vid.camera_id || 'CAM-01'}</td>
                  <td>{vid.duration}s</td>
                  <td>{vid.resolution}</td>
                  <td>{vid.fps} FPS</td>
                  <td>{vid.file_size}</td>
                  <td>
                    <span className={`badge-status ${vid.processing_status?.toLowerCase()}`}>
                      {vid.processing_status || 'IDLE'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-table-action"
                      onClick={() => {
                        onSelectVideo(vid.filename);
                        onNavigateToTab('live-monitor');
                      }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: COMPLETED ANALYSIS */}
      {subTab === 'completed' && (
        <div className="library-card-grid">
          {completedVideos.length === 0 ? (
            <div className="empty-state-card">
              <CheckCircle size={32} color="#64748b" />
              <h3>NO COMPLETED ANALYSIS JOBS YET</h3>
              <p>When an analysis job runs to End-Of-File (EOF), it will automatically transition here.</p>
            </div>
          ) : (
            completedVideos.map((vid) => (
              <div key={vid.id || vid.filename} className="video-card completed">
                <div className="video-card-header">
                  <div className="video-card-title-row">
                    <span className="video-card-filename">{vid.filename}</span>
                    <span className="badge-status completed">COMPLETED</span>
                  </div>
                  <div className="video-card-meta">
                    <span>Camera: <b>{vid.camera_id}</b></span>
                    <span>•</span>
                    <span>Analyzed Duration: <b>{vid.duration}s</b></span>
                  </div>
                </div>
                <div className="video-card-actions">
                  <button
                    className="btn-card-action primary"
                    onClick={() => onNavigateToTab('events-alerts')}
                  >
                    View Events
                  </button>
                  <button
                    className="btn-card-action success"
                    onClick={() => onExportReport && onExportReport(vid.camera_id, vid.filename)}
                  >
                    <FileText size={12} /> Export Report
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 5: FAILED JOBS */}
      {subTab === 'failed' && (
        <div className="library-card-grid">
          {failedVideos.length === 0 ? (
            <div className="empty-state-card">
              <CheckCircle size={32} color="#22c55e" />
              <h3>ALL JOBS OPERATING NORMALLY</h3>
              <p>No failed or terminated video analysis jobs recorded in system state.</p>
            </div>
          ) : (
            failedVideos.map((vid) => (
              <div key={vid.id || vid.filename} className="video-card failed">
                <div className="video-card-header">
                  <div className="video-card-title-row">
                    <span className="video-card-filename">{vid.filename}</span>
                    <span className="badge-status failed">FAILED</span>
                  </div>
                  <div className="video-card-meta">
                    <span>Reason: Decode error or timeout</span>
                  </div>
                </div>
                <div className="video-card-actions">
                  <button
                    className="btn-card-action warning"
                    onClick={() => {
                      if (onStartAnalysis) onStartAnalysis(vid.filename);
                      onNavigateToTab('live-monitor');
                    }}
                  >
                    <RotateCw size={12} /> Retry Analysis
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
