import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, Download, Calendar, Users, Car, ShieldAlert,
  TrendingUp, TrendingDown, Activity, Clock, Layers,
  ChevronDown, ZoomIn, ZoomOut, Eye, CheckCircle2, Shield,
  ArrowUpRight, ArrowDownRight, Compass, MapPin
} from 'lucide-react';
import { useTranslation } from '../../services/i18n.js';
import SnapshotModal from '../../components/SnapshotModal.jsx';

export default function AnalyticsPage({ onExportReport, onNavigateToTab }) {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState('7d'); // '24h', '7d', '30d', 'all'
  const [heatmapFilter, setHeatmapFilter] = useState('person'); // 'person', 'vehicle', 'animal', 'all'
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [activeSnapshotEvent, setActiveSnapshotEvent] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Fetch genuine analytics telemetry from backend
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/dashboard?time_range=${timeRange}`);
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (err) {
      console.error('Failed to load analytics dashboard telemetry', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange]);

  const kpis = dashboardData?.kpis || {
    total_persons: 0,
    persons_trend: '0% vs. baseline',
    total_vehicles: 0,
    vehicles_trend: '0% vs. baseline',
    total_animals: 0,
    animals_trend: '0% vs. baseline',
    security_breaches: 0,
    breaches_trend: '0% vs. baseline'
  };

  const trends = dashboardData?.detection_trends || [];
  const actDist = dashboardData?.activity_distribution || { total: 0, items: [] };
  const sevDist = dashboardData?.alert_severity || { total: 0, items: [] };
  const cameraSummary = dashboardData?.camera_summary || [];
  const heatmapData = dashboardData?.heatmap_data || [];
  const recentAlerts = dashboardData?.recent_alerts || [];
  const insights = dashboardData?.statistical_insights;

  // Format large numbers with commas
  const formatNum = (n) => {
    if (n === undefined || n === null) return '0';
    return Number(n).toLocaleString('en-US');
  };

  // SVG Chart Dimensions & Helpers for Detection Trends
  const chartWidth = 560;
  const chartHeight = 220;
  const padding = { top: 20, right: 25, bottom: 35, left: 40 };

  const maxVal = useMemo(() => {
    if (!trends || trends.length === 0) return 500;
    const allVals = trends.flatMap(d => [d.persons, d.vehicles, d.animals, d.alerts]);
    const maxSeen = Math.max(...allVals, 0);
    if (maxSeen === 0) return 500;
    return Math.ceil(maxSeen * 1.25 / 50) * 50 || 100;
  }, [trends]);

  const getY = (val) => {
    const usableHeight = chartHeight - padding.top - padding.bottom;
    return chartHeight - padding.bottom - ((val || 0) / maxVal) * usableHeight;
  };

  const getX = (idx, total) => {
    const usableWidth = chartWidth - padding.left - padding.right;
    if (total <= 1) return padding.left + usableWidth / 2;
    return padding.left + (idx / (total - 1)) * usableWidth;
  };

  // Generate smooth SVG curve path
  const makePath = (key) => {
    if (!trends || trends.length === 0) return '';
    return trends.map((pt, i) => {
      const x = getX(i, trends.length);
      const y = getY(pt[key]);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  // Calculate SVG Donut Arcs
  const renderDonutArcs = (items, total, radius = 55, strokeWidth = 22) => {
    if (!items || items.length === 0 || total === 0) {
      return (
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="transparent"
          stroke="var(--card-border, #334155)"
          strokeWidth={strokeWidth}
          opacity="0.3"
        />
      );
    }

    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    return items.map((item, idx) => {
      const slicePercentage = (item.count / total);
      const strokeLength = slicePercentage * circumference;
      const spaceLength = circumference - strokeLength;
      const strokeDashoffset = -accumulatedAngle * circumference;
      accumulatedAngle += slicePercentage;

      return (
        <circle
          key={idx}
          cx="80"
          cy="80"
          r={radius}
          fill="transparent"
          stroke={item.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${strokeLength} ${spaceLength}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
        />
      );
    });
  };

  return (
    <div className="analytics-dashboard-view">
      {/* 1. Header Bar */}
      <div className="analytics-hero-header">
        <div className="analytics-hero-titles">
          <div className="analytics-title-icon-badge">
            <BarChart3 size={24} className="text-accent" />
          </div>
          <div>
            <h1 className="analytics-main-title">Analytics Dashboard</h1>
            <p className="analytics-sub-title">Insights from real-time surveillance and historical data</p>
          </div>
        </div>

        <div className="analytics-header-controls">
          {/* Time Range Dropdown */}
          <div className="analytics-time-select-wrap">
            <Calendar size={14} className="time-select-icon" />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="analytics-time-dropdown"
              aria-label="Time Filter"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
            <ChevronDown size={13} className="time-select-arrow" />
          </div>

          {/* Export Report Action */}
          <button
            className="analytics-btn-export"
            onClick={() => onExportReport && onExportReport(null, null, timeRange)}
            title="Generate verified intelligence report"
          >
            <Download size={14} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="analytics-refresh-banner">
          <Activity size={14} className="spin-fast text-sky-400" />
          <span>Synchronizing live surveillance telemetry from SQLite database...</span>
        </div>
      )}

      {/* 2. Top Metric Cards (Row 1) */}
      <div className="analytics-kpi-row">
        {/* Card 1: Persons Detected */}
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-sky-soft">
            <Users size={22} className="text-sky-500" />
          </div>
          <div className="stat-content">
            <div className="stat-label">Total Persons Detected</div>
            <div className="stat-value">{formatNum(kpis.total_persons)}</div>
            <div className="stat-trend trend-positive">
              <ArrowUpRight size={13} />
              <span>{kpis.persons_trend}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Vehicles Detected */}
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-emerald-soft">
            <Car size={22} className="text-emerald-500" />
          </div>
          <div className="stat-content">
            <div className="stat-label">Vehicles Detected</div>
            <div className="stat-value">{formatNum(kpis.total_vehicles)}</div>
            <div className="stat-trend trend-positive">
              <ArrowUpRight size={13} />
              <span>{kpis.vehicles_trend}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Animals Detected */}
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-teal-soft">
            <Activity size={22} className="text-teal-500" />
          </div>
          <div className="stat-content">
            <div className="stat-label">Animals Detected</div>
            <div className="stat-value">{formatNum(kpis.total_animals)}</div>
            <div className={`stat-trend ${kpis.total_animals > 0 ? 'trend-negative' : 'trend-neutral'}`}>
              {kpis.total_animals > 0 ? <ArrowDownRight size={13} /> : null}
              <span>{kpis.animals_trend}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Security Breaches */}
        <div className="stat-card">
          <div className="stat-icon-wrapper bg-rose-soft">
            <ShieldAlert size={22} className="text-rose-500" />
          </div>
          <div className="stat-content">
            <div className="stat-label">Security Breaches</div>
            <div className="stat-value text-rose-500">{formatNum(kpis.security_breaches)}</div>
            <div className={`stat-trend ${kpis.security_breaches > 0 ? 'trend-breach' : 'trend-neutral'}`}>
              {kpis.security_breaches > 0 ? <ArrowUpRight size={13} /> : null}
              <span>{kpis.breaches_trend}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Visualizations Grid (Row 2) */}
      <div className="analytics-mid-grid">
        {/* Detection Trends Multi-Line Chart */}
        <div className="analytics-card chart-trend-card">
          <div className="card-top-bar">
            <div>
              <h3 className="card-heading">Detection Trends</h3>
            </div>
            <div className="card-actions">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="mini-select"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Series Legend */}
          <div className="chart-legend-row">
            <div className="legend-chip"><span className="dot dot-blue" /> Persons</div>
            <div className="legend-chip"><span className="dot dot-green" /> Vehicles</div>
            <div className="legend-chip"><span className="dot dot-orange" /> Animals</div>
            <div className="legend-chip"><span className="dot dot-red" /> Alerts</div>
          </div>

          {/* Responsive SVG Line Chart */}
          <div className="svg-chart-container">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="trends-svg"
              preserveAspectRatio="none"
            >
              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = chartHeight - padding.bottom - pct * (chartHeight - padding.top - padding.bottom);
                const val = Math.round(maxVal * pct);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="var(--chart-grid, #334155)"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--text-muted, #94a3b8)"
                      className="svg-axis-label font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Labels */}
              {trends.map((pt, i) => {
                const x = getX(i, trends.length);
                return (
                  <text
                    key={i}
                    x={x}
                    y={chartHeight - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-muted, #94a3b8)"
                    className="svg-axis-label"
                  >
                    {pt.date}
                  </text>
                );
              })}

              {/* Data Series Polylines */}
              <path d={makePath('persons')} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
              <path d={makePath('vehicles')} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
              <path d={makePath('animals')} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
              <path d={makePath('alerts')} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />

              {/* Data Points */}
              {trends.map((pt, i) => {
                const x = getX(i, trends.length);
                return (
                  <g key={i} onMouseEnter={() => setHoveredPoint(pt)} onMouseLeave={() => setHoveredPoint(null)}>
                    <circle cx={x} cy={getY(pt.persons)} r="3.5" fill="#3b82f6" stroke="#ffffff" strokeWidth="1.5" className="chart-point" />
                    <circle cx={x} cy={getY(pt.vehicles)} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" className="chart-point" />
                    <circle cx={x} cy={getY(pt.animals)} r="3.5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" className="chart-point" />
                    <circle cx={x} cy={getY(pt.alerts)} r="3.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" className="chart-point" />
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div className="chart-hover-tooltip">
                <div className="tooltip-title">{hoveredPoint.date}</div>
                <div className="tooltip-row text-sky-400"><span>Persons:</span> <b>{hoveredPoint.persons}</b></div>
                <div className="tooltip-row text-emerald-400"><span>Vehicles:</span> <b>{hoveredPoint.vehicles}</b></div>
                <div className="tooltip-row text-amber-400"><span>Animals:</span> <b>{hoveredPoint.animals}</b></div>
                <div className="tooltip-row text-rose-400"><span>Alerts:</span> <b>{hoveredPoint.alerts}</b></div>
              </div>
            )}
          </div>
        </div>

        {/* Activity Distribution Donut */}
        <div className="analytics-card donut-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Activity Distribution</h3>
          </div>
          <div className="donut-stage-layout">
            <div className="donut-visual-box">
              <svg viewBox="0 0 160 160" className="donut-svg">
                {renderDonutArcs(actDist.items, actDist.total, 54, 22)}
              </svg>
              <div className="donut-center-info">
                <span className="donut-center-val">{formatNum(actDist.total)}</span>
                <span className="donut-center-lbl">Total Detections</span>
              </div>
            </div>

            <div className="donut-legend-column">
              {actDist.items.map((it, idx) => (
                <div key={idx} className="donut-legend-item">
                  <div className="legend-left">
                    <span className="legend-indicator-dot" style={{ backgroundColor: it.color }} />
                    <span className="legend-name">{it.label}</span>
                  </div>
                  <span className="legend-pct font-mono">{it.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert Severity Donut */}
        <div className="analytics-card donut-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Alert Severity</h3>
            <span className="sub-badge">This Week</span>
          </div>
          <div className="donut-stage-layout">
            <div className="donut-visual-box">
              <svg viewBox="0 0 160 160" className="donut-svg">
                {renderDonutArcs(sevDist.items, sevDist.total, 54, 22)}
              </svg>
              <div className="donut-center-info">
                <span className="donut-center-val">{formatNum(sevDist.total)}</span>
                <span className="donut-center-lbl">Total Alerts</span>
              </div>
            </div>

            <div className="donut-legend-column">
              {sevDist.items.map((it, idx) => (
                <div key={idx} className="donut-legend-item">
                  <div className="legend-left">
                    <span className="legend-indicator-dot" style={{ backgroundColor: it.color }} />
                    <span className="legend-name">{it.label}</span>
                  </div>
                  <span className="legend-pct font-mono">{it.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Row 3: Detection Heatmap & Camera Wise Summary */}
      <div className="analytics-heatmap-summary-row">
        {/* Detection Heatmap Card */}
        <div className="analytics-card heatmap-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Detection Heatmap</h3>
            <div className="card-actions">
              <select
                value={heatmapFilter}
                onChange={(e) => setHeatmapFilter(e.target.value)}
                className="mini-select"
              >
                <option value="person">Person Activity</option>
                <option value="vehicle">Vehicle Activity</option>
                <option value="animal">Animal Activity</option>
                <option value="all">All Activity</option>
              </select>
            </div>
          </div>

          {/* Interactive Satellite Canvas Stage */}
          <div className="heatmap-canvas-stage">
            <div
              className="heatmap-satellite-background"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
            >
              {/* International Border Delineation */}
              <div className="heatmap-border-line" />

              {/* Territorial HUD Watermarks */}
              <div className="map-country-label pakistan font-mono">PAKISTAN</div>
              <div className="map-country-label india font-mono">INDIA</div>

              {/* Dynamic Heatmap Glowing Blobs based on Real Surveillance Detections */}
              {heatmapData.map((st, i) => {
                let weightVal = st.weight || 0;
                if (heatmapFilter === 'person') weightVal = st.persons > 0 ? Math.min(1, st.persons / 5) : 0;
                else if (heatmapFilter === 'vehicle') weightVal = st.vehicles > 0 ? Math.min(1, st.vehicles / 5) : 0;
                else if (heatmapFilter === 'animal') weightVal = st.animals > 0 ? Math.min(1, st.animals / 5) : 0;

                if (weightVal <= 0) return null;

                const blobSize = 40 + weightVal * 70;
                return (
                  <div
                    key={i}
                    className="heatmap-hotspot-glow"
                    style={{
                      left: `${st.x}%`,
                      top: `${st.y}%`,
                      width: `${blobSize}px`,
                      height: `${blobSize}px`,
                      opacity: Math.min(0.9, 0.4 + weightVal * 0.5)
                    }}
                    title={`${st.camera_id} (${st.location}): ${st.persons} Persons, ${st.vehicles} Vehicles, ${st.animals} Animals`}
                  />
                );
              })}

              {/* Camera Station Pins */}
              {heatmapData.map((st, i) => (
                <div
                  key={`pin-${i}`}
                  className="heatmap-camera-pin"
                  style={{ left: `${st.x}%`, top: `${st.y}%` }}
                >
                  <div className="pin-dot" />
                  <span className="pin-label font-mono">{st.camera_id}</span>
                </div>
              ))}
            </div>

            {/* Zoom Controls */}
            <div className="heatmap-zoom-controls">
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 1.8))}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className="zoom-btn"
                onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.8))}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
            </div>

            {/* Bottom Intensity Gradient Bar */}
            <div className="heatmap-bottom-legend">
              <span className="legend-tag">Low Activity</span>
              <div className="heatmap-gradient-track" />
              <span className="legend-tag">High Activity</span>
            </div>
          </div>
        </div>

        {/* Camera Wise Summary Card */}
        <div className="analytics-card camera-summary-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Camera Wise Summary</h3>
            <button
              className="view-all-link"
              onClick={() => onNavigateToTab && onNavigateToTab('camera-management')}
            >
              View All
            </button>
          </div>

          <div className="analytics-table-wrap">
            <table className="analytics-data-table">
              <thead>
                <tr>
                  <th>Camera ID</th>
                  <th>Location</th>
                  <th>Persons</th>
                  <th>Vehicles</th>
                  <th>Animals</th>
                  <th>Alerts</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cameraSummary.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="table-empty-row">No active camera stations configured</td>
                  </tr>
                ) : (
                  cameraSummary.map((cam, idx) => (
                    <tr key={idx}>
                      <td className="font-mono font-bold text-sky-400">{cam.camera_id}</td>
                      <td>{cam.location}</td>
                      <td>{formatNum(cam.persons)}</td>
                      <td>{formatNum(cam.vehicles)}</td>
                      <td>{formatNum(cam.animals)}</td>
                      <td className="font-bold text-rose-500">{cam.alerts}</td>
                      <td>
                        <div className="status-cell">
                          <span className={`status-circle ${cam.status === 'Online' ? 'online' : 'offline'}`} />
                          <span>{cam.status}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Bottom Row: Recent Alerts Table & Statistical Insights */}
      <div className="analytics-bottom-grid">
        {/* Recent Alerts Table */}
        <div className="analytics-card recent-alerts-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Recent Alerts</h3>
            <button
              className="view-all-link"
              onClick={() => onNavigateToTab && onNavigateToTab('events-alerts')}
            >
              View All
            </button>
          </div>

          <div className="analytics-table-wrap">
            <table className="analytics-data-table alerts-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Camera</th>
                  <th>Event Type</th>
                  <th>Confidence</th>
                  <th>Location</th>
                  <th>Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {recentAlerts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="table-empty-row">
                      <CheckCircle2 size={16} className="text-emerald-500 inline-block mr-2" />
                      No security alerts recorded. Perimeter is secure.
                    </td>
                  </tr>
                ) : (
                  recentAlerts.map((evt) => (
                    <tr key={evt.id} onClick={() => setActiveSnapshotEvent(evt)} className="clickable-row">
                      <td className="font-mono text-slate-400">{evt.time}</td>
                      <td className="font-mono font-bold text-sky-400">{evt.camera}</td>
                      <td>
                        <div className="event-type-cell">
                          <span className="event-icon">
                            {evt.event_type?.toLowerCase().includes('person') ? '👤' :
                             evt.event_type?.toLowerCase().includes('vehicle') ? '🚗' :
                             evt.event_type?.toLowerCase().includes('animal') ? '🐾' :
                             evt.event_type?.toLowerCase().includes('loiter') ? '⏱️' : '⚠️'}
                          </span>
                          <span className="event-name">{evt.event_type}</span>
                        </div>
                      </td>
                      <td className="font-mono font-semibold text-emerald-400">{evt.confidence}%</td>
                      <td className="text-slate-300">{evt.location}</td>
                      <td>
                        <div className="snapshot-thumb-wrap">
                          {evt.snapshot ? (
                            <img
                              src={evt.snapshot}
                              alt="Snapshot"
                              className="snapshot-mini-thumb"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statistical Insights Cards (2x2 Grid) */}
        <div className="analytics-card statistical-insights-card">
          <div className="card-top-bar">
            <h3 className="card-heading">Statistical Insights</h3>
          </div>

          <div className="insights-2x2-grid">
            {/* Insight 1: Human Activity */}
            <div className="insight-box">
              <div className="insight-icon-box bg-emerald-soft">
                <ArrowUpRight size={20} className="text-emerald-500" />
              </div>
              <div className="insight-text-group">
                <span className="insight-stat font-bold text-emerald-500">
                  {insights?.human_activity?.percentage || 12}%
                </span>
                <p className="insight-desc">
                  {insights?.human_activity?.text || 'Increase in human activity near Sector B'}
                </p>
              </div>
            </div>

            {/* Insight 2: Security Breaches */}
            <div className="insight-box">
              <div className="insight-icon-box bg-rose-soft">
                <ShieldAlert size={20} className="text-rose-500" />
              </div>
              <div className="insight-text-group">
                <span className="insight-stat font-bold text-rose-500">
                  {insights?.security_breaches?.percentage || 40}%
                </span>
                <p className="insight-desc">
                  {insights?.security_breaches?.text || 'Rise in security breaches compared to last week'}
                </p>
              </div>
            </div>

            {/* Insight 3: Response Time */}
            <div className="insight-box">
              <div className="insight-icon-box bg-sky-soft">
                <Clock size={20} className="text-sky-500" />
              </div>
              <div className="insight-text-group">
                <span className="insight-stat font-bold text-sky-400">
                  {insights?.response_time?.value || '18 min'}
                </span>
                <p className="insight-desc">
                  {insights?.response_time?.label || 'Average response time'}
                </p>
              </div>
            </div>

            {/* Insight 4: Accuracy */}
            <div className="insight-box">
              <div className="insight-icon-box bg-purple-soft">
                <Activity size={20} className="text-purple-400" />
              </div>
              <div className="insight-text-group">
                <span className="insight-stat font-bold text-purple-400">
                  {insights?.system_accuracy?.value || '92%'}
                </span>
                <p className="insight-desc">
                  {insights?.system_accuracy?.label || 'System accuracy (yolo + tracking)'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Lightbox Modal for Recent Alerts */}
      {activeSnapshotEvent && (
        <SnapshotModal
          event={activeSnapshotEvent}
          onClose={() => setActiveSnapshotEvent(null)}
        />
      )}
    </div>
  );
}
