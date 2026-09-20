import React, { useState } from 'react';
import {
  BookOpen, Search, Shield, Activity, Eye, Zap, Crosshair,
  AlertTriangle, CheckCircle, Database, Cpu, Camera, Terminal,
  Sliders, Bell, Compass, FileText, ChevronRight, HelpCircle
} from 'lucide-react';

export default function HelpManualTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState('overview');

  const manualSections = [
    {
      id: 'overview',
      title: '1. System Architecture & Operations',
      icon: Shield,
      summary: 'High-level C4I platform architecture, telemetry loop, and operational concepts.',
      content: (
        <div>
          <h4>Tactical Surveillance Telemetry Loop</h4>
          <p>
            IBVAP (Intelligent Border Video Analysis Platform) operates an asynchronous, multi-threaded
            computer vision and telemetry loop designed for continuous frontier surveillance:
          </p>
          <div className="manual-flow-diagram">
            <code>
              Video Feed / RTSP &#8594; OpenCV Decode &#8594; YOLOv8 Detection &#8594; ByteTrack Multi-Object Tracker &#8594; Rule Engine (Zone &amp; Loitering) &#8594; Threat Risk Engine (0-100) &#8594; Evidence Snapshot Capture &#8594; SQLite Database &#8594; Real-Time WebSocket (port 8000) &#8594; React Tactical Console (port 5173)
            </code>
          </div>
          <h4>Core Functions:</h4>
          <ul>
            <li><b>Real-Time Feed Analysis:</b> Processes sequential frames via an accelerated pipeline, overlaying spatial bounding boxes, track vectors, and restricted zone polygons.</li>
            <li><b>Automated Boundary Auditing:</b> Evaluates target trajectories in millisecond intervals against polygon boundaries and virtual perimeter lines.</li>
            <li><b>Human-In-The-Loop Verification:</b> Every flagged incident creates an evidence snapshot and requires operator confirmation or escalation.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'feed-control',
      title: '2. Feed Control & Analysis Modes',
      icon: Camera,
      summary: 'Managing video assets, RTSP camera stations, and accelerated analysis speeds.',
      content: (
        <div>
          <h4>Starting &amp; Halting Analysis</h4>
          <ul>
            <li><b>Start Analysis Button:</b> Launches the background YOLOv8 + ByteTrack worker thread on the active camera/video. Transitions status from <code>IDLE</code> to <code>RUNNING</code>.</li>
            <li><b>Stop Analysis Button:</b> Safely disengages the neural worker, commits finalized metrics to the database, and pauses playback.</li>
          </ul>
          <h4>Analysis Speed Modes:</h4>
          <ul>
            <li><b>1x Real-Time:</b> Standard video frame clock (25-30 FPS). Best for live camera streams or forensic review.</li>
            <li><b>2x Fast Surveillance (Recommended):</b> Adaptive stride (every 2nd frame processed), balancing GPU/CPU utilization while maintaining 98%+ track continuity.</li>
            <li><b>4x High-Speed Rapid Scan:</b> Rapid sector sweep mode (stride = 4). Rapidly flags boundary incidents across hour-long recordings in minutes.</li>
          </ul>
          <h4>View Modes:</h4>
          <ul>
            <li><b>Analysis Mode:</b> Renders live MJPEG stream annotated with neural bounding boxes, velocity vectors, and restricted zone overlays.</li>
            <li><b>Original Mode:</b> Renders clean, uncompressed camera footage with lightweight HTML5 canvas overlays for zero-latency monitoring.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'detection-tracking',
      title: '3. YOLOv8 Detection & ByteTrack Tracker',
      icon: Crosshair,
      summary: 'Object classification, confidence tuning, and trajectory tracking parameters.',
      content: (
        <div>
          <h4>YOLOv8 Neural Detection Parameters</h4>
          <ul>
            <li><b>Confidence Threshold (Default: 0.35):</b> The minimum model confidence required to register a detection.
              <br />&#8226; <i>Higher (0.50 - 0.70):</i> Filters out shadows, shrubbery, and distance noise. Best for high-contrast desert/plains sectors.
              <br />&#8226; <i>Lower (0.20 - 0.35):</i> Captures low-light, distant, or camouflaged intruders. Recommended for night operations.
            </li>
            <li><b>Target Categories:</b>
              <br />&#8226; <code>Person:</code> Intruder, patrol infantry, infiltrator. Highest priority classification.
              <br />&#8226; <code>Vehicle:</code> 4x4 vehicles, trucks, armored units, motorcycles.
              <br />&#8226; <code>Animal:</code> Border wildlife, cattle. Filtered to prevent false breach alerts.
            </li>
          </ul>
          <h4>ByteTrack Multi-Object Tracker</h4>
          <p>
            ByteTrack associates detections across sequential frames using Kalman filtering and intersection-over-union (IoU) matching.
            Each target is assigned a persistent <b>Tracking ID (#TRK)</b> that retains identity even during temporary occlusions (behind trees, watchtowers, or fences).
          </p>
          <ul>
            <li><b>Velocity Vector:</b> Calculated from the target centroid displacement over a 1.5-second rolling window.</li>
            <li><b>Direction Classification:</b> Automatically identifies trajectories: <i>Towards Border</i>, <i>Parallel to Fence</i>, <i>Stationary</i>, or <i>Departing Sector</i>.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'zones-rules',
      title: '4. Restricted Zones & Virtual Tripwires',
      icon: Sliders,
      summary: 'Drawing boundary polygons, configuring loitering dwell times, and alert cooldowns.',
      content: (
        <div>
          <h4>Restricted Zone Polygons</h4>
          <p>
            Restricted Zones define sensitive perimeter buffer corridors. Any human or vehicle target entering
            the polygon automatically triggers an immediate <b>CRITICAL ZONE BREACH</b> alert.
          </p>
          <ul>
            <li><b>Normalized Coordinates:</b> Coordinates are defined as normalized percentages <code>(x, y)</code> where <code>(0.0, 0.0)</code> is top-left and <code>(1.0, 1.0)</code> is bottom-right.</li>
            <li><b>Point-in-Polygon (Ray Casting):</b> Evaluated per frame in &lt;1ms. If the bottom center point of a bounding box falls within the polygon, a breach is logged.</li>
          </ul>
          <h4>Loitering Detection</h4>
          <ul>
            <li><b>Loitering Threshold (Default: 4.0s - 30.0s):</b> Defines the maximum time a target may remain stationary within 15 meters of the border line before an alert is raised.</li>
            <li><b>Dwell Time Counter:</b> Displays the cumulative seconds an active track has been detected in the sector.</li>
          </ul>
          <h4>Event Cooldown (Debounce)</h4>
          <p>
            Minimum seconds between consecutive alerts for the same tracking ID (default: 3.0s). Prevents generating 30 alerts per second while a single intruder remains in the restricted zone.
          </p>
        </div>
      )
    },
    {
      id: 'threat-engine',
      title: '5. Composite Threat Risk Score (0-100)',
      icon: Activity,
      summary: 'Formula and factors governing the dynamic Sector Threat Index and risk levels.',
      content: (
        <div>
          <h4>Threat Score Mathematical Model</h4>
          <p>
            The Threat Risk Engine evaluates active sector intelligence and computes a composite index from <code>0</code> (Secure) to <code>100</code> (Maximum Threat):
          </p>
          <div className="manual-table-wrapper">
            <table className="manual-table">
              <thead>
                <tr>
                  <th>Factor Condition</th>
                  <th>Points Added</th>
                  <th>Operational Rationale</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Zone Breach Active</b></td>
                  <td>+35 pts</td>
                  <td>Confirmed physical presence inside zero-tolerance buffer corridor.</td>
                </tr>
                <tr>
                  <td><b>Person Detected</b></td>
                  <td>+25 pts</td>
                  <td>Unidentified human entity detected within surveillance field of view.</td>
                </tr>
                <tr>
                  <td><b>Movement Towards Border</b></td>
                  <td>+20 pts</td>
                  <td>Target velocity vector directed toward international boundary fence.</td>
                </tr>
                <tr>
                  <td><b>Vehicle Incursion</b></td>
                  <td>+20 pts</td>
                  <td>Rapid motorized transport within perimeter exclusion zone.</td>
                </tr>
                <tr>
                  <td><b>Loitering Dwell &gt; 30s</b></td>
                  <td>+15 pts</td>
                  <td>Prolonged reconnaissance or stationary behavior near fence line.</td>
                </tr>
                <tr>
                  <td><b>Target Cluster (&ge; 3 entities)</b></td>
                  <td>+15 pts</td>
                  <td>Coordinated multi-agent group movement.</td>
                </tr>
                <tr>
                  <td><b>Night Ops Condition</b></td>
                  <td>+10 pts</td>
                  <td>Reduced visibility environment increasing infiltration probability.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h4>Threat Classifications:</h4>
          <ul>
            <li><span className="manual-pill pill-secure">0 - 24: SECURE</span> Sector nominal. Standard patrol and sensor grid armed.</li>
            <li><span className="manual-pill pill-medium">25 - 49: MEDIUM RISK</span> Activity detected in outer buffer. Heightened tracking alert.</li>
            <li><span className="manual-pill pill-high">50 - 74: HIGH RISK</span> Suspicious vectors approaching fence line. Automated alert dispatched.</li>
            <li><span className="manual-pill pill-critical">75 - 100: CRITICAL</span> Active breach or incursion. Immediate tactical dispatch recommended.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'evidence-reports',
      title: '6. Evidence Snapshots & Forensic Reports',
      icon: FileText,
      summary: 'Capturing forensic stills, verification workflow, and generating official reports.',
      content: (
        <div>
          <h4>Automated Evidence Capture</h4>
          <p>
            Upon any breach or high-risk trigger, the pipeline instantly crops and saves a full-resolution JPEG evidence snapshot
            to the secure storage directory (<code>storage/evidence/</code>).
          </p>
          <ul>
            <li><b>Naming Convention:</b> <code>evidence_&#123;cameraId&#125;_&#123;timestamp&#125;_&#123;trackId&#125;.jpg</code></li>
            <li><b>Snapshot Sync:</b> Displayed instantly in the <i>Event Timeline</i> and <i>Current Event</i> card. Clicking any thumbnail seeks the playback directly to the exact millisecond of capture.</li>
          </ul>
          <h4>Operator Verification Workflow:</h4>
          <ul>
            <li><b>Mark as Verified:</b> Confirms the incident was visually inspected by the command center operator, logging the operator callsign and timestamp to the permanent audit log.</li>
            <li><b>Export Tactical Report:</b> Generates a standardized surveillance report in PDF or structured JSON format, including sector map, incident logs, target breakdowns, and evidence images.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'hardware-perf',
      title: '7. Hardware Monitoring & Optimization',
      icon: Cpu,
      summary: 'System requirements, CPU/GPU loads, and tuning for edge hardware.',
      content: (
        <div>
          <h4>Recommended System Sizing:</h4>
          <ul>
            <li><b>Minimum:</b> Intel Core i5 / AMD Ryzen 5, 8GB RAM, integrated graphics (runs YOLOv8n @ 10-15 FPS).</li>
            <li><b>Tactical Command Station:</b> Intel Core i7/i9, 16GB RAM, NVIDIA RTX 3060/4060 6GB+ VRAM (runs 4 concurrent feeds @ 30 FPS).</li>
          </ul>
          <h4>Performance Tuning Tips:</h4>
          <ul>
            <li><b>Inference Size (imgsz):</b> Set to <code>384px</code> in Video Processing settings for 2x faster frame rates on standard laptops, or <code>640px</code> for maximum distance accuracy on dedicated workstations.</li>
            <li><b>Frame Stride:</b> Use <code>2x Fast</code> speed mode during general monitoring. Stride skips redundant frames, doubling pipeline throughput.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'shortcuts',
      title: '8. Hotkeys & Quick Reference',
      icon: Terminal,
      summary: 'Keyboard shortcuts for rapid tactical response during live operations.',
      content: (
        <div>
          <h4>Operational Keybindings:</h4>
          <div className="manual-table-wrapper">
            <table className="manual-table">
              <thead>
                <tr>
                  <th>Shortcut Key</th>
                  <th>Function Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>Spacebar</code></td>
                  <td>Toggle Play / Pause or Start / Stop Analysis.</td>
                </tr>
                <tr>
                  <td><code>F</code></td>
                  <td>Toggle Fullscreen Mode for primary video panel.</td>
                </tr>
                <tr>
                  <td><code>M</code></td>
                  <td>Toggle Audio Mute on surveillance video player.</td>
                </tr>
                <tr>
                  <td><code>1 / 2 / 3</code></td>
                  <td>Switch analysis speed (1x Realtime / 2x Fast / 4x Max).</td>
                </tr>
                <tr>
                  <td><code>&larr; / &rarr;</code></td>
                  <td>Seek backward / forward by 5 seconds in video footage.</td>
                </tr>
                <tr>
                  <td><code>Esc</code></td>
                  <td>Close open modals, dropdowns, or exit fullscreen.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )
    }
  ];

  const filteredSections = manualSections.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.summary.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSectionData = manualSections.find(s => s.id === selectedSection) || manualSections[0];

  return (
    <div className="help-manual-wrapper">
      {/* Header with Search */}
      <div className="help-manual-header">
        <div>
          <h3 className="settings-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <BookOpen size={18} color="#38bdf8" />
            Tactical Field Manual &amp; Operational Documentation
          </h3>
          <p className="field-hint" style={{ marginTop: '4px' }}>
            Comprehensive guide covering all surveillance parameters, neural detection pipelines, threat assessment formulas, and operator workflows.
          </p>
        </div>

        <div className="help-search-box">
          <Search size={14} className="help-search-icon" />
          <input
            type="text"
            className="help-search-input"
            placeholder="Search manual (e.g., threat score, confidence, zones)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Two-Column Layout: Navigation Index on Left (30%), Content on Right (70%) */}
      <div className="help-manual-body">
        {/* Navigation Sidebar */}
        <div className="help-manual-nav">
          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            const isSelected = selectedSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                className={`help-nav-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedSection(sec.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <Icon size={14} className="help-nav-icon" />
                  <span className="help-nav-title">{sec.title}</span>
                </div>
                <ChevronRight size={12} className="help-nav-arrow" />
              </button>
            );
          })}
          {filteredSections.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center' }}>
              No chapters match "{searchQuery}"
            </div>
          )}
        </div>

        {/* Content Viewer */}
        <div className="help-manual-content">
          <div className="help-content-card">
            <div className="help-content-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {React.createElement(activeSectionData.icon, { size: 20, color: 'var(--primary-blue)' })}
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-heading)' }}>
                  {activeSectionData.title}
                </h3>
              </div>
              <span className="help-badge">TACTICAL FIELD MANUAL</span>
            </div>
            <div className="help-content-summary">
              {activeSectionData.summary}
            </div>
            <div className="help-content-markdown">
              {activeSectionData.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
