import React from 'react';
import { User, Car, PawPrint, Crosshair } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function IntelligencePanel({ liveIntelligence, analysisActive = false }) {
  const { t, settings } = useTranslation();
  const isLive = Boolean(analysisActive);

  // Strictly enforce settings toggles on displayed telemetry
  const isPersonEnabled = settings.personDetection !== false;
  const isVehicleEnabled = settings.vehicleDetection !== false;
  const isAnimalEnabled = settings.animalDetection !== false;

  const persons = !isPersonEnabled
    ? t('disabledOff')
    : isLive ? (liveIntelligence?.persons ?? 0) : '—';

  const vehicles = !isVehicleEnabled
    ? t('disabledOff')
    : isLive ? (liveIntelligence?.vehicles ?? 0) : '—';

  const animals = !isAnimalEnabled
    ? t('disabledOff')
    : isLive ? (liveIntelligence?.animals ?? 0) : '—';

  const tracks = isLive ? (liveIntelligence?.active_tracks ?? 0) : '—';

  const stats = [
    {
      id: 'person',
      label: t('persons'),
      value: persons,
      icon: User,
      iconClass: 'stat-icon-person',
      disabled: !isPersonEnabled
    },
    {
      id: 'vehicles',
      label: t('vehicles'),
      value: vehicles,
      icon: Car,
      iconClass: 'stat-icon-vehicle',
      disabled: !isVehicleEnabled
    },
    {
      id: 'animals',
      label: t('animals'),
      value: animals,
      icon: PawPrint,
      iconClass: 'stat-icon-animal',
      disabled: !isAnimalEnabled
    },
    {
      id: 'tracks',
      label: t('activeTracks'),
      value: tracks,
      icon: Crosshair,
      iconClass: 'stat-icon-tracks',
      disabled: false
    }
  ];

  return (
    <div className="intelligence-section">
      <div className="section-label">
        <span>{t('liveIntelligence')}</span>
        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.4px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: isLive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
            color: isLive ? '#16a34a' : '#64748b'
          }}
        >
          {isLive ? t('liveBadge') : t('noAnalysisBadge')}
        </span>
      </div>

      <div className="stat-cards-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.id}
              className={`stat-card ${stat.disabled ? 'stat-card-disabled' : ''}`}
              style={{
                opacity: stat.disabled ? 0.65 : 1,
                border: stat.disabled ? '1px dashed rgba(239, 68, 68, 0.3)' : undefined
              }}
              title={stat.disabled ? 'Detection for this class is toggled OFF in AI Settings' : undefined}
            >
              <div className={`stat-icon-wrapper ${stat.iconClass}`}>
                <Icon size={18} strokeWidth={2.4} />
              </div>
              <div
                className="stat-number"
                style={{
                  fontSize: stat.disabled ? '13px' : undefined,
                  color: stat.disabled ? '#ef4444' : undefined
                }}
              >
                {stat.value}
              </div>
              <div className="stat-name">{stat.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
