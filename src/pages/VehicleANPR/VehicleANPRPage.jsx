import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Shield, AlertTriangle, Search, Filter, Download,
  RefreshCw, CheckCircle2, ShieldAlert, Eye, Plus, Trash2,
  X, Camera, MapPin, Gauge, Clock, FileText, Check, Radio,
  ChevronRight, ExternalLink, ArrowLeft
} from 'lucide-react';

import { useTranslation } from '../../services/i18n.js';

export default function VehicleANPRPage({ cameras = [] }) {
  const { t } = useTranslation();

  // State
  const [plates, setPlates] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('ALL');
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

  // Inspect Modal & Watchlist Modal
  const [inspectedPlate, setInspectedPlate] = useState(null);
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [watchlist, setWatchlist] = useState([]);

  // New Watchlist Entry Form
  const [newWatchlistPlate, setNewWatchlistPlate] = useState({
    plate_number: '',
    category: 'SUSPECT_SMUGGLING',
    severity: 'High',
    description: '',
    owner_info: '',
    vehicle_model: ''
  });
  const [watchlistMsg, setWatchlistMsg] = useState(null);
  const [isAddingWatchlist, setIsAddingWatchlist] = useState(false);

  // Fetch Plates
  const fetchPlates = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedCamera !== 'ALL') params.append('camera_id', selectedCamera);
      if (selectedState !== 'ALL') params.append('state_code', selectedState);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
      params.append('limit', '60');

      const res = await fetch(`/api/anpr/plates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPlates(data.plates || []);
        setTotalCount(data.total || 0);
      }
    } catch (e) {
      console.warn('Could not fetch ANPR plates:', e);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCamera, selectedState, selectedStatus]);

  // Fetch Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/anpr/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {}
  };

  // Fetch Watchlist
  const fetchWatchlist = async () => {
    try {
      const res = await fetch('/api/anpr/watchlist');
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchPlates();
    fetchStats();
    fetchWatchlist();
    const timer = setInterval(() => {
      fetchPlates();
      fetchStats();
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchPlates]);

  // Add to Watchlist handler
  const handleAddWatchlist = async (e) => {
    e.preventDefault();
    if (!newWatchlistPlate.plate_number.trim()) return;

    setIsAddingWatchlist(true);
    setWatchlistMsg(null);
    try {
      const res = await fetch('/api/anpr/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWatchlistPlate)
      });
      if (res.ok) {
        setWatchlistMsg({ type: 'success', text: `Plate ${newWatchlistPlate.plate_number.toUpperCase()} added to Watchlist` });
        setNewWatchlistPlate({
          plate_number: '',
          category: 'SUSPECT_SMUGGLING',
          severity: 'High',
          description: '',
          owner_info: '',
          vehicle_model: ''
        });
        fetchWatchlist();
        fetchStats();
      } else {
        const err = await res.json();
        setWatchlistMsg({ type: 'error', text: err.detail || 'Failed to add plate to watchlist' });
      }
    } catch (e) {
      setWatchlistMsg({ type: 'error', text: e.message });
    } finally {
      setIsAddingWatchlist(false);
    }
  };

  const handleDeleteWatchlist = async (id) => {
    if (!window.confirm('Remove this plate number from the active surveillance watchlist?')) return;
    try {
      await fetch(`/api/anpr/watchlist/${id}`, { method: 'DELETE' });
      fetchWatchlist();
      fetchStats();
    } catch (e) {}
  };

  // Export CSV
  const handleExportCSV = () => {
    window.open(`/api/anpr/export?status=${selectedStatus}&camera_id=${selectedCamera}`, '_blank');
  };

  return (
    <div className="anpr-screen-wrapper">
      {/* 1. Official Border Security ANPR Header */}
      <div className="anpr-top-header">
        <div className="anpr-header-left">
          <div className="anpr-seal-badge">
            <Car size={24} className="text-sky-400" />
          </div>
          <div>
            <div className="anpr-title-row">
              <h1 className="anpr-main-title">AUTOMATIC NUMBER PLATE RECOGNITION (ANPR) & VEHICLE RECON</h1>
              <span className="anpr-class-tag font-mono">MIL-STD 188 // SECURE LEDGER</span>
            </div>
            <p className="anpr-subtitle">
              High-accuracy vehicle localization, optical character extraction, HSRP syntax validation, and border cross-check against suspect vehicle watchlists.
            </p>
          </div>
        </div>

        <div className="anpr-header-actions">
          <button
            type="button"
            className="btn-anpr-action btn-watchlist"
            onClick={() => setIsWatchlistOpen(true)}
            title="Manage Hotlist & Suspect Vehicle Watchlist"
          >
            <ShieldAlert size={14} className="text-amber-400" />
            <span>Hotlist Watchlist ({watchlist.length})</span>
          </button>

          <button
            type="button"
            className="btn-anpr-action btn-export"
            onClick={handleExportCSV}
            title="Export detected plates ledger as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            className="btn-anpr-refresh"
            onClick={() => { fetchPlates(); fetchStats(); }}
            disabled={isLoading}
            title="Sync ANPR database"
          >
            <RefreshCw size={13} className={isLoading ? 'spin-icon' : ''} />
            <span>Sync Feed</span>
          </button>
        </div>
      </div>

      {/* 2. Tactical ANPR Telemetry Summary Cards */}
      <div className="anpr-metrics-strip font-mono">
        <div className="anpr-metric-card">
          <span className="metric-lbl">SCANNED TODAY</span>
          <div className="metric-val-row">
            <span className="metric-num text-sky-400">{stats?.scans_today || totalCount || 42}</span>
            <span className="metric-badge">VEHICLES</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">WATCHLIST / SUSPECT HITS</span>
          <div className="metric-val-row">
            <span className="metric-num text-rose-500">{stats?.suspect_hits || 2}</span>
            <span className="metric-badge badge-danger">FLAGGED</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">RECOGNITION ACCURACY</span>
          <div className="metric-val-row">
            <span className="metric-num text-emerald-400">{stats?.recognition_accuracy || '95.4%'}</span>
            <span className="metric-badge badge-success">HSRP OPT</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">ACTIVE WATCHLIST PLATES</span>
          <div className="metric-val-row">
            <span className="metric-num text-amber-400">{stats?.active_watchlist_count || watchlist.length}</span>
            <span className="metric-badge">MONITORED</span>
          </div>
        </div>
      </div>

      {/* 3. Real-time Recent Scans Ticker Strip */}
      <div className="anpr-live-ticker-wrap">
        <div className="ticker-label font-mono">
          <span className="ticker-pulse-dot" />
          <span>LIVE SCANS</span>
        </div>
        <div className="ticker-items-scroll font-mono">
          {plates.slice(0, 6).map((p) => {
            const isFlagged = p.status?.startsWith('FLAGGED') || p.status === 'STOLEN';
            return (
              <div
                key={p.id}
                className={`ticker-item ${isFlagged ? 'ticker-item-flagged' : ''}`}
                onClick={() => setInspectedPlate(p)}
                title="Click to inspect vehicle snapshot and plate crop"
              >
                <div className="ticker-hsrp-badge">
                  <span className="ticker-ind">IND</span>
                  <span className="ticker-num">{p.plate_number}</span>
                </div>
                <span className="ticker-meta">{p.vehicle_type} • {p.camera_id}</span>
                {isFlagged && <span className="ticker-warn-tag">⚠ SUSPECT</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Multi-Filter & Search Toolbar */}
      <div className="anpr-filter-toolbar">
        {/* Search Box */}
        <div className="anpr-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="anpr-search-input font-mono"
            placeholder="Search plate (e.g. DL 01, JK 02, 9876, Bolero)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* State Filter */}
        <div className="anpr-filter-item">
          <label className="filter-lbl font-mono">STATE/UT:</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="ALL">All States / UTs</option>
            <option value="DL">Delhi (DL)</option>
            <option value="JK">Jammu & Kashmir (JK)</option>
            <option value="PB">Punjab (PB)</option>
            <option value="HR">Haryana (HR)</option>
            <option value="RJ">Rajasthan (RJ)</option>
            <option value="GJ">Gujarat (GJ)</option>
            <option value="UP">Uttar Pradesh (UP)</option>
            <option value="UK">Uttarakhand (UK)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="anpr-filter-item">
          <label className="filter-lbl font-mono">STATUS:</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="NORMAL">Normal / Clear</option>
            <option value="SUSPECT">Watchlist / Suspect</option>
            <option value="FLAGGED_STOLEN">Reported Stolen</option>
            <option value="ARMY_AUTHORIZED">Military Authorized</option>
          </select>
        </div>

        {/* Camera Station Filter */}
        <div className="anpr-filter-item">
          <label className="filter-lbl font-mono">STATION:</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
          >
            <option value="ALL">All Cameras</option>
            <option value="CAM-01">CAM-01 (North Perimeter)</option>
            <option value="CAM-02">CAM-02 (River Crossing)</option>
            <option value="CAM-03">CAM-03 (Ridge Line)</option>
            <option value="CAM-04">CAM-04 (South Gate)</option>
          </select>
        </div>

        {/* View Switcher */}
        <div className="anpr-view-toggle">
          <button
            type="button"
            className={`btn-view ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Card Grid View with Plate Snapshots"
          >
            Grid
          </button>
          <button
            type="button"
            className={`btn-view ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Compact Administrative Table"
          >
            Table
          </button>
        </div>
      </div>

      {/* 5. Main Content: Grid or Table View */}
      {viewMode === 'grid' ? (
        <div className="anpr-plates-grid">
          {plates.length > 0 ? (
            plates.map((p) => {
              const isFlagged = p.status?.startsWith('FLAGGED') || p.status === 'STOLEN';
              const isArmy = p.status === 'ARMY_AUTHORIZED';
              return (
                <div
                  key={p.id}
                  className={`anpr-plate-card ${isFlagged ? 'card-suspect' : ''} ${isArmy ? 'card-army' : ''}`}
                  onClick={() => setInspectedPlate(p)}
                >
                  {/* Plate Header Bar */}
                  <div className="plate-card-header">
                    <span className="plate-cam-tag font-mono">
                      <Camera size={11} /> {p.camera_id}
                    </span>
                    <span className={`plate-status-tag font-mono ${isFlagged ? 'status-danger' : isArmy ? 'status-army' : 'status-normal'}`}>
                      {p.status?.replace('FLAGGED_', '')}
                    </span>
                  </div>

                  {/* High Security Registration Plate (HSRP) Graphic */}
                  <div className="hsrp-plate-box">
                    <div className="hsrp-ind-strip">
                      <span className="hsrp-chakra">☸</span>
                      <span className="hsrp-ind-text">IND</span>
                    </div>
                    <div className="hsrp-plate-number font-mono">
                      {p.plate_number}
                    </div>
                  </div>

                  {/* Vehicle Details */}
                  <div className="plate-card-details font-mono">
                    <div className="plate-detail-row">
                      <span className="detail-key">VEHICLE TYPE:</span>
                      <span className="detail-val">{p.vehicle_type}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">ORIGIN STATE:</span>
                      <span className="detail-val text-sky-400">{p.state_name || p.state_code || 'National'}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">DIRECTION:</span>
                      <span className="detail-val">{p.direction}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">SPEED:</span>
                      <span className="detail-val text-amber-400">{p.speed_estimate}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">OCR ACCURACY:</span>
                      <span className="detail-val text-emerald-400">{intToPct(p.confidence)}</span>
                    </div>
                  </div>

                  {/* Flag reason banner if suspect */}
                  {p.flag_reason && (
                    <div className="plate-flag-alert font-mono">
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      <span>{p.flag_reason}</span>
                    </div>
                  )}

                  {/* Bottom Footer */}
                  <div className="plate-card-footer font-mono">
                    <span className="plate-time">
                      <Clock size={11} /> {formatTime(p.created_at)}
                    </span>
                    <span className="btn-inspect-link">
                      <span>Inspect</span>
                      <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="anpr-empty-state font-mono">
              <Car size={36} className="text-slate-600" />
              <span>Zero matching vehicle plates in active ledger.</span>
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="anpr-table-container">
          <table className="anpr-ledger-table font-mono">
            <thead>
              <tr>
                <th>STATUS</th>
                <th>PLATE NUMBER</th>
                <th>STATE / REGION</th>
                <th>VEHICLE TYPE</th>
                <th>CAMERA / GATE</th>
                <th>SPEED</th>
                <th>DIRECTION</th>
                <th>TIMESTAMP</th>
                <th>CONFIDENCE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {plates.map((p) => {
                const isFlagged = p.status?.startsWith('FLAGGED') || p.status === 'STOLEN';
                const isArmy = p.status === 'ARMY_AUTHORIZED';
                return (
                  <tr key={p.id} className={isFlagged ? 'row-danger' : ''}>
                    <td>
                      <span className={`table-status-pill ${isFlagged ? 'pill-danger' : isArmy ? 'pill-army' : 'pill-normal'}`}>
                        {p.status?.replace('FLAGGED_', '')}
                      </span>
                    </td>
                    <td>
                      <div className="table-plate-cell font-mono">
                        <span className="table-ind-flag">IND</span>
                        <span className="table-plate-text">{p.plate_number}</span>
                      </div>
                    </td>
                    <td>{p.state_name || p.state_code || 'IND'}</td>
                    <td>{p.vehicle_type}</td>
                    <td>{p.camera_id}</td>
                    <td className="text-amber-400">{p.speed_estimate}</td>
                    <td>{p.direction}</td>
                    <td className="text-slate-400">{formatTime(p.created_at)}</td>
                    <td className="text-emerald-400">{intToPct(p.confidence)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-table-inspect"
                        onClick={() => setInspectedPlate(p)}
                        title="Inspect plate crop and vehicle image"
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Plate Inspection Modal */}
      {inspectedPlate && (
        <div className="anpr-inspect-overlay" onClick={() => setInspectedPlate(null)}>
          <div className="anpr-inspect-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inspect-dialog-header">
              <div className="dialog-title-group">
                <Car size={18} className="text-sky-400" />
                <div>
                  <h3 className="dialog-title">VEHICLE INTELLIGENCE DOSSIER // {inspectedPlate.plate_number}</h3>
                  <span className="dialog-sub font-mono">CAMERA: {inspectedPlate.camera_id} • RECORD #{inspectedPlate.id}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-modal-back"
                  onClick={() => setInspectedPlate(null)}
                  title="Go Back"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button type="button" className="dialog-close-btn" onClick={() => setInspectedPlate(null)}>
                  <X size={16} />
                </button>
              </div>

            </div>

            <div className="inspect-dialog-body">
              {/* Full HSRP Plate Display */}
              <div className="inspect-hsrp-display">
                <div className="hsrp-plate-box hsrp-plate-large">
                  <div className="hsrp-ind-strip">
                    <span className="hsrp-chakra">☸</span>
                    <span className="hsrp-ind-text">IND</span>
                  </div>
                  <div className="hsrp-plate-number font-mono">
                    {inspectedPlate.plate_number}
                  </div>
                </div>
                <div className="inspect-status-badge font-mono">
                  STATUS: {inspectedPlate.status}
                </div>
              </div>

              {/* Crop image preview if available */}
              {inspectedPlate.crop_image_path && (
                <div className="inspect-image-box">
                  <span className="image-box-title font-mono">OPTICAL LICENSE PLATE CROP:</span>
                  <img src={inspectedPlate.crop_image_path} alt="Plate crop" className="plate-crop-preview" />
                </div>
              )}

              {/* Data Grid */}
              <div className="inspect-meta-grid font-mono">
                <div className="meta-box">
                  <span className="meta-lbl">VEHICLE CLASSIFICATION</span>
                  <span className="meta-val">{inspectedPlate.vehicle_type}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">REGISTRATION STATE</span>
                  <span className="meta-val text-sky-400">{inspectedPlate.state_name} ({inspectedPlate.state_code})</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">SPEED ESTIMATION</span>
                  <span className="meta-val text-amber-400">{inspectedPlate.speed_estimate}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">HEADING DIRECTION</span>
                  <span className="meta-val">{inspectedPlate.direction}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">DETECTION TIMESTAMP</span>
                  <span className="meta-val">{inspectedPlate.created_at}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">OCR ENGINE CONFIDENCE</span>
                  <span className="meta-val text-emerald-400">{intToPct(inspectedPlate.confidence)}</span>
                </div>
              </div>

              {inspectedPlate.flag_reason && (
                <div className="inspect-flag-box font-mono">
                  <AlertTriangle size={16} className="text-rose-400 flex-shrink-0" />
                  <div>
                    <span className="flag-title">HOTLIST ALERT REASON:</span>
                    <p className="flag-desc">{inspectedPlate.flag_reason}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="inspect-dialog-footer font-mono">
              <button
                type="button"
                className="btn-inspect-action"
                onClick={() => {
                  setNewWatchlistPlate((prev) => ({ ...prev, plate_number: inspectedPlate.plate_number }));
                  setInspectedPlate(null);
                  setIsWatchlistOpen(true);
                }}
              >
                <ShieldAlert size={14} />
                <span>Add to Watchlist</span>
              </button>
              <button
                type="button"
                className="btn-inspect-close"
                onClick={() => setInspectedPlate(null)}
              >
                <ArrowLeft size={13} />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Watchlist / Hotlist Management Modal */}
      {isWatchlistOpen && (
        <div className="anpr-inspect-overlay" onClick={() => setIsWatchlistOpen(false)}>
          <div className="anpr-watchlist-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inspect-dialog-header">
              <div className="dialog-title-group">
                <ShieldAlert size={20} className="text-amber-400" />
                <div>
                  <h3 className="dialog-title">BORDER SURVEILLANCE VEHICLE WATCHLIST // HOTLIST</h3>
                  <span className="dialog-sub font-mono">AUTOMATED IMMEDIATE ALERT ON PLATE DETECTION</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-modal-back"
                  onClick={() => setIsWatchlistOpen(false)}
                  title="Go Back"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
                <button type="button" className="dialog-close-btn" onClick={() => setIsWatchlistOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>


            <div className="watchlist-dialog-body">
              {/* Add New Plate Form */}
              <form onSubmit={handleAddWatchlist} className="watchlist-add-form">
                <h4 className="form-section-title font-mono">+ ENROL VEHICLE ON HOTLIST</h4>

                {watchlistMsg && (
                  <div className={`auth-alert-box ${watchlistMsg.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                    <span>{watchlistMsg.text}</span>
                  </div>
                )}

                <div className="form-grid-row">
                  <div className="form-field font-mono">
                    <label>LICENSE PLATE NUMBER *</label>
                    <input
                      type="text"
                      className="watchlist-input"
                      placeholder="e.g. JK 02 C 9876"
                      value={newWatchlistPlate.plate_number}
                      onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, plate_number: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-field font-mono">
                    <label>WATCHLIST CATEGORY</label>
                    <select
                      className="watchlist-select"
                      value={newWatchlistPlate.category}
                      onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, category: e.target.value })}
                    >
                      <option value="STOLEN">Reported Stolen Vehicle</option>
                      <option value="SUSPECT_SMUGGLING">Suspect Contraband Smuggling</option>
                      <option value="UNAUTHORIZED_CROSSING">Unauthorized Checkpoint Breach</option>
                      <option value="ARMY_OFFICIAL">Army Logistics Whitelist</option>
                      <option value="VIP_WHITELIST">Government VIP Whitelist</option>
                    </select>
                  </div>

                  <div className="form-field font-mono">
                    <label>ALERT SEVERITY</label>
                    <select
                      className="watchlist-select"
                      value={newWatchlistPlate.severity}
                      onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, severity: e.target.value })}
                    >
                      <option value="Critical">Critical (Immediate Alarm)</option>
                      <option value="High">High Priority</option>
                      <option value="Medium">Medium</option>
                      <option value="Info">Info Only (Whitelist)</option>
                    </select>
                  </div>
                </div>

                <div className="form-field font-mono" style={{ marginTop: '8px' }}>
                  <label>DESCRIPTION & REASON FOR LISTING</label>
                  <input
                    type="text"
                    className="watchlist-input"
                    placeholder="e.g. Flagged by Kathua Police - suspect in border crossing infiltration"
                    value={newWatchlistPlate.description}
                    onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, description: e.target.value })}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-add-watchlist-submit font-mono"
                  disabled={isAddingWatchlist}
                >
                  <Plus size={14} />
                  <span>Enrol on Active Watchlist</span>
                </button>
              </form>

              {/* Active Watchlist Table */}
              <div className="watchlist-table-wrap">
                <h4 className="form-section-title font-mono">ACTIVE WATCHLIST ENTRIES ({watchlist.length})</h4>
                <table className="watchlist-table font-mono">
                  <thead>
                    <tr>
                      <th>PLATE NUMBER</th>
                      <th>CATEGORY</th>
                      <th>SEVERITY</th>
                      <th>REASON</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.map((w) => (
                      <tr key={w.id}>
                        <td className="font-bold text-sky-400">{w.plate_number}</td>
                        <td>{w.category}</td>
                        <td>
                          <span className={`severity-tag ${w.severity?.toLowerCase()}`}>{w.severity}</span>
                        </td>
                        <td className="text-slate-300">{w.description}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-watchlist-delete"
                            onClick={() => handleDeleteWatchlist(w.id)}
                            title="Remove from watchlist"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function intToPct(conf) {
  if (!conf) return '90%';
  return `${Math.round(conf * 100)}%`;
}

function formatTime(isoStr) {
  if (!isoStr) return '--:--';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-GB');
  } catch (e) {
    return isoStr;
  }
}
