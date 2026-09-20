import React, { useState } from 'react';
import {
  Camera, Plus, Edit2, Trash2, CheckCircle, AlertTriangle,
  RefreshCw, Radio, HardDrive, Video, X, Shield, Lock, ArrowLeft
} from 'lucide-react';

import { useTranslation } from '../../services/i18n.js';

export default function CameraManagementPage({
  cameras = [],
  onRefreshCameras
}) {
  const { t } = useTranslation();
  const [testingCamId, setTestingCamId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCam, setEditingCam] = useState(null);

  // Form state
  const [camId, setCamId] = useState('');
  const [name, setName] = useState('');
  const [sector, setSector] = useState('Sector Alpha');
  const [location, setLocation] = useState('');
  const [sourceType, setSourceType] = useState('FILE'); // 'FILE', 'WEBCAM', 'RTSP'
  const [sourceUrl, setSourceUrl] = useState('');
  const [rtspUser, setRtspUser] = useState('');
  const [rtspPass, setRtspPass] = useState('');
  const [formError, setFormError] = useState(null);

  const openAddModal = () => {
    setCamId(`CAM-0${cameras.length + 1}`);
    setName(`CAM-0${cameras.length + 1} - Perimeter Station`);
    setSector('Sector Alpha');
    setLocation('Post 44B - Forward Observer');
    setSourceType('FILE');
    setSourceUrl('Border_Test_03.mp4');
    setRtspUser('');
    setRtspPass('');
    setFormError(null);
    setEditingCam(null);
    setShowAddModal(true);
  };

  const openEditModal = (cam) => {
    setEditingCam(cam);
    setCamId(cam.id);
    setName(cam.name);
    setSector(cam.sector);
    setLocation(cam.location);
    setSourceType(cam.source_type || 'FILE');
    setSourceUrl(cam.source || '');
    setRtspUser('');
    setRtspPass('');
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveCamera = async (e) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      id: camId,
      name,
      sector,
      location,
      source_type: sourceType,
      source: sourceUrl,
      status: 'ACTIVE'
    };

    try {
      if (editingCam) {
        const res = await fetch(`/api/cameras/${editingCam.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to update camera');
        }
      } else {
        const res = await fetch('/api/cameras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Failed to create camera');
        }
      }

      setShowAddModal(false);
      if (onRefreshCameras) onRefreshCameras();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleTestConnection = async (cameraId) => {
    setTestingCamId(cameraId);
    try {
      const res = await fetch(`/api/cameras/${cameraId}/test-connection`, {
        method: 'POST'
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [cameraId]: data
      }));
      if (onRefreshCameras) onRefreshCameras();
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [cameraId]: {
          success: false,
          status: 'ERROR',
          message: `Network failure connecting to test endpoint: ${err.message}`
        }
      }));
    } finally {
      setTestingCamId(null);
    }
  };

  const handleDeleteCamera = async (cam) => {
    if (!window.confirm(`Delete camera station "${cam.id}"? This will detach assigned zones.`)) return;
    try {
      const res = await fetch(`/api/cameras/${cam.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (onRefreshCameras) onRefreshCameras();
      } else {
        const err = await res.json();
        alert(`Failed: ${err.detail}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="camera-management-page">
      {/* 1. Header */}
      <div className="tab-page-header">
        <div>
          <h2 className="tab-page-title">{t('cameraManagement')}</h2>
          <p className="tab-page-desc">
            {t('tagline')} — Camera Station Hardware & Video Feeds Management
          </p>
        </div>

        <div className="tab-header-actions">
          <button className="btn-primary" onClick={openAddModal}>
            <Plus size={14} /> Add Station
          </button>
        </div>
      </div>

      {/* 2. Camera Stations Grid */}
      <div className="camera-cards-grid">
        {cameras.map((cam) => {
          const isTesting = testingCamId === cam.id;
          const testRes = testResults[cam.id];
          const isRtsp = cam.source_type === 'RTSP';
          const isOnline = cam.status === 'ACTIVE';

          return (
            <div key={cam.id} className="cam-mgmt-card">
              <div className="cam-mgmt-card-header">
                <div className="cam-mgmt-id-row">
                  <div className="cam-mgmt-icon-wrap">
                    <Camera size={16} color="#22c55e" />
                  </div>
                  <div>
                    <h3 className="cam-mgmt-title">{cam.id}</h3>
                    <span className="cam-mgmt-subname">{cam.name}</span>
                  </div>
                </div>

                <div className="cam-mgmt-status-group">
                  <span className={`badge-cam-status ${isOnline ? 'online' : 'offline'}`}>
                    {isOnline ? 'ACTIVE' : 'NOT CONNECTED'}
                  </span>
                </div>
              </div>

              <div className="cam-mgmt-specs-grid">
                <div className="spec-item">
                  <span className="spec-label">Assigned Sector</span>
                  <span className="spec-value">{cam.sector}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Deployment Post</span>
                  <span className="spec-value">{cam.location}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Feed Protocol</span>
                  <span className="spec-value highlight">{cam.source_type || 'FILE'}</span>
                </div>
                <div className="spec-item">
                  <span className="spec-label">Source URI / Path</span>
                  <span className="spec-value mono" title={cam.source}>
                    {cam.source || 'None configured'}
                  </span>
                </div>
              </div>

              {/* RTSP Specific Warning if not connected */}
              {isRtsp && (!testRes || testRes.status !== 'CONNECTED') && (
                <div className="rtsp-unconnected-banner">
                  <AlertTriangle size={13} color="#f59e0b" />
                  <span><b>RTSP NOT CONNECTED:</b> Run connection test to verify RTSP socket.</span>
                </div>
              )}

              {/* Connection Test Result Box */}
              {testRes && (
                <div className={`test-result-box ${testRes.success ? 'success' : 'failure'}`}>
                  <div className="test-result-title">
                    {testRes.success ? <CheckCircle size={13} color="#22c55e" /> : <AlertTriangle size={13} color="#ef4444" />}
                    <span>STATUS: <b>{testRes.status}</b></span>
                  </div>
                  <div className="test-result-msg">{testRes.message}</div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="cam-mgmt-actions">
                <button
                  className="btn-cam-test"
                  onClick={() => handleTestConnection(cam.id)}
                  disabled={isTesting}
                >
                  <RefreshCw size={12} className={isTesting ? 'spin' : ''} />
                  {isTesting ? 'Testing Feed...' : 'Test Connection'}
                </button>

                <button
                  className="btn-cam-edit"
                  onClick={() => openEditModal(cam)}
                  title="Edit camera parameters"
                >
                  <Edit2 size={12} /> Edit
                </button>

                <button
                  className="btn-cam-delete"
                  onClick={() => handleDeleteCamera(cam)}
                  title="Remove station"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Add / Edit Camera Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCam ? `Edit Station: ${editingCam.id}` : 'Register New Camera Station'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-modal-back"
                  onClick={() => setShowAddModal(false)}
                  title="Go Back"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button className="btn-close" onClick={() => setShowAddModal(false)}><X size={16} /></button>
              </div>
            </div>


            <form onSubmit={handleSaveCamera}>
              <div className="modal-body form-body">
                {formError && (
                  <div className="alert-banner error" style={{ padding: '8px 12px', marginBottom: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '12px' }}>
                    {formError}
                  </div>
                )}

                <div className="form-group">
                  <label>Station ID (e.g. CAM-05)</label>
                  <input
                    type="text"
                    value={camId}
                    onChange={e => setCamId(e.target.value)}
                    disabled={!!editingCam}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Station Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group half">
                    <label>Perimeter Sector</label>
                    <select value={sector} onChange={e => setSector(e.target.value)}>
                      <option value="Sector Alpha">Sector Alpha</option>
                      <option value="Sector Bravo">Sector Bravo</option>
                      <option value="Sector Charlie">Sector Charlie</option>
                      <option value="Sector Delta">Sector Delta</option>
                    </select>
                  </div>

                  <div className="form-group half">
                    <label>Source Type</label>
                    <select value={sourceType} onChange={e => setSourceType(e.target.value)}>
                      <option value="FILE">FILE (Local MP4 Recording)</option>
                      <option value="WEBCAM">WEBCAM (USB Sensor / V4L2)</option>
                      <option value="RTSP">RTSP (IP Camera Live Stream)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Physical Location / Deployment Post</label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Forward Post 44A - Western Boundary"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>
                    {sourceType === 'FILE' ? 'Video File Name (in storage/videos)' :
                     sourceType === 'WEBCAM' ? 'Device Index (0, 1, 2)' :
                     'RTSP Stream URL (rtsp://...)'}
                  </label>
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder={sourceType === 'RTSP' ? 'rtsp://admin:pass@192.168.1.100:554/h264' : 'Border_Test_03.mp4'}
                    required
                  />
                </div>

                {sourceType === 'RTSP' && (
                  <div className="form-row">
                    <div className="form-group half">
                      <label>RTSP Username</label>
                      <input
                        type="text"
                        value={rtspUser}
                        onChange={e => setRtspUser(e.target.value)}
                        placeholder="admin"
                      />
                    </div>
                    <div className="form-group half">
                      <label>RTSP Password</label>
                      <input
                        type="password"
                        value={rtspPass}
                        onChange={e => setRtspPass(e.target.value)}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="submit" className="btn-primary">
                  {editingCam ? 'Save Changes' : 'Register Station'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  <ArrowLeft size={13} /> Back
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
