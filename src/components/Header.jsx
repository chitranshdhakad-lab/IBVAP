import React, { useState, useEffect, useRef } from 'react';
import {
  Bell, ChevronDown, User, CheckCircle, AlertTriangle, Search,
  Download, FileText, X, Camera, Film, Sun, Moon, Sparkles, Globe,
  UserPlus, ShieldCheck, ChevronRight, KeyRound, Lock, LogOut, Shield,
  Car, Trash2
} from 'lucide-react';
import {
  getStoredSettings,
  saveStoredSettings,
  subscribeSettings,
  applyThemeToDOM
} from '../services/settingsManager.js';
import {
  getStoredOperator,
  saveStoredOperator,
  subscribeOperator,
  fetchOperatorsList,
  deleteOperatorAccount,
  setWorkstationLock
} from '../services/operatorManager.js';
import CreateOperatorModal from './CreateOperatorModal.jsx';
import OperatorLoginModal from './OperatorLoginModal.jsx';
import { useTranslation } from '../services/i18n.js';

export default function Header({
  notificationCount = 0,
  isSystemOnline = false,
  recentAlerts = [],
  onVerifyAlert,
  onSelectAlert,
  onSelectCamera,
  onSelectVideo,
  onNavigateToTab,
  onOpenReportModal
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(getStoredSettings);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);
  const notificationRef = useRef(null);

  const [seenAlertIds, setSeenAlertIds] = useState(() => {
    try {
      const raw = localStorage.getItem('ibvap_seen_alerts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });


  const markAllAlertsSeen = () => {
    if (recentAlerts && recentAlerts.length > 0) {
      const newIds = recentAlerts.map((a) => a.id);
      const updated = Array.from(new Set([...seenAlertIds, ...newIds]));
      setSeenAlertIds(updated);
      try {
        localStorage.setItem('ibvap_seen_alerts', JSON.stringify(updated));
      } catch {}
    }
  };

  const unseenAlerts = (recentAlerts || []).filter((a) => !seenAlertIds.includes(a.id));
  const effectiveBadgeCount = unseenAlerts.length;

  const handleBellClick = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      markAllAlertsSeen();
    }
  };

  // Active Operator State & Authentication Modal Management
  const [currentOperator, setCurrentOperator] = useState(getStoredOperator);
  const [showOperatorMenu, setShowOperatorMenu] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginTargetOperator, setLoginTargetOperator] = useState(null);
  const [operatorsList, setOperatorsList] = useState([]);
  const operatorRef = useRef(null);

  // Subscribe to live settings changes
  useEffect(() => {
    const unsub = subscribeSettings((updated) => {
      setSettings(updated);
    });
    return unsub;
  }, []);

  // Subscribe to live operator state changes
  useEffect(() => {
    const unsub = subscribeOperator((op) => {
      setCurrentOperator(op);
    });
    return unsub;
  }, []);

  // Load operators list when menu opens
  useEffect(() => {
    if (showOperatorMenu) {
      fetchOperatorsList().then((list) => {
        if (list && list.length > 0) setOperatorsList(list);
      });
    }
  }, [showOperatorMenu]);

  // Outside click listener to dismiss dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchResults(null);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (operatorRef.current && !operatorRef.current.contains(e.target)) {
        setShowOperatorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Time and Date clock with timeZone support
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const tz = settings.timeZone || 'Asia/Kolkata';
      try {
        setCurrentTime(now.toLocaleTimeString('en-GB', { hour12: false, timeZone: tz }));
        setCurrentDate(now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }));
      } catch (e) {
        setCurrentTime(now.toLocaleTimeString('en-GB', { hour12: false }));
        setCurrentDate(now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [settings.timeZone]);

  // Quick theme toggle
  const handleQuickThemeToggle = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    updateTheme(nextTheme);
  };

  const updateTheme = (newTheme) => {
    saveStoredSettings({ theme: newTheme });
    applyThemeToDOM(newTheme);
  };

  // Live search handler
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
        }
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header className="header">
      {/* Zone 1 (LEFT): Official IBVAP Branding */}
      <div className="header-left">
        <img
          src="/assets/emblem.png"
          alt="Government Emblem"
          className="header-emblem"
        />
        <div className="header-branding">
          <div className="header-title-row">
            <span className="header-title">IBVAP</span>
            <span className="header-platform-text">
              {settings.systemName || t('systemTitle')}
            </span>
          </div>
          <div className="header-tagline">
            {t('tagline')}
          </div>
        </div>
      </div>

      {/* Zone 2 (CENTER): Global Search Box */}
      <div className="header-center header-search-center" ref={searchRef}>
        <div className="header-search-bar">
          <Search size={13} className="search-bar-icon" />
          <input
            type="text"
            className="search-bar-input"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Global Search Results Dropdown */}
        {searchResults && (
          <div className="header-search-dropdown">
            {searchResults.cameras?.length > 0 && (
              <div className="search-result-group">
                <span className="search-group-title"><Camera size={11} /> Camera Stations</span>
                {searchResults.cameras.map(c => (
                  <div
                    key={c.id}
                    className="search-result-item"
                    onClick={() => {
                      if (onSelectCamera) onSelectCamera(c.id);
                      if (onNavigateToTab) onNavigateToTab('live-monitor');
                      setSearchQuery('');
                    }}
                  >
                    <b>{c.id}</b> — {c.name} ({c.sector})
                  </div>
                ))}
              </div>
            )}

            {searchResults.videos?.length > 0 && (
              <div className="search-result-group">
                <span className="search-group-title"><Film size={11} /> Video Assets</span>
                {searchResults.videos.map(v => (
                  <div
                    key={v.id}
                    className="search-result-item"
                    onClick={() => {
                      if (onSelectVideo) onSelectVideo(v.filename);
                      if (onNavigateToTab) onNavigateToTab('live-monitor');
                      setSearchQuery('');
                    }}
                  >
                    <b>{v.filename}</b> ({v.duration}s)
                  </div>
                ))}
              </div>
            )}

            {searchResults.events?.length > 0 && (
              <div className="search-result-group">
                <span className="search-group-title"><AlertTriangle size={11} /> Security Events</span>
                {searchResults.events.map(e => (
                  <div
                    key={e.id}
                    className="search-result-item"
                    onClick={() => {
                      if (onSelectAlert) onSelectAlert(e);
                      if (onNavigateToTab) onNavigateToTab('events-alerts');
                      setSearchQuery('');
                    }}
                  >
                    #{e.id} {e.event_type} — {e.camera_id} ({e.time})
                  </div>
                ))}
              </div>
            )}

            {searchResults.plates?.length > 0 && (
              <div className="search-result-group">
                <span className="search-group-title"><Car size={11} /> Detected Vehicle Plates</span>
                {searchResults.plates.map(p => (
                  <div
                    key={p.id}
                    className="search-result-item"
                    onClick={() => {
                      if (onNavigateToTab) onNavigateToTab('vehicle-anpr');
                      setSearchQuery('');
                    }}
                  >
                    <b>{p.plate_number}</b> — {p.vehicle_type} ({p.camera_id})
                  </div>
                ))}
              </div>
            )}

            {(!searchResults.cameras?.length && !searchResults.videos?.length && !searchResults.events?.length && !searchResults.plates?.length) && (
              <div className="search-no-results">No matches found for "{searchQuery}"</div>
            )}
          </div>
        )}
      </div>

      {/* Zone 3 (RIGHT): Operational Status & Controls */}
      <div className="header-right">
        {/* Quick Report Export Action */}
        <button
          className="header-export-btn"
          title="Export Operational Surveillance Report"
          onClick={() => onOpenReportModal && onOpenReportModal()}
        >
          <Download size={13} />
          <span>{t('exportReport')}</span>
        </button>

        {/* Operational Interactive Language Selector */}
        <div className="header-lang-select-wrap">
          <Globe size={13} style={{ flexShrink: 0 }} />
          <select
            className="header-lang-select"
            value={settings.language || 'en'}
            onChange={(e) => {
              const newLang = e.target.value;
              saveStoredSettings({ ...settings, language: newLang });
            }}
            title="Change Application Operational Language"
          >
            <option value="en">EN (English)</option>
            <option value="hi">HI (हिन्दी)</option>
            <option value="pa">PA (ਪੰਜਾਬੀ)</option>
            <option value="bn">BN (বাংলা)</option>
          </select>
        </div>

        {/* 1-Click Dark Mode / Theme Switcher */}
        <button
          className="header-theme-toggle-btn"
          title={`Active theme: ${settings.theme || 'dark'}. Click to toggle.`}
          onClick={handleQuickThemeToggle}
        >
          {settings.theme === 'light' ? (
            <Sun size={15} color="#f59e0b" />
          ) : (
            <Moon size={15} color="#60a5fa" />
          )}
        </button>

        {/* Date & Time Clock */}
        <div className="header-clock">
          <span>{currentDate}</span>
          <span className="header-clock-divider">|</span>
          <span>{currentTime}</span>
        </div>

        {/* Real Live Backend vs Offline Status Pill */}
        <div
          className={`status-pill ${isSystemOnline ? 'online' : 'offline'}`}
          title={isSystemOnline ? 'Connected to FastAPI Backend & YOLOv8 Engine' : 'Backend Standby / Offline'}
        >
          <span className={`status-dot ${isSystemOnline ? 'dot-online' : 'dot-offline'}`}></span>
          <span className="status-text">
            {isSystemOnline ? t('systemOnline') : t('systemOffline')}
          </span>
        </div>

        {/* Notification Bell with Dynamic Unseen Alerts Badge */}
        <div className="notification-bell-container" ref={notificationRef}>
          <button
            className="header-bell-btn"
            title="Operational Alerts"
            onClick={handleBellClick}
            aria-label="Alerts"
          >
            <Bell size={15} />
            {effectiveBadgeCount > 0 && (
              <span className="bell-badge">{effectiveBadgeCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700 }}>{t('unverifiedAlerts')}</span>
                  {effectiveBadgeCount > 0 ? (
                    <span className="notifications-count-tag">{effectiveBadgeCount}</span>
                  ) : (
                    <span className="notifications-seen-tag">All seen</span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-mark-all-read"
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAlertsSeen();
                  }}
                  title="Mark all alerts as seen"
                >
                  Mark read
                </button>
              </div>

              <div className="notifications-list">
                {recentAlerts && recentAlerts.length > 0 ? (
                  recentAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="notification-item"
                      onClick={() => {
                        if (onSelectAlert) onSelectAlert(alert);
                        setShowNotifications(false);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="notification-item-top">
                        <span className={`notification-severity ${alert.severity?.toLowerCase()}`}>
                          ● {alert.event || 'Boundary Breach'}
                        </span>
                        <span className="notification-time">{alert.time}</span>
                      </div>
                      <div className="notification-item-sub">
                        <span>{alert.camera}</span>
                        <span>{alert.object}</span>
                      </div>
                      {!alert.verified && onVerifyAlert && (
                        <button
                          className="btn-quick-verify"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVerifyAlert(alert.id);
                          }}
                        >
                          <CheckCircle size={10} /> Mark Verified
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="notifications-empty">
                    ✓ {t('noAlerts')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Professional Executive Operator Profile Console */}
        <div className="operator-profile-container" ref={operatorRef}>
          <div
            className={`operator-profile-exec ${showOperatorMenu ? 'active' : ''}`}
            onClick={() => setShowOperatorMenu(!showOperatorMenu)}
            title="Border Surveillance Duty Officer • Session & Identity"
          >
            <div className="operator-avatar-initials">
              {(() => {
                const name = currentOperator.full_name || currentOperator.username || 'DO';
                const parts = name.trim().split(/\s+/);
                return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
              })()}
              <span className="exec-online-badge" />
            </div>
            <div className="exec-info-col">
              <div className="exec-officer-name">{currentOperator.full_name || currentOperator.username || 'Duty Officer'}</div>
              <div className="exec-officer-role">
                {currentOperator.role || 'Tactical Operator'} • {currentOperator.callsign || 'EAGLE-01'}
              </div>
            </div>
            <ChevronDown size={13} color="#94a3b8" className={`operator-chevron ${showOperatorMenu ? 'rotate-180' : ''}`} />
          </div>

          {/* Executive Personnel Dropdown Menu */}
          {showOperatorMenu && (
            <div className="exec-dropdown-card">
              {/* Active Officer Identity Header */}
              <div className="exec-card-header">
                <div className="exec-avatar-large">
                  {(() => {
                    const name = currentOperator.full_name || currentOperator.username || 'DO';
                    const parts = name.trim().split(/\s+/);
                    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
                  })()}
                </div>
                <div className="exec-details-grid">
                  <div className="exec-title-name">{currentOperator.full_name || 'Duty Officer'}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="exec-badge-pill">{currentOperator.role || 'Tactical Operator'}</span>
                    <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>{currentOperator.callsign}</span>
                  </div>
                  <div className="exec-location-row">
                    <span>📍 {currentOperator.bop_sector || 'Western Border Command'}</span>
                    <span>•</span>
                    <span>Badge: {currentOperator.badge_number || `@${currentOperator.username}`}</span>
                  </div>
                </div>
              </div>

              {/* Executive Action Buttons */}
              <div className="op-dropdown-actions">
                <button
                  type="button"
                  className="btn-dropdown-create-account"
                  onClick={() => {
                    setShowOperatorMenu(false);
                    setIsCreateModalOpen(true);
                  }}
                >
                  <UserPlus size={14} />
                  <span>+ Enrol New Officer</span>
                </button>

                <button
                  type="button"
                  className="btn-dropdown-lock-terminal"
                  onClick={() => {
                    setShowOperatorMenu(false);
                    setWorkstationLock(true);
                  }}
                  title="Lock workstation and require password to re-enter"
                >
                  <Lock size={13} />
                  <span>Lock Workstation Terminal</span>
                </button>

                {operatorsList.length > 1 && (
                  <button
                    type="button"
                    className="btn-dropdown-delete-account"
                    title="Permanently delete your operator account (irreversible)"
                    onClick={async () => {
                      setShowOperatorMenu(false);
                      if (!window.confirm(`⚠️ CONFIRM ACCOUNT DELETION\n\nYou are about to permanently delete your own operator account:\n\n  Name: ${currentOperator.full_name}\n  Username: @${currentOperator.username}\n  Badge: ${currentOperator.badge_number}\n\nThis action is IRREVERSIBLE. You will be logged out immediately.\n\nProceed?`)) return;
                      try {
                        await deleteOperatorAccount(currentOperator.id);
                        localStorage.removeItem('ibvap_current_operator');
                        window.location.reload();
                      } catch (err) {
                        alert(err.message || 'Failed to delete account.');
                      }
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete My Account</span>
                  </button>
                )}
              </div>

              {/* Authorized Personnel Roster */}
              <div className="op-roster-section">
                <div className="op-roster-title">
                  <span>Authorized Personnel Roster</span>
                  <span className="op-roster-count">{operatorsList.length} Active</span>
                </div>
                <div className="op-roster-list">
                  {operatorsList.map((op) => {
                    const isCurrent = op.username === currentOperator.username;
                    const opInitials = (() => {
                      const name = op.full_name || op.username || 'OP';
                      const parts = name.trim().split(/\s+/);
                      return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
                    })();
                    return (
                      <div
                        key={op.id || op.username}
                        className={`op-roster-item ${isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          if (isCurrent) return;
                          setShowOperatorMenu(false);
                          setLoginTargetOperator(op);
                          setIsLoginModalOpen(true);
                        }}
                        title={isCurrent ? 'Currently on active duty' : `Authenticate to switch duty officer to ${op.full_name}`}
                      >
                        <div className="op-item-left">
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: isCurrent ? 'linear-gradient(135deg, #059669, #10b981)' : 'rgba(255,255,255,0.1)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: 700,
                              flexShrink: 0
                            }}
                          >
                            {opInitials}
                          </div>
                          <div className="op-item-text">
                            <span className="op-item-name">{op.full_name}</span>
                            <span className="op-item-details">@{op.username} • {op.role || 'Officer'}</span>
                          </div>
                        </div>
                        {isCurrent ? (
                          <span className="op-current-pill">ON DUTY</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="op-switch-btn">
                              <KeyRound size={11} style={{ marginRight: 3 }} />
                              Switch
                            </span>
                            {operatorsList.length > 1 && (
                              <button
                                type="button"
                                className="op-delete-quick-btn"
                                title={`Delete operator account @${op.username}`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete operator @${op.username}?`)) {
                                    try {
                                      await deleteOperatorAccount(op.id);
                                      const list = await fetchOperatorsList();
                                      if (list) setOperatorsList(list);
                                    } catch (err) {
                                      alert(err.message || 'Failed to delete operator');
                                    }
                                  }
                                }}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#ef4444',
                                  borderRadius: '4px',
                                  padding: '3px 6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dropdown Footer: Full Operator Management Settings */}
              <div className="op-dropdown-footer">
                <button
                  type="button"
                  className="btn-dropdown-manage-all"
                  onClick={() => {
                    setShowOperatorMenu(false);
                    if (onNavigateToTab) onNavigateToTab('settings');
                  }}
                >
                  <span>Personnel Administration & Access Settings</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Global Create Operator Modal */}
        <CreateOperatorModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onOperatorCreated={(newOp) => {
            fetchOperatorsList().then((list) => {
              if (list) setOperatorsList(list);
            });
          }}
        />

        {/* Real-World Password Authentication Modal for User Switching */}
        <OperatorLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          targetOperator={loginTargetOperator}
          onLoginSuccess={(newOp) => {
            setCurrentOperator(newOp);
            fetchOperatorsList().then((list) => {
              if (list) setOperatorsList(list);
            });
          }}
        />

        {/* Indian Borders Stronger Together Badge */}
        <div className="header-patriot-badge">
          <img
            src="/assets/header-soldiers.png"
            alt="Indian Soldiers & Flag"
            className="header-soldiers-img"
          />
          <div className="header-patriot-text">
            <span>INDIAN BORDERS</span>
            <span>STRONGER</span>
            <span>TOGETHER</span>
          </div>
        </div>
      </div>
    </header>
  );
}
