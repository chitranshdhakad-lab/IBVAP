import React, { useState, useEffect, useRef } from 'react';
import {
  Bell, Search, Calendar, AlertTriangle, ShieldAlert,
  CheckCircle2, AlertCircle, Eye, User, Car, PawPrint,
  Footprints, Users, Plane, Shield, MapPin, Play, Pause,
  Maximize2, ExternalLink, Check, ArrowRight, ArrowLeft,
  ChevronLeft, ChevronRight, Filter, RefreshCw, Camera
} from 'lucide-react';
import { useTranslation } from '../../services/i18n.js';
import { resolveMediaUrl } from '../../services/apiConfig.js';

const EMPTY_DASHBOARD_DATA = {
  kpis: {
    total_alerts: { value: 0, trend: '0% vs. baseline', color: '#ef4444' },
    high_severity: { value: 0, trend: '0% vs. baseline', color: '#ef4444' },
    medium_severity: { value: 0, trend: '0% vs. baseline', color: '#f59e0b' },
    low_severity: { value: 0, trend: '0% vs. baseline', color: '#10b981' },
    resolved: { value: 0, trend: '0% vs. baseline', color: '#10b981' }
  },
  trend: [],
  alert_types: [],
  alerts_by_sector: [],
  events: [],
  selected_event: null,
  pagination: {
    current_page: 1,
    page_size: 10,
    total_events: 0,
    total_pages: 1
  }
};

export default function EventsAlertsPage({
  cameras = [],
  onExportReport,
  onNavigateToTab
}) {
  const { t } = useTranslation();

  // Dashboard Data State initialized from API
  const [dashboardData, setDashboardData] = useState(EMPTY_DASHBOARD_DATA);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('7d');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [eventTypeFilter, setEventTypeFilter] = useState('All');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Selected event for the Event Details preview
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Action status loading & toast
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch complete events dashboard
  const fetchEventsDashboard = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('time_range', timeRange);
      params.append('page', currentPage.toString());
      params.append('page_size', '10');
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (severityFilter !== 'All' && severityFilter !== 'All Severity') params.append('severity', severityFilter);
      if (eventTypeFilter !== 'All' && eventTypeFilter !== 'All Event Types') params.append('event_type', eventTypeFilter);
      if (sectorFilter !== 'All' && sectorFilter !== 'All Sectors') params.append('sector', sectorFilter);
      if (selectedEvent?.id) params.append('selected_id', selectedEvent.id.toString());

      const res = await fetch(`/api/events/dashboard?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
        if (data.selected_event && (!selectedEvent || !isSilent)) {
          setSelectedEvent(data.selected_event);
        }
      }
    } catch (err) {
      console.error('Failed to load events dashboard:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  // Initial & Filter dependency fetch
  useEffect(() => {
    fetchEventsDashboard();
  }, [timeRange, severityFilter, eventTypeFilter, sectorFilter, currentPage, searchQuery]);

  // Real-time polling (every 6 seconds if enabled)
  useEffect(() => {
    if (!realtimeEnabled) return;
    const interval = setInterval(() => {
      fetchEventsDashboard(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [realtimeEnabled, timeRange, severityFilter, eventTypeFilter, sectorFilter, currentPage, searchQuery]);

  // ==========================================
  // ACTION HANDLERS
  // ==========================================

  const handleAcknowledge = async (eventId) => {
    const id = eventId || selectedEvent?.id;
    if (!id) return;
    setActionLoading('acknowledge');
    try {
      const res = await fetch(`/api/events/${id}/acknowledge`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Event #${id} acknowledged.`, 'success');
        fetchEventsDashboard(true);
        if (selectedEvent?.id === id) {
          setSelectedEvent(prev => prev ? { ...prev, status: 'Active' } : prev);
        }
      } else {
        showToast(data.detail || 'Failed to acknowledge event', 'error');
      }
    } catch (err) {
      showToast('Error acknowledging event', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEscalate = async (eventId) => {
    const id = eventId || selectedEvent?.id;
    if (!id) return;
    setActionLoading('escalate');
    try {
      const res = await fetch(`/api/events/${id}/escalate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Event #${id} escalated to High Severity.`, 'error');
        fetchEventsDashboard(true);
        if (selectedEvent?.id === id) {
          setSelectedEvent(prev => prev ? { ...prev, status: 'Escalated', severity: 'High' } : prev);
        }
      } else {
        showToast(data.detail || 'Failed to escalate event', 'error');
      }
    } catch (err) {
      showToast('Error escalating event', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (eventId) => {
    const id = eventId || selectedEvent?.id;
    if (!id) return;
    setActionLoading('resolve');
    try {
      const res = await fetch(`/api/events/${id}/resolve`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Event #${id} marked as Resolved.`, 'success');
        fetchEventsDashboard(true);
        if (selectedEvent?.id === id) {
          setSelectedEvent(prev => prev ? { ...prev, status: 'Resolved' } : prev);
        }
      } else {
        showToast(data.detail || 'Failed to resolve event', 'error');
      }
    } catch (err) {
      showToast('Error resolving event', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // Extract metrics or fallbacks matching mockup
  const kpis = dashboardData?.kpis || {
    total_alerts: { value: 142, trend: '↑ 20% vs. previous week', color: '#ef4444' },
    high_severity: { value: 21, trend: '↑ 40% vs. previous week', color: '#ef4444' },
    medium_severity: { value: 67, trend: '↑ 12% vs. previous week', color: '#f59e0b' },
    low_severity: { value: 54, trend: '↓ 18% vs. previous week', color: '#10b981' },
    resolved: { value: 119, trend: '↑ 35% vs. previous week', color: '#10b981' }
  };

  const trendPoints = (dashboardData?.trend && dashboardData.trend.length > 0)
    ? dashboardData.trend
    : [
        { date: '14 Sep', high: 15, medium: 8, low: 2 },
        { date: '15 Sep', high: 23, medium: 10, low: 2 },
        { date: '16 Sep', high: 19, medium: 12, low: 3 },
        { date: '17 Sep', high: 25, medium: 16, low: 4 },
        { date: '18 Sep', high: 24, medium: 16, low: 3 },
        { date: '19 Sep', high: 20, medium: 13, low: 3 },
        { date: '20 Sep', high: 31, medium: 16, low: 4 }
      ];

  const alertTypes = (dashboardData?.alert_types && dashboardData.alert_types.length > 0)
    ? dashboardData.alert_types
    : [
        { name: 'Unauthorized Person', percentage: 38, color: '#2563eb' },
        { name: 'Vehicle Movement', percentage: 22, color: '#10b981' },
        { name: 'Animal Movement', percentage: 18, color: '#f59e0b' },
        { name: 'Border Breach', percentage: 10, color: '#ea580c' },
        { name: 'Loitering', percentage: 7, color: '#ef4444' },
        { name: 'Others', percentage: 5, color: '#64748b' }
      ];

  const sectorBars = (dashboardData?.alerts_by_sector && dashboardData.alerts_by_sector.length > 0)
    ? dashboardData.alerts_by_sector
    : [
        { sector: 'Sector A', count: 36, color: '#3b82f6' },
        { sector: 'Sector B', count: 28, color: '#f59e0b' },
        { sector: 'Sector C', count: 24, color: '#10b981' },
        { sector: 'Sector D', count: 18, color: '#06b6d4' },
        { sector: 'Sector E', count: 12, color: '#f97316' }
      ];

  const eventsList = dashboardData?.events || [];
  const pagination = dashboardData?.pagination || {
    current_page: 1,
    page_size: 10,
    total_events: 142,
    total_pages: 14
  };

  // Helper for Contextual Event Type Icon
  const getEventIcon = (eventType) => {
    const t = (eventType || '').toLowerCase();
    if (t.includes('person') && !t.includes('multiple')) {
      return <User size={15} color="#ef4444" />;
    } else if (t.includes('multiple')) {
      return <Users size={15} color="#ef4444" />;
    } else if (t.includes('vehicle') || t.includes('car') || t.includes('truck')) {
      return <Car size={15} color="#3b82f6" />;
    } else if (t.includes('animal') || t.includes('herd')) {
      return <PawPrint size={15} color="#10b981" />;
    } else if (t.includes('breach') || t.includes('fence')) {
      return <ShieldAlert size={15} color="#ef4444" />;
    } else if (t.includes('loitering')) {
      return <Footprints size={15} color="#f59e0b" />;
    } else if (t.includes('drone') || t.includes('air')) {
      return <Plane size={15} color="#8b5cf6" />;
    }
    return <AlertTriangle size={15} color="#f59e0b" />;
  };

  // Helper for SVG Multi-Series Trend Chart
  const renderTrendChart = () => {
    const width = 360;
    const height = 140;
    const padLeft = 28;
    const padRight = 10;
    const padTop = 15;
    const padBottom = 24;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const maxVal = 40;

    if (!trendPoints || trendPoints.length === 0) {
      return (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text-muted, #94a3b8)', fontSize: '13px' }}>
          No trend activity recorded
        </div>
      );
    }

    const stepX = chartW / (trendPoints.length - 1 || 1);

    const getCoords = (key) => {
      return trendPoints.map((p, i) => ({
        x: padLeft + i * stepX,
        y: padTop + chartH - (p[key] / maxVal) * chartH,
        val: p[key]
      }));
    };

    const highCoords = getCoords('high');
    const medCoords = getCoords('medium');
    const lowCoords = getCoords('low');

    const makePath = (coords) => {
      if (!coords || coords.length === 0) return '';
      let d = `M ${coords[0].x} ${coords[0].y}`;
      for (let i = 1; i < coords.length; i++) {
        const prev = coords[i - 1];
        const cur = coords[i];
        const mx = (prev.x + cur.x) / 2;
        d += ` C ${mx} ${prev.y}, ${mx} ${cur.y}, ${cur.x} ${cur.y}`;
      }
      return d;
    };

    const makeArea = (pathD, coords) => {
      if (!coords || coords.length === 0 || !pathD) return '';
      return `${pathD} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`;
    };

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gradMed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="gradLow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 10, 20, 30, 40].map((v) => {
          const y = padTop + chartH - (v / maxVal) * chartH;
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="var(--sys-grid-line, rgba(255,255,255,0.06))" strokeDasharray={v === 0 ? 'none' : '3 3'} />
              <text x={padLeft - 5} y={y + 3} textAnchor="end" fill="var(--sys-text-muted, #94a3b8)" fontSize="9">{v}</text>
            </g>
          );
        })}

        {/* Areas */}
        <path d={makeArea(makePath(highCoords), highCoords)} fill="url(#gradHigh)" />
        <path d={makeArea(makePath(medCoords), medCoords)} fill="url(#gradMed)" />
        <path d={makeArea(makePath(lowCoords), lowCoords)} fill="url(#gradLow)" />

        {/* Lines */}
        <path d={makePath(highCoords)} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <path d={makePath(medCoords)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
        <path d={makePath(lowCoords)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />

        {/* Dots */}
        {highCoords.map((c, i) => (
          <circle key={`h-${i}`} cx={c.x} cy={c.y} r="2.5" fill="#ef4444" />
        ))}
        {medCoords.map((c, i) => (
          <circle key={`m-${i}`} cx={c.x} cy={c.y} r="2.5" fill="#f59e0b" />
        ))}
        {lowCoords.map((c, i) => (
          <circle key={`l-${i}`} cx={c.x} cy={c.y} r="2.5" fill="#10b981" />
        ))}

        {/* X Dates */}
        {trendPoints.map((p, i) => (
          <text key={i} x={padLeft + i * stepX} y={height - 5} textAnchor="middle" fill="var(--sys-text-muted, #94a3b8)" fontSize="9">
            {p.date}
          </text>
        ))}
      </svg>
    );
  };

  // Helper for SVG Donut Chart
  const renderDonutChart = () => {
    if (!alertTypes || alertTypes.length === 0) {
      return (
        <div style={{ width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text-muted, #94a3b8)', fontSize: '11px', textAlign: 'center' }}>
          No alerts
        </div>
      );
    }
    let cumulative = 0;
    const radius = 38;
    const circ = 2 * Math.PI * radius;

    return (
      <svg width="120" height="120" viewBox="0 0 100 100" className="events-donut-svg">
        {alertTypes.map((slice, i) => {
          const dash = (slice.percentage / 100) * circ;
          const offset = circ - (cumulative / 100) * circ;
          cumulative += slice.percentage;

          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth="12"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
            />
          );
        })}
        <text x="50" y="48" textAnchor="middle" fill="var(--sys-text-main, #ffffff)" fontSize="15" fontWeight="700">
          {kpis.total_alerts.value}
        </text>
        <text x="50" y="60" textAnchor="middle" fill="var(--sys-text-muted, #94a3b8)" fontSize="7" fontWeight="600">
          Total Alerts
        </text>
      </svg>
    );
  };

  // Helper for Vertical Bar Chart (Alerts by Sector)
  const renderSectorBarChart = () => {
    if (!sectorBars || sectorBars.length === 0) {
      return (
        <div style={{ height: 135, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text-muted, #94a3b8)', fontSize: '13px' }}>
          No sector data
        </div>
      );
    }
    const width = 280;
    const height = 135;
    const padLeft = 24;
    const padRight = 10;
    const padTop = 18;
    const padBottom = 22;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const maxVal = 40;

    const barWidth = 24;
    const gap = (chartW - barWidth * sectorBars.length) / (sectorBars.length + 1);

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Y Axis lines */}
        {[0, 10, 20, 30, 40].map((v) => {
          const y = padTop + chartH - (v / maxVal) * chartH;
          return (
            <g key={v}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="var(--sys-grid-line, rgba(255,255,255,0.06))" strokeDasharray={v === 0 ? 'none' : '3 3'} />
              <text x={padLeft - 5} y={y + 3} textAnchor="end" fill="var(--sys-text-muted, #94a3b8)" fontSize="8.5">{v}</text>
            </g>
          );
        })}

        {/* Bars */}
        {sectorBars.map((b, i) => {
          const bH = (b.count / maxVal) * chartH;
          const x = padLeft + gap + i * (barWidth + gap);
          const y = padTop + chartH - bH;

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={bH}
                fill={b.color}
                rx="3"
                ry="3"
              />
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fill="var(--sys-text-main, #ffffff)" fontSize="9.5" fontWeight="700">
                {b.count}
              </text>
              <text x={x + barWidth / 2} y={height - 5} textAnchor="middle" fill="var(--sys-text-muted, #94a3b8)" fontSize="8.5">
                {b.sector}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="events-alerts-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`sys-toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. TOP HEADER SECTION */}
      <div className="events-page-header">
        <div className="events-header-left">
          <div className="events-header-icon-box">
            <Bell size={22} />
          </div>
          <div>
            <h1 className="events-title">Events & Alerts</h1>
            <p className="events-subtitle">Real-time and historical security events detected across all border locations</p>
          </div>
        </div>

        <div className="events-header-right">
          {/* Global Search */}
          <div className="events-search-bar">
            <Search size={15} color="var(--sys-text-muted)" />
            <input
              type="text"
              placeholder="Search by event, location, camera ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Date Range Dropdown */}
          <div className="events-time-select-wrap">
            <Calendar size={14} color="var(--sys-text-muted)" />
            <select
              value={timeRange}
              onChange={(e) => {
                setTimeRange(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. TOP ROW (5 KPI SUMMARY CARDS) */}
      <div className="events-kpi-grid">
        {/* KPI 1: Total Alerts */}
        <div className="events-kpi-card">
          <div className="events-kpi-icon-wrap red-light">
            <AlertTriangle size={22} color="#ef4444" />
          </div>
          <div className="events-kpi-info">
            <span className="events-kpi-label">Total Alerts</span>
            <span className="events-kpi-val">{kpis.total_alerts.value}</span>
            <span className="events-kpi-trend red">{kpis.total_alerts.trend}</span>
          </div>
        </div>

        {/* KPI 2: High Severity */}
        <div className="events-kpi-card">
          <div className="events-kpi-icon-wrap red-light">
            <ShieldAlert size={22} color="#ef4444" />
          </div>
          <div className="events-kpi-info">
            <span className="events-kpi-label">High Severity</span>
            <span className="events-kpi-val">{kpis.high_severity.value}</span>
            <span className="events-kpi-trend red">{kpis.high_severity.trend}</span>
          </div>
        </div>

        {/* KPI 3: Medium Severity */}
        <div className="events-kpi-card">
          <div className="events-kpi-icon-wrap amber-light">
            <AlertTriangle size={22} color="#f59e0b" />
          </div>
          <div className="events-kpi-info">
            <span className="events-kpi-label">Medium Severity</span>
            <span className="events-kpi-val">{kpis.medium_severity.value}</span>
            <span className="events-kpi-trend amber">{kpis.medium_severity.trend}</span>
          </div>
        </div>

        {/* KPI 4: Low Severity */}
        <div className="events-kpi-card">
          <div className="events-kpi-icon-wrap green-light">
            <AlertCircle size={22} color="#10b981" />
          </div>
          <div className="events-kpi-info">
            <span className="events-kpi-label">Low Severity</span>
            <span className="events-kpi-val">{kpis.low_severity.value}</span>
            <span className="events-kpi-trend green">{kpis.low_severity.trend}</span>
          </div>
        </div>

        {/* KPI 5: Resolved */}
        <div className="events-kpi-card">
          <div className="events-kpi-icon-wrap blue-light">
            <CheckCircle2 size={22} color="#2563eb" />
          </div>
          <div className="events-kpi-info">
            <span className="events-kpi-label">Resolved</span>
            <span className="events-kpi-val">{kpis.resolved.value}</span>
            <span className="events-kpi-trend green">{kpis.resolved.trend}</span>
          </div>
        </div>
      </div>

      {/* 3. MIDDLE ROW (3 ANALYTICS WIDGETS) */}
      <div className="events-analytics-row">
        {/* Widget 1: Alert Trend */}
        <div className="events-panel events-trend-panel">
          <div className="events-panel-header">
            <div className="events-panel-title-wrap">
              <AlertTriangle size={16} />
              <h3 className="events-panel-title">Alert Trend</h3>
            </div>
            <div className="events-trend-header-right">
              <div className="events-legend">
                <span className="legend-item"><span className="legend-dot red"></span> High</span>
                <span className="legend-item"><span className="legend-dot amber"></span> Medium</span>
                <span className="legend-item"><span className="legend-dot green"></span> Low</span>
              </div>
              <div className="events-mini-select">Last 7 Days ▾</div>
            </div>
          </div>
          <div className="events-chart-body">
            {renderTrendChart()}
          </div>
        </div>

        {/* Widget 2: Alert Types Donut */}
        <div className="events-panel events-donut-panel">
          <div className="events-panel-header">
            <h3 className="events-panel-title">Alert Types</h3>
          </div>
          <div className="events-donut-layout">
            <div className="events-donut-chart-wrap">
              {renderDonutChart()}
            </div>
            <div className="events-donut-legend">
              {alertTypes.map((item, idx) => (
                <div key={idx} className="events-donut-legend-item">
                  <span className="donut-color-dot" style={{ backgroundColor: item.color }}></span>
                  <span className="donut-label">{item.name}</span>
                  <span className="donut-percent">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Widget 3: Alerts by Sector */}
        <div className="events-panel events-sector-panel">
          <div className="events-panel-header">
            <div className="events-panel-title-wrap">
              <Users size={16} />
              <h3 className="events-panel-title">Alerts by Sector</h3>
            </div>
          </div>
          <div className="events-chart-body">
            {renderSectorBarChart()}
          </div>
        </div>
      </div>

      {/* 4. BOTTOM ROW: RECENT EVENTS & ALERTS TABLE + EVENT DETAILS PANEL */}
      <div className="events-main-grid">
        {/* LEFT COLUMN: RECENT EVENTS TABLE */}
        <div className="events-panel events-table-panel">
          <div className="events-table-header">
            <div className="events-table-title-wrap">
              <Shield size={16} />
              <h3 className="events-panel-title">Recent Events & Alerts</h3>
            </div>

            {/* Filter Dropdowns in Table Header */}
            <div className="events-filters-toolbar">
              <select
                value={severityFilter}
                onChange={(e) => {
                  setSeverityFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">All Severity</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <select
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">All Event Types</option>
                <option value="Unauthorized Person">Unauthorized Person</option>
                <option value="Vehicle Near Border">Vehicle Near Border</option>
                <option value="Animal Movement">Animal Movement</option>
                <option value="Border Breach">Border Breach</option>
                <option value="Loitering Detected">Loitering Detected</option>
                <option value="Multiple Persons">Multiple Persons</option>
                <option value="Drone Detected">Drone Detected</option>
              </select>

              <select
                value={sectorFilter}
                onChange={(e) => {
                  setSectorFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">All Sectors</option>
                <option value="Sector A">Sector A</option>
                <option value="Sector B">Sector B</option>
                <option value="Sector C">Sector C</option>
                <option value="Sector D">Sector D</option>
                <option value="Sector E">Sector E</option>
              </select>

              {/* Real-Time Toggle */}
              <div className="events-realtime-toggle">
                <span className="events-realtime-label">Real-time</span>
                <label className="sys-switch">
                  <input
                    type="checkbox"
                    checked={realtimeEnabled}
                    onChange={(e) => setRealtimeEnabled(e.target.checked)}
                  />
                  <span className="sys-slider round"></span>
                </label>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="events-table-wrap">
            <table className="events-table">
              <thead>
                <tr>
                  <th style={{ width: '85px' }}>Time</th>
                  <th style={{ width: '180px' }}>Event Type</th>
                  <th style={{ width: '90px' }}>Camera ID</th>
                  <th style={{ width: '140px' }}>Location</th>
                  <th style={{ width: '85px' }}>Confidence</th>
                  <th style={{ width: '95px' }}>Severity</th>
                  <th style={{ width: '90px' }}>Status</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {eventsList.length > 0 ? (
                  eventsList.map((evt) => {
                    const isSelected = selectedEvent?.id === evt.id;
                    return (
                      <tr
                        key={evt.id}
                        className={`events-table-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedEvent(evt)}
                      >
                        <td className="events-col-time">{evt.time}</td>
                        <td className="events-col-type">
                          <span className="events-type-icon-box">
                            {getEventIcon(evt.event_type)}
                          </span>
                          <span className="events-type-text">{evt.event_type}</span>
                        </td>
                        <td className="events-col-cam">{evt.camera_id}</td>
                        <td className="events-col-loc">{evt.location}</td>
                        <td className="events-col-conf">{evt.confidence}%</td>
                        <td>
                          <span className={`events-severity-badge ${(evt.severity || 'Low').toLowerCase()}`}>
                            ▲ {evt.severity}
                          </span>
                        </td>
                        <td>
                          <span className={`events-status-badge ${(evt.status || 'Active').toLowerCase()}`}>
                            {evt.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="events-action-eye"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(evt);
                            }}
                            title="Inspect Event"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" className="events-empty-state">
                      No security events match the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="events-pagination-footer">
            <div className="events-pagination-controls">
              <button
                className="events-page-btn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                ‹
              </button>
              {[1, 2, 3, 4, 5].map((p) => (
                <button
                  key={p}
                  className={`events-page-btn ${currentPage === p ? 'active' : ''}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ))}
              <span className="events-page-dots">..</span>
              <button
                className={`events-page-btn ${currentPage === 14 ? 'active' : ''}`}
                onClick={() => setCurrentPage(14)}
              >
                14
              </button>
              <button
                className="events-page-btn"
                disabled={currentPage >= pagination.total_pages}
                onClick={() => setCurrentPage(prev => Math.min(pagination.total_pages, prev + 1))}
              >
                ›
              </button>
            </div>

            <span className="events-showing-text">
              Showing {(currentPage - 1) * pagination.page_size + 1}-{Math.min(currentPage * pagination.page_size, pagination.total_events)} of {pagination.total_events} events
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: EVENT DETAILS PANEL */}
        <div className="events-panel events-details-panel">
          <div className="events-panel-header">
            <div className="events-panel-title-wrap">
              <Shield size={16} />
              <h3 className="events-panel-title">Event Details</h3>
            </div>
            {selectedEvent && (
              <span className={`events-severity-badge ${(selectedEvent.severity || 'Low').toLowerCase()}`}>
                ▲ {selectedEvent.severity} Severity
              </span>
            )}
          </div>

          {selectedEvent ? (
            <div className="events-details-content">
              {/* Snapshot / Video Player */}
              <div className="events-snapshot-player">
                <div className="events-snapshot-top-overlay">
                  <span className="snapshot-cam-tag">
                    {selectedEvent.camera_id} • {selectedEvent.created_at || '20 Sep 2026 | ' + selectedEvent.time}
                  </span>
                  <button
                    className="snapshot-open-link"
                    onClick={() => {
                      if (onNavigateToTab) {
                        onNavigateToTab('live-monitor', { cameraId: selectedEvent.camera_id });
                      }
                    }}
                  >
                    Open in Video <ExternalLink size={11} />
                  </button>
                </div>

                <div className="events-snapshot-img-box">
                  {selectedEvent?.snapshot_path ? (
                    <>
                      <img
                        src={resolveMediaUrl(selectedEvent.snapshot_path)}
                        alt="Event snapshot detection"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const p = e.target.parentElement;
                          if (p) {
                            const errDiv = p.querySelector('.snapshot-err-box');
                            if (errDiv) errDiv.style.display = 'flex';
                          }
                        }}
                      />
                      <div className="snapshot-err-box" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', padding: '24px', background: 'rgba(15,23,42,0.6)' }}>
                        <Camera size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>SNAPSHOT FILE UNAVAILABLE</span>
                        <span style={{ fontSize: '10px', opacity: 0.7 }}>File not found on storage mount</span>
                      </div>
                      <div className="events-bbox-tag">
                        <span className="bbox-label">{selectedEvent.object_class || 'person'} 0.{selectedEvent.confidence}</span>
                      </div>
                    </>
                  ) : (
                    <div className="no-snapshot-placeholder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', padding: '24px', background: 'rgba(15,23,42,0.6)' }}>
                      <Camera size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>NO EVIDENCE SNAPSHOT</span>
                      <span style={{ fontSize: '10px', opacity: 0.7 }}>Awaiting optical capture verification</span>
                    </div>
                  )}
                </div>

                {/* Video Play Controls Bar */}
                <div className="events-player-controls">
                  <button
                    className="player-play-btn"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <Pause size={12} fill="#ffffff" /> : <Play size={12} fill="#ffffff" />}
                  </button>
                  <div className="player-track">
                    <div className="player-fill" style={{ width: isPlaying ? '60%' : '20%' }}></div>
                  </div>
                  <span className="player-time">00:00 / 00:12</span>
                  <button className="player-expand-btn">
                    <Maximize2 size={12} />
                  </button>
                </div>
              </div>

              {/* Metadata Fields */}
              <div className="events-meta-list">
                <div className="events-meta-row">
                  <span className="meta-label">Event Type</span>
                  <span className="meta-colon">:</span>
                  <span className="meta-value bold">{selectedEvent.event_type}</span>
                </div>
                <div className="events-meta-row">
                  <span className="meta-label">Location</span>
                  <span className="meta-colon">:</span>
                  <span className="meta-value">{selectedEvent.location} ({selectedEvent.sector})</span>
                </div>
                <div className="events-meta-row">
                  <span className="meta-label">Camera ID</span>
                  <span className="meta-colon">:</span>
                  <span className="meta-value font-mono">{selectedEvent.camera_id}</span>
                </div>
                <div className="events-meta-row">
                  <span className="meta-label">Time</span>
                  <span className="meta-colon">:</span>
                  <span className="meta-value">{selectedEvent.created_at || '20 Sep 2026 | ' + selectedEvent.time}</span>
                </div>
                <div className="events-meta-row">
                  <span className="meta-label">Confidence</span>
                  <span className="meta-colon">:</span>
                  <span className="meta-value">{selectedEvent.confidence}%</span>
                </div>
                <div className="events-meta-row">
                  <span className="meta-label">Status</span>
                  <span className="meta-colon">:</span>
                  <span className={`events-status-tag ${(selectedEvent.status || 'Active').toLowerCase()}`}>
                    {selectedEvent.status}
                  </span>
                </div>
              </div>

              {/* Mini-Map Thumbnail */}
              <div className="events-minimap-card">
                <div className="minimap-bg">
                  <div className="minimap-pin">
                    <MapPin size={16} color="#ef4444" fill="#ef4444" />
                    <span className="minimap-pin-label">{selectedEvent.sector || 'Sector A3'}</span>
                  </div>
                </div>
                <button
                  className="btn-minimap-link"
                  onClick={() => {
                    if (onNavigateToTab) {
                      onNavigateToTab('border-map', { cameraId: selectedEvent.camera_id });
                    }
                  }}
                >
                  <MapPin size={12} /> View on Map <ExternalLink size={10} />
                </button>
              </div>

              {/* Action Buttons Bar */}
              <div className="events-actions-row">
                <button
                  className="btn-event-action blue"
                  onClick={() => handleAcknowledge(selectedEvent.id)}
                  disabled={actionLoading !== null}
                >
                  <Check size={14} /> Acknowledge
                </button>
                <button
                  className="btn-event-action red"
                  onClick={() => handleEscalate(selectedEvent.id)}
                  disabled={actionLoading !== null}
                >
                  <ShieldAlert size={14} /> Escalate
                </button>
                <button
                  className="btn-event-action outline"
                  onClick={() => handleResolve(selectedEvent.id)}
                  disabled={actionLoading !== null}
                >
                  <CheckCircle2 size={14} /> Mark as Resolved
                </button>
              </div>
            </div>
          ) : (
            <div className="events-empty-details">
              Select an event from the table to view its video recording, metadata, and tactical actions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
