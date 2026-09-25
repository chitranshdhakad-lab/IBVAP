import React, { useState, useEffect } from 'react';
import {
  Camera,
  Cpu,
  HardDrive,
  Wifi,
  Settings2,
  Database
} from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function SystemStatus({ onViewDetails, isConnected }) {
  const { t } = useTranslation();
  const [telemetry, setTelemetry] = useState({
    backend: isConnected ? 'Online' : 'Standby',
    database: isConnected ? 'Connected' : 'Local SQLite',
    ai_service: isConnected ? 'Running (YOLOv8 + IoU Tracker)' : 'Standby',
    video_engine: isConnected ? 'Running' : 'Standby',
    cameras: '4 / 4',
    cpu_usage: 'N/A',
    memory_usage: 'N/A',
    storage_usage: 'N/A',
    storage_subtext: 'N/A',
    edge_device: 'Jetson Orin Node'
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/system/status');
        if (res.ok && isMounted) {
          const data = await res.json();
          setTelemetry(data);
        }
      } catch (e) {
        // Backend offline
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isConnected]);

  const isBackendOnline = telemetry.backend === 'Online';
  const isDbConnected = telemetry.database === 'Connected';
  const isAiReady = Boolean(telemetry.ai_service && !telemetry.ai_service.includes('Offline'));

  const statusItems = [
    {
      id: 'cameras',
      label: t('camerasLabel'),
      icon: Camera,
      value: telemetry.cameras || '4 registered',
      status: isBackendOnline ? 'Online' : 'Standby',
      statusColor: isBackendOnline ? 'system-state-green' : 'system-state-muted',
      subtext: null
    },
    {
      id: 'edge',
      label: t('edgeCompute'),
      icon: Cpu,
      value: null,
      status: isBackendOnline ? 'Online' : 'Standby',
      statusColor: isBackendOnline ? 'system-state-green' : 'system-state-muted',
      subtext: `CPU ${telemetry.cpu_usage || 'N/A'} | RAM ${telemetry.memory_usage || 'N/A'}`
    },
    {
      id: 'storage',
      label: t('diskStorage'),
      icon: HardDrive,
      value: telemetry.storage_usage || 'N/A',
      status: null,
      statusColor: 'system-state-green',
      subtext: telemetry.storage_subtext || 'Storage'
    },
    {
      id: 'network',
      label: t('telemetryStream'),
      icon: Wifi,
      value: null,
      status: isConnected ? 'Connected' : 'Offline',
      statusColor: isConnected ? 'system-state-green' : 'system-state-muted',
      subtext: isConnected ? 'WebSocket Active' : 'Disconnected'
    },
    {
      id: 'ai',
      label: t('cvTracking'),
      icon: Settings2,
      value: null,
      status: isAiReady ? 'Ready' : 'Offline',
      statusColor: isAiReady ? 'system-state-green' : 'system-state-muted',
      subtext: telemetry.ai_service || 'YOLOv8 + IoU Tracker'
    },
    {
      id: 'db',
      label: t('sqliteDatabase'),
      icon: Database,
      value: null,
      status: isDbConnected ? 'Connected' : 'Offline',
      statusColor: isDbConnected ? 'system-state-green' : 'system-state-muted',
      subtext: 'surveillance.db'
    }
  ];

  return (
    <div className="bottom-card">
      <div className="card-header-row">
        <span className="section-label">{t('systemStatus')}</span>
        <button
          className="card-link"
          style={{ background: 'none', border: 'none' }}
          onClick={() => onViewDetails && onViewDetails(telemetry)}
        >
          <span>{t('viewDetails')}</span>
        </button>
      </div>

      <div className="system-rows-list">
        {statusItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="system-row">
              <div className="system-row-left">
                <Icon className="system-row-icon" size={13} />
                <span>{item.label}</span>
              </div>

              <div className="system-row-right">
                {item.value && (
                  <span className="system-value">{item.value}</span>
                )}
                {item.status && (
                  <span className={item.statusColor}>{item.status}</span>
                )}
                {item.subtext && (
                  <span className="system-subtext">{item.subtext}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
