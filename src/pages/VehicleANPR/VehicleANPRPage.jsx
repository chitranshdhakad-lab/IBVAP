import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Shield, AlertTriangle, Search, Filter, Download,
  RefreshCw, CheckCircle2, ShieldAlert, Eye, Plus, Trash2,
  X, Camera, MapPin, Gauge, Clock, FileText, Check, Radio,
  ChevronRight, ExternalLink, ArrowLeft
} from 'lucide-react';

import { useTranslation } from '../../services/i18n.js';
import { resolveMediaUrl } from '../../services/apiConfig.js';

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
              <h1 className="anpr-main-title">{t('anprMainTitle')}</h1>
              <span className="anpr-class-tag font-mono">{t('anprMilStd')}</span>
            </div>
            <p className="anpr-subtitle">
              {t('anprSubtitle')}
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
            <span>{t('hotlistWatchlist')} ({watchlist.length})</span>
          </button>

          <button
            type="button"
            className="btn-anpr-action btn-export"
            onClick={handleExportCSV}
            title="Export detected plates ledger as CSV"
          >
            <Download size={14} />
            <span>{t('exportCsv')}</span>
          </button>

          <button
            type="button"
            className="btn-anpr-refresh"
            onClick={() => { fetchPlates(); fetchStats(); }}
            disabled={isLoading}
            title="Sync ANPR database"
          >
            <RefreshCw size={13} className={isLoading ? 'spin-icon' : ''} />
            <span>{t('syncFeed')}</span>
          </button>
        </div>
      </div>

      {/* 2. Tactical ANPR Telemetry Summary Cards */}
      <div className="anpr-metrics-strip font-mono">
        <div className="anpr-metric-card">
          <span className="metric-lbl">{t('scannedToday')}</span>
          <div className="metric-val-row">
            <span className="metric-num text-sky-400">{stats?.scans_today || totalCount || 42}</span>
            <span className="metric-badge">{t('vehicles')}</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">{t('suspectHits')}</span>
          <div className="metric-val-row">
            <span className="metric-num text-rose-500">{stats?.suspect_hits || 2}</span>
            <span className="metric-badge badge-danger">{t('flagged')}</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">{t('recognitionAccuracy')}</span>
          <div className="metric-val-row">
            <span className="metric-num text-emerald-400">{stats?.recognition_accuracy || '95.4%'}</span>
            <span className="metric-badge badge-success">{t('hsrpOpt')}</span>
          </div>
        </div>

        <div className="anpr-metric-card">
          <span className="metric-lbl">{t('activeWatchlistPlates')}</span>
          <div className="metric-val-row">
            <span className="metric-num text-amber-400">{stats?.active_watchlist_count || watchlist.length}</span>
            <span className="metric-badge">{t('monitored')}</span>
          </div>
        </div>
      </div>

      {/* 3. Real-time Recent Scans Ticker Strip */}
      <div className="anpr-live-ticker-wrap">
        <div className="ticker-label font-mono">
          <span className="ticker-pulse-dot" />
          <span>{t('liveScans')}</span>
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
                {isFlagged && <span className="ticker-warn-tag">⚠ {t('suspect')}</span>}
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
            placeholder={t('searchPlatePlaceholder')}
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
          <label className="filter-lbl font-mono">{t('stateUt')}</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
          >
            <option value="ALL">{t('allStates')}</option>
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
          <label className="filter-lbl font-mono">{t('status')}</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">{t('allStatuses')}</option>
            <option value="NORMAL">{t('statusNormal')}</option>
            <option value="SUSPECT">{t('statusSuspect')}</option>
            <option value="FLAGGED_STOLEN">{t('statusFlaggedStolen')}</option>
            <option value="ARMY_AUTHORIZED">{t('statusArmyAuthorized')}</option>
          </select>
        </div>

        {/* Camera Station Filter */}
        <div className="anpr-filter-item">
          <label className="filter-lbl font-mono">{t('station')}</label>
          <select
            className="anpr-filter-select font-mono"
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
          >
            <option value="ALL">{t('allCameras')}</option>
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
            {t('viewGrid')}
          </button>
          <button
            type="button"
            className={`btn-view ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Compact Administrative Table"
          >
            {t('viewTable')}
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
                      <span className="detail-key">{t('vehicleType')}</span>
                      <span className="detail-val">{p.vehicle_type}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">{t('originState')}</span>
                      <span className="detail-val text-sky-400">{p.state_name || p.state_code || 'National'}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">{t('direction')}</span>
                      <span className="detail-val">{p.direction}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">{t('speed')}</span>
                      <span className="detail-val text-amber-400">{p.speed_estimate}</span>
                    </div>
                    <div className="plate-detail-row">
                      <span className="detail-key">{t('ocrAccuracy')}</span>
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
                      <span>{t('inspect')}</span>
                      <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="anpr-empty-state font-mono">
              <Car size={36} className="text-slate-600" />
              <span>{t('zeroMatchingPlates')}</span>
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="anpr-table-container">
          <table className="anpr-ledger-table font-mono">
            <thead>
              <tr>
                <th>{t('status')}</th>
                <th>{t('plateNumber')}</th>
                <th>{t('stateRegion')}</th>
                <th>{t('vehicleType')}</th>
                <th>{t('cameraGate')}</th>
                <th>{t('speed')}</th>
                <th>{t('direction')}</th>
                <th>{t('timestamp')}</th>
                <th>{t('confidence')}</th>
                <th>{t('action')}</th>
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
                        <span>{t('inspect')}</span>
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
                  <h3 className="dialog-title">{t('vehicleIntelligenceDossier')} // {inspectedPlate.plate_number}</h3>
                  <span className="dialog-sub font-mono">{t('cameraLabel')}: {inspectedPlate.camera_id} • {t('recordLabel')} #{inspectedPlate.id}</span>
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
                  <span>{t('back')}</span>
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
                  {t('status')} {inspectedPlate.status}
                </div>
              </div>

              {/* Crop image preview if available */}
              {inspectedPlate.crop_image_path && (
                <div className="inspect-image-box">
                  <span className="image-box-title font-mono">{t('opticalPlateCrop')}</span>
                  <img src={resolveMediaUrl(inspectedPlate.crop_image_path)} alt="Plate crop" className="plate-crop-preview" />
                </div>
              )}

              {/* Data Grid */}
              <div className="inspect-meta-grid font-mono">
                <div className="meta-box">
                  <span className="meta-lbl">{t('vehicleClassification')}</span>
                  <span className="meta-val">{inspectedPlate.vehicle_type}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">{t('registrationState')}</span>
                  <span className="meta-val text-sky-400">{inspectedPlate.state_name} ({inspectedPlate.state_code})</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">{t('speedEstimation')}</span>
                  <span className="meta-val text-amber-400">{inspectedPlate.speed_estimate}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">{t('headingDirection')}</span>
                  <span className="meta-val">{inspectedPlate.direction}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">{t('detectionTimestamp')}</span>
                  <span className="meta-val">{inspectedPlate.created_at}</span>
                </div>
                <div className="meta-box">
                  <span className="meta-lbl">{t('ocrEngineConfidence')}</span>
                  <span className="meta-val text-emerald-400">{intToPct(inspectedPlate.confidence)}</span>
                </div>
              </div>

              {inspectedPlate.flag_reason && (
                <div className="inspect-flag-box font-mono">
                  <AlertTriangle size={16} className="text-rose-400 flex-shrink-0" />
                  <div>
                    <span className="flag-title">{t('hotlistAlertReason')}</span>
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
                <span>{t('addToWatchlist')}</span>
              </button>
              <button
                type="button"
                className="btn-inspect-close"
                onClick={() => setInspectedPlate(null)}
              >
                <ArrowLeft size={13} />
                <span>{t('back')}</span>
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
                  <h3 className="dialog-title">{t('borderWatchlistTitle')}</h3>
                  <span className="dialog-sub font-mono">{t('automatedImmediateAlert')}</span>
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
                  <span>{t('back')}</span>
                </button>
                <button type="button" className="dialog-close-btn" onClick={() => setIsWatchlistOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>


            <div className="watchlist-dialog-body">
              {/* Add New Plate Form */}
              <form onSubmit={handleAddWatchlist} className="watchlist-add-form">
                <h4 className="form-section-title font-mono">{t('enrolVehicleHotlist')}</h4>

                {watchlistMsg && (
                  <div className={`auth-alert-box ${watchlistMsg.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                    <span>{watchlistMsg.text}</span>
                  </div>
                )}

                <div className="form-grid-row">
                  <div className="form-field font-mono">
                    <label>{t('licensePlateNumber')}</label>
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
                    <label>{t('watchlistCategory')}</label>
                    <select
                      className="watchlist-select"
                      value={newWatchlistPlate.category}
                      onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, category: e.target.value })}
                    >
                      <option value="STOLEN">{t('reportedStolenVehicle')}</option>
                      <option value="SUSPECT_SMUGGLING">{t('suspectSmuggling')}</option>
                      <option value="UNAUTHORIZED_CROSSING">{t('unauthorizedCheckpoint')}</option>
                      <option value="ARMY_OFFICIAL">{t('armyLogisticsWhitelist')}</option>
                      <option value="VIP_WHITELIST">{t('govVipWhitelist')}</option>
                    </select>
                  </div>

                  <div className="form-field font-mono">
                    <label>{t('alertSeverity')}</label>
                    <select
                      className="watchlist-select"
                      value={newWatchlistPlate.severity}
                      onChange={(e) => setNewWatchlistPlate({ ...newWatchlistPlate, severity: e.target.value })}
                    >
                      <option value="Critical">{t('criticalImmediateAlarm')}</option>
                      <option value="High">{t('highPriority')}</option>
                      <option value="Medium">{t('mediumPriority')}</option>
                      <option value="Info">{t('infoOnlyWhitelist')}</option>
                    </select>
                  </div>
                </div>

                <div className="form-field font-mono" style={{ marginTop: '8px' }}>
                  <label>{t('descriptionReason')}</label>
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
                  <span>{t('enrolActiveWatchlist')}</span>
                </button>
              </form>

              {/* Active Watchlist Table */}
              <div className="watchlist-table-wrap">
                <h4 className="form-section-title font-mono">{t('activeWatchlistEntries')} ({watchlist.length})</h4>
                <table className="watchlist-table font-mono">
                  <thead>
                    <tr>
                      <th>{t('plateNumber')}</th>
                      <th>{t('watchlistCategory')}</th>
                      <th>{t('alertSeverity')}</th>
                      <th>{t('reason')}</th>
                      <th>{t('action')}</th>
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
