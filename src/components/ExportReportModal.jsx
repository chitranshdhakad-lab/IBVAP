import React, { useState, useEffect } from 'react';
import { Download, FileText, X, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import { getStoredSettings } from '../services/settingsManager.js';


export default function ExportReportModal({
  isOpen,
  onClose,
  cameras = [],
  selectedCamera,
  selectedVideo
}) {
  const [reportType, setReportType] = useState('events'); // 'events', 'analysis', 'analytics', 'cameras'
  const [format, setFormat] = useState('pdf'); // 'pdf', 'csv'
  const [timeRange, setTimeRange] = useState('all'); // '24h', '7d', '30d', 'all'
  const [targetCamera, setTargetCamera] = useState(selectedCamera || 'All');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const s = getStoredSettings();
      const fmt = (s.exportFormat || 'PDF').toLowerCase();
      setFormat(fmt === 'csv' ? 'csv' : 'pdf');
      if (selectedCamera) setTargetCamera(selectedCamera);
    }
  }, [isOpen, selectedCamera]);

  if (!isOpen) return null;

  const handleDownload = () => {
    setIsGenerating(true);
    const params = new URLSearchParams({
      report_type: reportType,
      format,
      time_range: timeRange,
      camera_id: targetCamera !== 'All' ? targetCamera : ''
    });

    if (selectedVideo) {
      params.append('video_id', selectedVideo);
    }

    // Direct browser navigation triggers file download with Content-Disposition
    const url = `/api/reports/export?${params.toString()}`;
    window.location.href = url;

    setTimeout(() => {
      setIsGenerating(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content report-export-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <FileText size={16} color="#22c55e" />
            <h3>Export Operational Surveillance Report</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="btn-modal-back" onClick={onClose} title="Go Back">
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button className="btn-close" onClick={onClose} title="Close"><X size={16} /></button>
          </div>
        </div>


        <div className="modal-body form-body">
          <div className="form-group">
            <label>Report Subject</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="events">Security Incidents & Breach Event Log</option>
              <option value="analysis">Video Analysis Execution Summary</option>
              <option value="analytics">Operational Analytics & Intelligence Summary</option>
              <option value="cameras">Perimeter Camera Stations Audit</option>
            </select>
          </div>

          <div className="form-group">
            <label>Export Format</label>
            <div className="radio-button-row">
              <label className={`format-chip ${format === 'pdf' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  style={{ display: 'none' }}
                />
                <b>PDF Document</b> (ReportLab Styled with Official Header)
              </label>
              <label className={`format-chip ${format === 'csv' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  style={{ display: 'none' }}
                />
                <b>CSV Spreadsheet</b> (Structured Database Rows)
              </label>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group half">
              <label>Target Station Scope</label>
              <select value={targetCamera} onChange={e => setTargetCamera(e.target.value)}>
                <option value="All">All Configured Stations</option>
                {cameras.map(c => (
                  <option key={c.id} value={c.id}>{c.id} ({c.sector})</option>
                ))}
              </select>
            </div>

            <div className="form-group half">
              <label>Time Filtering Scope</label>
              <select value={timeRange} onChange={e => setTimeRange(e.target.value)}>
                <option value="all">All Available Records</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
          </div>

          <div className="honest-notice-banner" style={{ marginTop: '12px' }}>
            <CheckCircle size={14} color="#22c55e" className="notice-icon" />
            <div>
              <b>VERIFIED SOURCE DATA:</b> All fields in this generated report are queried directly from the SQLite database and persistent evidence files.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn-primary"
            onClick={handleDownload}
            disabled={isGenerating}
          >
            <Download size={13} />
            {isGenerating ? 'Generating File...' : `Download ${format.toUpperCase()} Report`}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            <ArrowLeft size={13} /> Back
          </button>

        </div>
      </div>
    </div>
  );
}
