import React from 'react';
import {
  Monitor,
  Film,
  AlertTriangle,
  MapPin,
  BarChart3,
  Camera,
  Activity,
  Settings,
  Car
} from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function Sidebar({ activeItem, setActiveItem, unverifiedCount = 0 }) {
  const { t } = useTranslation();

  const navItems = [
    { id: 'live-monitor', label: t('liveMonitor'), icon: Monitor },
    { id: 'video-library', label: t('videoLibrary'), icon: Film },
    { id: 'events-alerts', label: t('eventsAlerts'), icon: AlertTriangle, badge: unverifiedCount > 0 ? unverifiedCount : null },
    { id: 'vehicle-anpr', label: 'Vehicle ANPR', icon: Car },
    { id: 'border-map', label: t('borderMap'), icon: MapPin },
    { id: 'analytics', label: t('analytics'), icon: BarChart3 },
    { id: 'camera-management', label: t('cameraManagement'), icon: Camera },
    { id: 'system-status', label: t('systemStatus'), icon: Activity },
    { id: 'settings', label: t('settings'), icon: Settings }
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {/* Government Emblem & Platform Branding */}
        <div className="sidebar-emblem-section">
          <img
            src="/assets/emblem.png"
            alt="National Emblem of India"
            className="sidebar-emblem-img"
          />
          <h1 className="sidebar-title">IBVAP</h1>
          <div className="sidebar-subtitle">
            {t('systemTitle')}
          </div>
          <div className="sidebar-tagline">
            {t('tagline')}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeItem === item.id;
            return (
              <div
                key={item.id}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveItem(item.id)}
              >
                <div className="sidebar-item-left">
                  <Icon className="sidebar-item-icon" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="sidebar-badge">{item.badge}</span>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-bottom">
        {/* Soldier Surveillance Visual */}
        <img
          src="/assets/sidebar-soldier.png"
          alt="Border Surveillance Vigilance"
          className="sidebar-soldier-img"
        />

        {/* Core Principles */}
        <div className="sidebar-motto">
          <div>{t('mottoVigilance')}</div>
          <div>{t('mottoTechnology')}</div>
          <div>{t('mottoSecurity')}</div>
          <div>{t('mottoSaferTomorrow')}</div>
        </div>

        {/* Official Footer */}
        <div className="sidebar-gov-footer">
          <img
            src="/assets/emblem-small.png"
            alt="Emblem of India"
            className="sidebar-gov-logo"
          />
          <div className="sidebar-gov-text">
            {t('govMinistry')}<br />
            {t('govIndia')}
          </div>
        </div>
      </div>
    </aside>
  );
}
