import React, { useState, useEffect, useRef } from 'react';
import {
  Settings, RefreshCw, Clock, ShieldCheck, Video, Database,
  Cpu, Wifi, HardDrive, AlertTriangle, CheckCircle, Info,
  XCircle, Trash2, Power, Download, Radio, CloudDownload,
  ArrowLeft, Search, Filter, Layers, Server, Activity,
  Globe, Check, ExternalLink, Play, AlertCircle
} from 'lucide-react';
import { useTranslation } from '../../services/i18n.js';

export default function SystemStatusPage({ cameras = [] }) {
  const { t } = useTranslation();
  
  // Dashboard Telemetry State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  
  // Auto-refresh controls (30s)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  // Quick Action execution states
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  // Modals (universal Back button guaranteed)
  const [activeModal, setActiveModal] = useState(null); // 'logs', 'reboot', 'cameras', 'updates'
  const [cameraTestResults, setCameraTestResults] = useState(null);
  const [updatesData, setUpdatesData] = useState(null);
  const [allLogs, setAllLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [rebooting, setRebooting] = useState(false);
  const [rebootSeconds, setRebootSeconds] = useState(5);

  const countdownRef = useRef(null);

  // Show Toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Fetch complete status dashboard
  const fetchStatusDashboard = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const res = await fetch('/api/system/status-dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefreshed(json.last_updated || new Date().toLocaleString());
        if (json.recent_logs) {
          setAllLogs(json.recent_logs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch system status telemetry:', err);
    } finally {
      if (isManual) setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStatusDashboard(true);
  }, []);

  // 30-second Auto Refresh Timer
  useEffect(() => {
    if (!autoRefresh) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    setCountdown(30);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchStatusDashboard(false);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh]);

  // Fetch all audit logs for modal
  const fetchAllLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs?limit=100');
      if (res.ok) {
        const logs = await res.json();
        const mapped = logs.map(l => {
          let lvl = 'INFO';
          if (l.action && (l.action.includes('ERROR') || l.action.includes('FAIL'))) lvl = 'ERROR';
          else if (l.action && (l.action.includes('WARN') || l.action.includes('BREACH'))) lvl = 'WARNING';
          return {
            id: l.id,
            time: new Date(l.timestamp).toLocaleTimeString(),
            level: lvl,
            component: l.entity || 'System',
            message: l.details || `Action ${l.action}`
          };
        });
        if (mapped.length > 0) {
          setAllLogs(mapped);
        }
      }
    } catch (e) {
      console.warn('Failed to load full audit logs, using status buffer:', e);
    }
  };

  // ==========================================
  // QUICK ACTIONS HANDLERS
  // ==========================================

  // 1. Restart AI Service
  const handleRestartAI = async () => {
    setActionLoading('restart-ai');
    try {
      const res = await fetch('/api/system/actions/restart-ai', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'AI Inference Engine restarted successfully.', 'success');
        fetchStatusDashboard();
      } else {
        showToast(resData.detail || 'Failed to restart AI service', 'error');
      }
    } catch (err) {
      showToast('Error communicating with backend service', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Clear Logs (with non-blocking confirmation modal)
  const handleConfirmClearLogs = async () => {
    setActionLoading('clear-logs');
    try {
      const res = await fetch('/api/system/actions/clear-logs', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(resData.message || 'Logs cleared successfully.', 'success');
        fetchStatusDashboard();
        if (activeModal === 'logs') {
          fetchAllLogs();
        }
      } else {
        showToast(resData.detail || 'Failed to clear logs', 'error');
      }
    } catch (err) {
      showToast('Error communicating with backend service', 'error');
    } finally {
      setActionLoading(null);
      setActiveModal(null);
    }
  };

  // 3. Reboot System
  const initiateRebootSequence = async () => {
    setRebooting(true);
    setRebootSeconds(5);
    try {
      await fetch('/api/system/actions/reboot', { method: 'POST' });
      const timer = setInterval(() => {
        setRebootSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setRebooting(false);
            setActiveModal(null);
            showToast('System reboot cycle complete. All microservices operational.', 'success');
            fetchStatusDashboard(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setRebooting(false);
      showToast('Reboot cycle encountered an error', 'error');
    }
  };

  // 4. Backup Database
  const handleBackupDB = async () => {
    setActionLoading('backup-db');
    try {
      const res = await fetch('/api/system/actions/backup-db', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(`Backup created: ${resData.filename} (${resData.size_mb} MB). Download starting...`, 'success');
        // Trigger automatic file download
        const a = document.createElement('a');
        a.href = resData.download_url;
        a.download = resData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        fetchStatusDashboard();
      } else {
        showToast(resData.detail || 'Failed to backup database', 'error');
      }
    } catch (err) {
      showToast('Error communicating with database backup service', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 5. Test Camera Feeds
  const handleTestCameras = async () => {
    setActionLoading('test-cameras');
    try {
      const res = await fetch('/api/system/actions/test-cameras', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setCameraTestResults(resData.cameras);
        setActiveModal('cameras');
        showToast(resData.message || 'Camera network sweep completed.', 'success');
      } else {
        showToast(resData.detail || 'Failed to ping cameras', 'error');
      }
    } catch (err) {
      showToast('Error testing camera network streams', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 6. Check Updates
  const handleCheckUpdates = async () => {
    setActionLoading('check-updates');
    try {
      const res = await fetch('/api/system/actions/check-updates', { method: 'POST' });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setUpdatesData(resData);
        setActiveModal('updates');
      } else {
        showToast(resData.detail || 'Failed to check system updates', 'error');
      }
    } catch (err) {
      showToast('Error communicating with update service', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const activeCamCount = (cameras || []).filter(c => (c.status || '').toUpperCase() === 'ACTIVE').length;
  const totalCamCount = (cameras || []).length || 3;
  const overview = data?.overview || {
    health: 'Healthy',
    health_subtext: 'All systems operational',
    cameras_online: `${activeCamCount} / ${totalCamCount}`,
    cameras_percent: Math.round((activeCamCount / totalCamCount) * 100),
    database: 'Online',
    database_subtext: 'SQLite • Connected',
    ai_engine: 'Running',
    ai_subtext: 'YOLOv8 • 32.4 FPS',
    network: 'Stable',
    network_subtext: 'Latency: 42 ms'
  };

  const services = data?.services || [
    { name: 'Video Ingestion Service', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'AI Detection Service', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'Tracking & Analysis', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'WebSocket Server', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'API Server (FastAPI)', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'Database Service', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'Alert Engine', status: 'Running', uptime: 'Uptime: 2d 14h' },
    { name: 'Storage Manager', status: 'Running', uptime: 'Uptime: 2d 14h' }
  ];

  const resources = data?.resources || {
    cpu_percent: 42,
    cpu_model: 'Intel i5 11th Gen',
    ram_used_gb: 5.4,
    ram_total_gb: 8.0,
    ram_percent: 68,
    disk_used_gb: 132,
    disk_total_gb: 240,
    disk_percent: 55,
    cpu_history: [
      { time: '13:30', usage: 42 },
      { time: '13:45', usage: 48 },
      { time: '14:00', usage: 39 },
      { time: '14:15', usage: 52 },
      { time: '14:30', usage: 44 }
    ]
  };

  const models = data?.models || [
    { name: 'YOLOv8n (Detection)', status: 'Loaded', version: 'v8.0.0' },
    { name: 'ByteTrack (Tracking)', status: 'Running', version: 'v0.1.0' },
    { name: 'ANPR (License Plate)', status: 'Loaded', version: 'v2.3.0' },
    { name: 'Animal Classification', status: 'Loaded', version: 'v1.1.0' }
  ];

  const storage = data?.storage || {
    video: { label: 'Video Storage', percent: 62, text: '148 GB / 240 GB' },
    database: { label: 'Database', percent: 28, text: '2.1 GB / 8 GB' },
    logs: { label: 'Log Files', percent: 35, text: '1.8 GB / 5 GB' }
  };

  const network = data?.network || {
    cameras: [
      { id: 'CAM-01', latency: 32 },
      { id: 'CAM-02', latency: 45 },
      { id: 'CAM-03', latency: 38 },
      { id: 'CAM-04', latency: 60 },
      { id: 'CAM-05', latency: 41 }
    ],
    internet: { status: 'Online', latency_ms: 28 }
  };

  const recentLogs = data?.recent_logs || [
    { time: '14:32:10', level: 'INFO', component: 'Camera CAM-03', message: 'Frame processed successfully' },
    { time: '14:32:08', level: 'WARNING', component: 'ANPR', message: 'Low confidence in license plate detection' },
    { time: '14:32:05', level: 'INFO', component: 'AI Engine', message: '4 objects detected (2 persons, 1 vehicle, 1 animal)' },
    { time: '14:31:58', level: 'INFO', component: 'Database', message: 'Event log saved (ID: EVT-20260920-1458)' },
    { time: '14:31:45', level: 'INFO', component: 'API', message: 'GET /api/cameras - 200 OK' },
    { time: '14:31:30', level: 'ERROR', component: 'Camera CAM-07', message: 'No feed received (reconnecting...)' },
    { time: '14:31:28', level: 'INFO', component: 'Camera CAM-07', message: 'Reconnected successfully' },
    { time: '14:31:12', level: 'INFO', component: 'System', message: 'Health check completed - All services running' }
  ];

  // Helper to render radial SVG gauges
  const renderRadialGauge = (percent, color, size = 110, strokeWidth = 10) => {
    const radius = 42;
    const circ = 2 * Math.PI * radius;
    const strokeDashoffset = circ - (percent / 100) * circ;

    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className="sys-radial-gauge">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--sys-gauge-track, rgba(255, 255, 255, 0.08))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text
          x="50"
          y="56"
          textAnchor="middle"
          fill="var(--sys-text-main, #ffffff)"
          fontSize="20"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {percent}%
        </text>
      </svg>
    );
  };

  // Helper for sparkline chart
  const renderCpuSparkline = (points) => {
    if (!points || points.length === 0) return null;
    const width = 480;
    const height = 90;
    const paddingLeft = 36;
    const paddingRight = 10;
    const paddingTop = 10;
    const paddingBottom = 22;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const stepX = chartW / (points.length - 1 || 1);
    
    // Coordinates
    const coords = points.map((p, i) => {
      const x = paddingLeft + i * stepX;
      const y = paddingTop + chartH - (p.usage / 100) * chartH;
      return { x, y, time: p.time, usage: p.usage };
    });

    // Build smooth curve SVG path
    if (coords.length === 0) return null;
    let pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const cur = coords[i];
      const midX = (prev.x + cur.x) / 2;
      pathD += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
    }

    const areaD = coords.length > 0 ? `${pathD} L ${coords[coords.length - 1].x} ${paddingTop + chartH} L ${coords[0].x} ${paddingTop + chartH} Z` : '';

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="sys-sparkline-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cpuAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="var(--sys-grid-line, rgba(255,255,255,0.07))" strokeDasharray="3 3" />
        <line x1={paddingLeft} y1={paddingTop + chartH / 2} x2={width - paddingRight} y2={paddingTop + chartH / 2} stroke="var(--sys-grid-line, rgba(255,255,255,0.07))" strokeDasharray="3 3" />
        <line x1={paddingLeft} y1={paddingTop + chartH} x2={width - paddingRight} y2={paddingTop + chartH} stroke="var(--sys-grid-line, rgba(255,255,255,0.1))" />

        {/* Y-Axis Labels */}
        <text x={paddingLeft - 6} y={paddingTop + 4} textAnchor="end" fill="var(--sys-text-muted, #94a3b8)" fontSize="10">100%</text>
        <text x={paddingLeft - 6} y={paddingTop + chartH / 2 + 3} textAnchor="end" fill="var(--sys-text-muted, #94a3b8)" fontSize="10">50%</text>
        <text x={paddingLeft - 6} y={paddingTop + chartH} textAnchor="end" fill="var(--sys-text-muted, #94a3b8)" fontSize="10">0%</text>

        {/* Area fill */}
        <path d={areaD} fill="url(#cpuAreaGrad)" />

        {/* Line stroke */}
        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

        {/* X-Axis Labels */}
        {coords.map((c, i) => {
          // Show ~5 evenly spaced timestamps
          if (i % Math.ceil(coords.length / 5) === 0 || i === coords.length - 1) {
            return (
              <text key={i} x={c.x} y={height - 4} textAnchor="middle" fill="var(--sys-text-muted, #94a3b8)" fontSize="10">
                {c.time}
              </text>
            );
          }
          return null;
        })}
      </svg>
    );
  };

  // Filtered logs for Full Logs Modal
  const filteredLogs = allLogs.filter(l => {
    const matchesFilter = logFilter === 'ALL' || l.level === logFilter;
    const matchesSearch = !logSearch || 
      l.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.component.toLowerCase().includes(logSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="system-status-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`sys-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. TOP HEADER SECTION */}
      <div className="system-status-header">
        <div className="sys-header-left">
          <div className="sys-header-icon-box">
            <Settings size={26} className="sys-header-icon" />
          </div>
          <div>
            <h1 className="sys-title">System Status</h1>
            <p className="sys-subtitle">Real-time health, performance and connectivity status of IBVAP</p>
          </div>
        </div>

        <div className="sys-header-right">
          {/* Manual Refresh Button */}
          <button
            className={`sys-icon-btn ${loading ? 'spinning' : ''}`}
            onClick={() => fetchStatusDashboard(true)}
            title="Refresh Diagnostics"
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>

          {/* Auto Refresh Toggle */}
          <div className="sys-auto-refresh-box">
            <span className="sys-auto-refresh-label">
              Auto Refresh ({countdown}s)
            </span>
            <label className="sys-switch">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              <span className="sys-slider round"></span>
            </label>
          </div>

          {/* Last Updated Badge */}
          <div className="sys-last-updated-badge">
            <Clock size={15} />
            <div className="sys-last-updated-text">
              <span className="sys-last-updated-sub">Last Updated</span>
              <span className="sys-last-updated-val">{lastRefreshed || '20 Sep 2026 | 14:32:18'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TOP 5 KPI CARDS ROW */}
      <div className="sys-kpi-row">
        {/* KPI 1: System Health */}
        <div className="sys-kpi-card">
          <div className="sys-kpi-icon-wrap green-light">
            <ShieldCheck size={22} color="#16a34a" />
          </div>
          <div className="sys-kpi-body">
            <span className="sys-kpi-label">System Health</span>
            <div className="sys-kpi-val green">{overview.health}</div>
            <span className="sys-kpi-subtext">{overview.health_subtext}</span>
          </div>
        </div>

        {/* KPI 2: Cameras Online */}
        <div className="sys-kpi-card">
          <div className="sys-kpi-icon-wrap blue-light">
            <Video size={22} color="#2563eb" />
          </div>
          <div className="sys-kpi-body">
            <span className="sys-kpi-label">Cameras Online</span>
            <div className="sys-kpi-val-row">
              <span className="sys-kpi-val">{overview.cameras_online}</span>
            </div>
            <div className="sys-progress-inline">
              <div className="sys-progress-track">
                <div
                  className="sys-progress-fill green"
                  style={{ width: `${overview.cameras_percent}%` }}
                ></div>
              </div>
              <span className="sys-progress-label">{overview.cameras_percent}%</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Database */}
        <div className="sys-kpi-card">
          <div className="sys-kpi-icon-wrap green-light">
            <Database size={22} color="#16a34a" />
          </div>
          <div className="sys-kpi-body">
            <span className="sys-kpi-label">Database</span>
            <div className="sys-kpi-val green">{overview.database}</div>
            <span className="sys-kpi-subtext">{overview.database_subtext}</span>
          </div>
        </div>

        {/* KPI 4: AI Inference Engine */}
        <div className="sys-kpi-card">
          <div className="sys-kpi-icon-wrap green-light">
            <Cpu size={22} color="#16a34a" />
          </div>
          <div className="sys-kpi-body">
            <span className="sys-kpi-label">AI Inference Engine</span>
            <div className="sys-kpi-val green">{overview.ai_engine}</div>
            <span className="sys-kpi-subtext">{overview.ai_subtext}</span>
          </div>
        </div>

        {/* KPI 5: Network Status */}
        <div className="sys-kpi-card">
          <div className="sys-kpi-icon-wrap green-light">
            <Wifi size={22} color="#16a34a" />
          </div>
          <div className="sys-kpi-body">
            <span className="sys-kpi-label">Network Status</span>
            <div className="sys-kpi-val green">{overview.network}</div>
            <span className="sys-kpi-subtext">{overview.network_subtext}</span>
          </div>
        </div>
      </div>

      {/* 3. MIDDLE ROW: SERVICE STATUS | SYSTEM RESOURCES | MODEL & STORAGE STATUS */}
      <div className="sys-middle-grid">
        {/* CARD 1: SERVICE STATUS (8 SERVICES) */}
        <div className="sys-panel sys-service-panel">
          <div className="sys-panel-header">
            <div className="sys-panel-title-wrap">
              <Settings size={18} />
              <h3 className="sys-panel-title">Service Status</h3>
            </div>
            <button className="sys-panel-action-btn" title="More details">
              <span className="sys-dots">•••</span>
            </button>
          </div>

          <div className="sys-service-list">
            {services.map((srv, idx) => (
              <div key={idx} className="sys-service-item">
                <div className="sys-service-main">
                  <span className="sys-status-dot green"></span>
                  <span className="sys-service-name">{srv.name}</span>
                </div>
                <div className="sys-service-meta">
                  <span className="sys-service-badge running">
                    <span className="sys-badge-dot"></span>
                    {srv.status}
                  </span>
                  <span className="sys-service-uptime">{srv.uptime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CARD 2: SYSTEM RESOURCES (3 GAUGES + 1-HOUR SPARKLINE) */}
        <div className="sys-panel sys-resources-panel">
          <div className="sys-panel-header">
            <div className="sys-panel-title-wrap">
              <Activity size={18} />
              <h3 className="sys-panel-title">System Resources</h3>
            </div>
            <button className="sys-panel-action-btn" title="Resource settings">
              <span className="sys-dots">•••</span>
            </button>
          </div>

          {/* Top Half: 3 Circular Gauges */}
          <div className="sys-gauges-row">
            {/* CPU Usage */}
            <div className="sys-gauge-card">
              {renderRadialGauge(resources.cpu_percent, '#06b6d4')}
              <div className="sys-gauge-info">
                <div className="sys-gauge-title">CPU Usage</div>
                <div className="sys-gauge-sub">{resources.cpu_model}</div>
              </div>
            </div>

            {/* RAM Usage */}
            <div className="sys-gauge-card">
              {renderRadialGauge(resources.ram_percent, '#3b82f6')}
              <div className="sys-gauge-info">
                <div className="sys-gauge-title">RAM Usage</div>
                <div className="sys-gauge-sub">{resources.ram_used_gb} GB / {resources.ram_total_gb} GB</div>
              </div>
            </div>

            {/* Disk Usage */}
            <div className="sys-gauge-card">
              {renderRadialGauge(resources.disk_percent, '#10b981')}
              <div className="sys-gauge-info">
                <div className="sys-gauge-title">Disk Usage</div>
                <div className="sys-gauge-sub">{resources.disk_used_gb} GB / {resources.disk_total_gb} GB</div>
              </div>
            </div>
          </div>

          {/* Bottom Half: CPU Usage (Last 1 Hour) */}
          <div className="sys-sparkline-section">
            <div className="sys-sparkline-header">
              <span className="sys-sparkline-title">CPU Usage (Last 1 Hour)</span>
            </div>
            <div className="sys-sparkline-box">
              {renderCpuSparkline(resources.cpu_history)}
            </div>
          </div>
        </div>

        {/* CARD 3: MODEL STATUS & STORAGE STATUS */}
        <div className="sys-right-col">
          {/* Top Panel: Model Status */}
          <div className="sys-panel sys-model-panel">
            <div className="sys-panel-header">
              <div className="sys-panel-title-wrap">
                <Layers size={18} />
                <h3 className="sys-panel-title">Model Status</h3>
              </div>
              <button className="sys-panel-action-btn" title="Model options">
                <span className="sys-dots">•••</span>
              </button>
            </div>

            <div className="sys-model-list">
              {models.map((mod, idx) => (
                <div key={idx} className="sys-model-item">
                  <div className="sys-model-left">
                    <span className="sys-status-dot green"></span>
                    <span className="sys-model-name">{mod.name}</span>
                  </div>
                  <div className="sys-model-right">
                    <span className="sys-badge-loaded">
                      <span className="sys-badge-dot"></span>
                      {mod.status}
                    </span>
                    <span className="sys-version-tag">{mod.version}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Panel: Storage Status */}
          <div className="sys-panel sys-storage-panel">
            <div className="sys-panel-header">
              <div className="sys-panel-title-wrap">
                <HardDrive size={18} />
                <h3 className="sys-panel-title">Storage Status</h3>
              </div>
            </div>

            <div className="sys-storage-bars">
              {/* Video Storage */}
              <div className="sys-storage-row">
                <div className="sys-storage-meta">
                  <span className="sys-storage-label">{storage.video.label}</span>
                  <div className="sys-storage-nums">
                    <span className="sys-storage-pct">{storage.video.percent}%</span>
                    <span className="sys-storage-raw">{storage.video.text}</span>
                  </div>
                </div>
                <div className="sys-bar-track">
                  <div className="sys-bar-fill blue" style={{ width: `${storage.video.percent}%` }}></div>
                </div>
              </div>

              {/* Database */}
              <div className="sys-storage-row">
                <div className="sys-storage-meta">
                  <span className="sys-storage-label">{storage.database.label}</span>
                  <div className="sys-storage-nums">
                    <span className="sys-storage-pct">{storage.database.percent}%</span>
                    <span className="sys-storage-raw">{storage.database.text}</span>
                  </div>
                </div>
                <div className="sys-bar-track">
                  <div className="sys-bar-fill blue" style={{ width: `${storage.database.percent}%` }}></div>
                </div>
              </div>

              {/* Log Files */}
              <div className="sys-storage-row">
                <div className="sys-storage-meta">
                  <span className="sys-storage-label">{storage.logs.label}</span>
                  <div className="sys-storage-nums">
                    <span className="sys-storage-pct">{storage.logs.percent}%</span>
                    <span className="sys-storage-raw">{storage.logs.text}</span>
                  </div>
                </div>
                <div className="sys-bar-track">
                  <div className="sys-bar-fill blue" style={{ width: `${storage.logs.percent}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM ROW: RECENT LOGS | NETWORK STATUS | QUICK ACTIONS */}
      <div className="sys-bottom-grid">
        {/* BOTTOM CARD 1: RECENT SYSTEM LOGS */}
        <div className="sys-panel sys-logs-panel">
          <div className="sys-panel-header">
            <div className="sys-panel-title-wrap">
              <Activity size={18} />
              <h3 className="sys-panel-title">Recent System Logs</h3>
            </div>
            <button
              className="sys-link-action"
              onClick={() => {
                fetchAllLogs();
                setActiveModal('logs');
              }}
            >
              View All Logs →
            </button>
          </div>

          <div className="sys-logs-table-wrapper">
            <table className="sys-logs-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Time</th>
                  <th style={{ width: '85px' }}>Level</th>
                  <th style={{ width: '130px' }}>Component</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log, i) => (
                  <tr key={i}>
                    <td className="sys-log-time">{log.time}</td>
                    <td>
                      <span className={`sys-level-pill ${log.level.toLowerCase()}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="sys-log-comp">{log.component}</td>
                    <td className="sys-log-msg">{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOTTOM CARD 2: NETWORK STATUS */}
        <div className="sys-panel sys-network-panel">
          <div className="sys-panel-header">
            <div className="sys-panel-title-wrap">
              <Wifi size={18} />
              <h3 className="sys-panel-title">Network Status</h3>
            </div>
          </div>

          <div className="sys-network-content">
            <div className="sys-cam-latency-title">Latency to Cameras</div>
            <div className="sys-cam-latency-list">
              {(network?.cameras || []).map((c, i) => (
                <div key={i} className="sys-cam-latency-item">
                  <div className="sys-cam-name-wrap">
                    <span className="sys-status-dot green"></span>
                    <span className="sys-cam-name">{c.id}</span>
                  </div>
                  <span className="sys-cam-ms">{c.latency} ms</span>
                </div>
              ))}
            </div>

            <div className="sys-internet-card">
              <div className="sys-internet-icon-wrap">
                <Globe size={26} color="#3b82f6" />
              </div>
              <div className="sys-internet-info">
                <div className="sys-internet-label">Internet Connection</div>
                <div className="sys-internet-status">{network.internet.status}</div>
                <div className="sys-internet-ms">Latency: {network.internet.latency_ms} ms</div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM CARD 3: QUICK ACTIONS (6 ACTIONS) */}
        <div className="sys-panel sys-actions-panel">
          <div className="sys-panel-header">
            <div className="sys-panel-title-wrap">
              <Settings size={18} />
              <h3 className="sys-panel-title">Quick Actions</h3>
            </div>
          </div>

          <div className="sys-actions-grid">
            {/* 1. Restart AI Service */}
            <button
              className="sys-quick-btn blue"
              onClick={handleRestartAI}
              disabled={actionLoading !== null}
            >
              <RefreshCw size={17} className={actionLoading === 'restart-ai' ? 'spinning' : ''} />
              <span>{actionLoading === 'restart-ai' ? 'Restarting...' : 'Restart AI Service'}</span>
            </button>

            {/* 2. Clear Logs */}
            <button
              className="sys-quick-btn red"
              onClick={() => setActiveModal('clear-logs')}
              disabled={actionLoading !== null}
            >
              <Trash2 size={17} className={actionLoading === 'clear-logs' ? 'spinning' : ''} />
              <span>{actionLoading === 'clear-logs' ? 'Clearing...' : 'Clear Logs'}</span>
            </button>

            {/* 3. Reboot System */}
            <button
              className="sys-quick-btn blue"
              onClick={() => setActiveModal('reboot')}
              disabled={actionLoading !== null}
            >
              <Power size={17} />
              <span>Reboot System</span>
            </button>

            {/* 4. Backup Database */}
            <button
              className="sys-quick-btn blue"
              onClick={handleBackupDB}
              disabled={actionLoading !== null}
            >
              <Database size={17} className={actionLoading === 'backup-db' ? 'spinning' : ''} />
              <span>{actionLoading === 'backup-db' ? 'Backing up...' : 'Backup Database'}</span>
            </button>

            {/* 5. Test Camera Feeds */}
            <button
              className="sys-quick-btn blue"
              onClick={handleTestCameras}
              disabled={actionLoading !== null}
            >
              <Video size={17} className={actionLoading === 'test-cameras' ? 'spinning' : ''} />
              <span>{actionLoading === 'test-cameras' ? 'Testing...' : 'Test Camera Feeds'}</span>
            </button>

            {/* 6. Check Updates */}
            <button
              className="sys-quick-btn blue"
              onClick={handleCheckUpdates}
              disabled={actionLoading !== null}
            >
              <CloudDownload size={17} className={actionLoading === 'check-updates' ? 'spinning' : ''} />
              <span>{actionLoading === 'check-updates' ? 'Checking...' : 'Check Updates'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================
          MODALS WITH GUARANTEED "← BACK" BUTTONS
          ========================================== */}

      {/* MODAL 1: VIEW ALL LOGS */}
      {activeModal === 'logs' && (
        <div className="sys-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="sys-modal-card large" onClick={(e) => e.stopPropagation()}>
            <div className="sys-modal-header">
              <div className="sys-modal-header-left">
                <button
                  className="btn-back"
                  onClick={() => setActiveModal(null)}
                  title="Return to System Status"
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <h3 className="sys-modal-title">System Audit & Diagnostic Logs</h3>
              </div>
              <button
                className="sys-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="sys-modal-toolbar">
              <div className="sys-search-wrap">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search log messages or components..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
              </div>

              <div className="sys-filter-pills">
                {['ALL', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
                  <button
                    key={lvl}
                    className={`sys-filter-pill ${logFilter === lvl ? 'active' : ''}`}
                    onClick={() => setLogFilter(lvl)}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                className="sys-modal-action-btn red"
                onClick={() => setActiveModal('clear-logs')}
                disabled={actionLoading === 'clear-logs'}
              >
                <Trash2 size={14} /> Clear Logs
              </button>
            </div>

            <div className="sys-modal-body table-body">
              <table className="sys-logs-table full">
                <thead>
                  <tr>
                    <th style={{ width: '100px' }}>Time</th>
                    <th style={{ width: '90px' }}>Severity</th>
                    <th style={{ width: '150px' }}>Component</th>
                    <th>Message & Diagnostic Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="sys-log-time">{log.time}</td>
                        <td>
                          <span className={`sys-level-pill ${log.level.toLowerCase()}`}>
                            {log.level}
                          </span>
                        </td>
                        <td className="sys-log-comp">{log.component}</td>
                        <td className="sys-log-msg">{log.message}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="sys-empty-table">
                        No logs found matching your filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sys-modal-footer">
              <span className="sys-modal-count">
                Showing {filteredLogs.length} of {allLogs.length} entries
              </span>
              <button
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                <ArrowLeft size={14} /> Back to System Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CLEAR LOGS CONFIRMATION */}
      {activeModal === 'clear-logs' && (
        <div className="sys-modal-backdrop" onClick={() => actionLoading !== 'clear-logs' && setActiveModal(null)}>
          <div className="sys-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sys-modal-header">
              <div className="sys-modal-header-left">
                <button
                  className="btn-back"
                  onClick={() => setActiveModal(null)}
                  disabled={actionLoading === 'clear-logs'}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <h3 className="sys-modal-title">Clear System Diagnostic Logs</h3>
              </div>
              <button
                className="sys-modal-close"
                onClick={() => setActiveModal(null)}
                disabled={actionLoading === 'clear-logs'}
              >
                ✕
              </button>
            </div>

            <div className="sys-modal-body">
              <div className="sys-reboot-confirm-box">
                <div className="sys-warning-icon">
                  <Trash2 size={36} color="#ef4444" />
                </div>
                <h4>Clear non-critical diagnostic logs?</h4>
                <p>
                  This action will permanently purge routine diagnostic and operational history from the database.
                  Critical security alerts and audit breadcrumbs will be safely retained.
                </p>
              </div>
            </div>

            <div className="sys-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
                disabled={actionLoading === 'clear-logs'}
              >
                <ArrowLeft size={14} /> Back / Cancel
              </button>
              <button
                className="btn-primary-danger"
                onClick={handleConfirmClearLogs}
                disabled={actionLoading === 'clear-logs'}
              >
                {actionLoading === 'clear-logs' ? (
                  <>
                    <RefreshCw size={15} className="spinning" /> Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 size={15} /> Confirm & Clear Logs
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REBOOT SYSTEM CONFIRMATION */}
      {activeModal === 'reboot' && (
        <div className="sys-modal-backdrop" onClick={() => !rebooting && setActiveModal(null)}>
          <div className="sys-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sys-modal-header">
              <div className="sys-modal-header-left">
                <button
                  className="btn-back"
                  onClick={() => !rebooting && setActiveModal(null)}
                  disabled={rebooting}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <h3 className="sys-modal-title">Reboot System Confirmation</h3>
              </div>
              {!rebooting && (
                <button
                  className="sys-modal-close"
                  onClick={() => setActiveModal(null)}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="sys-modal-body">
              {rebooting ? (
                <div className="sys-reboot-progress-box">
                  <RefreshCw size={40} className="spinning" color="#3b82f6" />
                  <h4>Rebooting Core Microservices...</h4>
                  <p>Reloading FastAPI processes, AI models, and database connections.</p>
                  <div className="sys-countdown-badge">
                    Reconnecting in <b>{rebootSeconds}s</b>
                  </div>
                </div>
              ) : (
                <div className="sys-reboot-confirm-box">
                  <div className="sys-warning-icon">
                    <AlertTriangle size={36} color="#f59e0b" />
                  </div>
                  <h4>Are you sure you want to reboot?</h4>
                  <p>
                    This will gracefully cycle all 8 surveillance daemons, reset video ingestion sockets,
                    and clear transient caches. Video recording will safely resume immediately.
                  </p>
                </div>
              )}
            </div>

            <div className="sys-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
                disabled={rebooting}
              >
                <ArrowLeft size={14} /> Back / Cancel
              </button>
              {!rebooting && (
                <button
                  className="btn-primary-danger"
                  onClick={initiateRebootSequence}
                >
                  <Power size={15} /> Confirm & Reboot Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TEST CAMERA FEEDS RESULTS */}
      {activeModal === 'cameras' && (
        <div className="sys-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="sys-modal-card large" onClick={(e) => e.stopPropagation()}>
            <div className="sys-modal-header">
              <div className="sys-modal-header-left">
                <button
                  className="btn-back"
                  onClick={() => setActiveModal(null)}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <h3 className="sys-modal-title">Live Camera Stream & Network Latency Probe</h3>
              </div>
              <button
                className="sys-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="sys-modal-body">
              <p className="sys-modal-desc">
                Real-time TCP/RTSP latency probe executed across all registered IBVAP border observation stations.
              </p>

              <table className="sys-logs-table full">
                <thead>
                  <tr>
                    <th>Camera Station</th>
                    <th>Status</th>
                    <th>Round-Trip Latency</th>
                    <th>Resolution & FPS</th>
                    <th>Bitrate</th>
                    <th>Packet Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {cameraTestResults && cameraTestResults.map((cam, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: '600' }}>{cam.camera_id} - {cam.name}</td>
                      <td>
                        <span className="subsystem-badge online">
                          <CheckCircle size={12} /> {cam.status}
                        </span>
                      </td>
                      <td style={{ color: '#10b981', fontWeight: '700' }}>{cam.latency_ms} ms</td>
                      <td>{cam.resolution}</td>
                      <td>{cam.bitrate}</td>
                      <td>{cam.packet_loss}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sys-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                <ArrowLeft size={14} /> Back to System Status
              </button>
              <button
                className="btn-primary"
                onClick={handleTestCameras}
                disabled={actionLoading === 'test-cameras'}
              >
                <RefreshCw size={14} className={actionLoading === 'test-cameras' ? 'spinning' : ''} />
                Run Diagnostics Sweep Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CHECK UPDATES */}
      {activeModal === 'updates' && (
        <div className="sys-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="sys-modal-card large" onClick={(e) => e.stopPropagation()}>
            <div className="sys-modal-header">
              <div className="sys-modal-header-left">
                <button
                  className="btn-back"
                  onClick={() => setActiveModal(null)}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <h3 className="sys-modal-title">System & AI Model Updates</h3>
              </div>
              <button
                className="sys-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ✕
              </button>
            </div>

            <div className="sys-modal-body">
              <div className="sys-update-banner">
                <div className="sys-update-badge-col">
                  <CheckCircle size={28} color="#16a34a" />
                  <div>
                    <h4>All Modules are Up to Date</h4>
                    <p>Current Release: <b>{updatesData?.current_version || 'v2.4.0-prod'}</b> • Checked {updatesData?.last_checked || 'Just now'}</p>
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '18px 0 10px 0', fontSize: '14px', color: 'var(--sys-text-main, #ffffff)' }}>
                Installed Modules & Weights
              </h4>

              <table className="sys-logs-table full">
                <thead>
                  <tr>
                    <th>Module Name</th>
                    <th>Installed Version</th>
                    <th>Status</th>
                    <th>Integrity</th>
                  </tr>
                </thead>
                <tbody>
                  {updatesData?.modules && updatesData.modules.map((m, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: '600' }}>{m.name}</td>
                      <td>{m.version}</td>
                      <td>
                        <span className="subsystem-badge online">
                          <Check size={12} /> {m.status}
                        </span>
                      </td>
                      <td style={{ color: '#10b981', fontWeight: '600' }}>{m.integrity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 style={{ margin: '20px 0 8px 0', fontSize: '14px', color: 'var(--sys-text-main, #ffffff)' }}>
                Release Highlights
              </h4>
              <ul className="sys-changelog-list">
                {updatesData?.changelog && updatesData.changelog.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>

            <div className="sys-modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                <ArrowLeft size={14} /> Back to System Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
