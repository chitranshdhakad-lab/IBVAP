import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Bell, Monitor, Video, Cpu, Database,
  Save, CheckCircle, AlertTriangle, BookOpen, RotateCcw, Volume2,
  Trash2, ShieldCheck, RefreshCw, FileText, Mail, MessageSquare,
  Clock, Globe, Eye, EyeOff, Radio, Car, ShieldAlert
} from 'lucide-react';
import {
  getStoredSettings,
  saveStoredSettings,
  subscribeSettings,
  applyThemeToDOM,
  SENSITIVITY_MAP
} from '../../services/settingsManager.js';
import { useTranslation } from '../../services/i18n.js';
import HelpManualTab from './HelpManualTab.jsx';
import OperatorsTab from './OperatorsTab.jsx';
import { Users, User } from 'lucide-react';

/**
 * Sleek Toggle Switch matching the user's reference mockup
 */
const ToggleSwitch = ({ checked, onChange, disabled = false, id }) => (
  <label
    htmlFor={id}
    className={`ibvap-switch ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
    onClick={(e) => {
      e.preventDefault();
      if (!disabled) onChange(!checked);
    }}
  >
    <div className="ibvap-switch-handle" />
  </label>
);

export default function SettingsPage({ cameras = [] }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'help', 'maintenance'
  const [settings, setSettings] = useState(getStoredSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [soundTested, setSoundTested] = useState(false);

  // Danger zone reset state
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetMsg, setResetMsg] = useState(null);
  const [isResetting, setIsResetting] = useState(false);

  const handlePurgeStorage = async () => {
    if (!window.confirm('Purge local detection cache, session tracks, and telemetry storage?')) return;
    try {
      localStorage.removeItem('ibvap_events_cache');
      localStorage.removeItem('ibvap_stream_cache');
      localStorage.removeItem('ibvap_event_cache');
      localStorage.removeItem('ibvap_telemetry_cache');
      await fetch('/api/settings/purge-storage', { method: 'POST' }).catch(() => {});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      alert('Local storage and telemetry cache purged successfully.');
    } catch (err) {
      alert('Storage cache purged.');
    }
  };

  // Sync settings when modified externally
  useEffect(() => {
    const unsub = subscribeSettings((updated) => {
      setSettings(updated);
    });
    return unsub;
  }, []);

  // Generic field updater with immediate reactive save
  const updateField = (field, value, autoSave = true) => {
    const updated = {
      ...settings,
      [field]: value
    };
    setSettings(updated);

    // If theme changes, immediately apply to DOM for instant visual feedback
    if (field === 'theme') {
      applyThemeToDOM(value);
    }

    if (autoSave) {
      saveStoredSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  // Save all settings handler
  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveStoredSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Play test alert sound via Web Audio API synth
  const playTestAlertSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setSoundTested(true);
      setTimeout(() => setSoundTested(false), 2000);
    } catch (e) {
      console.warn('Web Audio error:', e);
    }
  };

  // Reset settings to defaults
  const handleResetSettings = async () => {
    if (!window.confirm('Restore all system settings to default factory values?')) return;
    try {
      const res = await fetch('/api/admin/reset-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      if (res.ok) {
        localStorage.removeItem('ibvap_system_settings');
        localStorage.removeItem('ibvap_theme');
        applyThemeToDOM('dark');
        const def = getStoredSettings();
        setSettings(def);
        setResetMsg({ type: 'success', text: 'All settings restored to factory defaults.' });
      }
    } catch (e) {
      setResetMsg({ type: 'error', text: e.message });
    }
  };

  // Purge all operational data
  const handlePurgeData = async () => {
    if (resetConfirmText !== 'RESET IBVAP') {
      alert('You must type exactly "RESET IBVAP" to confirm.');
      return;
    }
    setIsResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'RESET IBVAP',
          delete_cameras: false,
          delete_videos: false
        })
      });
      if (res.ok) {
        setResetMsg({ type: 'success', text: 'Operational database purged successfully.' });
        setResetConfirmText('');
      } else {
        const err = await res.json();
        setResetMsg({ type: 'error', text: err.detail || 'Purge failed' });
      }
    } catch (e) {
      setResetMsg({ type: 'error', text: e.message });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="settings-screen-wrapper">
      {/* Top Header matching reference design */}
      <div className="settings-top-header">
        <div className="settings-header-left">
          <div className="settings-icon-title-wrap">
            <div className="settings-header-icon-box">
              <SettingsIcon size={24} color="#f8fafc" />
            </div>
            <div>
              <h1 className="settings-main-title">{t('settings')}</h1>
              <p className="settings-subtitle">
                {t('generalSubtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Action Button: Save Changes */}
        <div className="settings-header-right">
          {saveSuccess && (
            <span className="save-success-tag">
              <CheckCircle size={14} /> {t('changesSaved')}
            </span>
          )}
          <button
            className="btn-save-changes"
            onClick={handleSaveChanges}
            disabled={isSaving}
          >
            <Save size={16} />
            <span>{isSaving ? t('savingChanges') : t('saveChanges')}</span>
          </button>
        </div>
      </div>

      {/* Subtab Navigation for Settings vs Help Manual vs Maintenance */}
      <div className="settings-nav-tabs">
        <button
          className={`settings-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <SettingsIcon size={14} /> {t('overviewTab')}
        </button>
        <button
          className={`settings-nav-tab ${activeTab === 'help' ? 'active' : ''}`}
          onClick={() => setActiveTab('help')}
        >
          <BookOpen size={14} /> {t('helpTab')}
        </button>
        <button
          className={`settings-nav-tab ${activeTab === 'maintenance' ? 'active' : ''}`}
          onClick={() => setActiveTab('maintenance')}
        >
          <RotateCcw size={14} /> {t('maintenanceTab')}
        </button>
        <button
          className={`settings-nav-tab ${activeTab === 'operators' ? 'active' : ''}`}
          onClick={() => setActiveTab('operators')}
        >
          <Users size={14} /> Operator Accounts
        </button>
      </div>

      {/* TAB 1: 6-CARD GRID SYSTEM (MATCHING USER SCREENSHOT EXACTLY) */}
      {activeTab === 'overview' && (
        <div className="settings-cards-grid">
          {/* CARD 1: GENERAL SETTINGS */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <SettingsIcon size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('generalSettings')}</h3>
                <span className="card-panel-subtitle">{t('generalSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body vertical-stack">
              <div className="field-block">
                <label className="field-label">{t('systemName')}</label>
                <input
                  type="text"
                  className="field-input-text"
                  value={settings.systemName}
                  onChange={(e) => updateField('systemName', e.target.value, false)}
                  onBlur={() => saveStoredSettings(settings)}
                  placeholder="IBVAP - Border Surveillance System"
                />
              </div>

              <div className="field-block">
                <label className="field-label">{t('timeZone')}</label>
                <select
                  className="field-select"
                  value={settings.timeZone}
                  onChange={(e) => updateField('timeZone', e.target.value)}
                >
                  <option value="Asia/Kolkata">(GMT+05:30) India Standard Time (IST)</option>
                  <option value="UTC">(GMT+00:00) UTC Universal Time</option>
                  <option value="America/New_York">(GMT-05:00) Eastern Time (US)</option>
                  <option value="Europe/London">(GMT+00:00) London / GMT</option>
                </select>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} />
                  <span>Current: {new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: settings.timeZone || 'Asia/Kolkata' })}</span>
                </div>
              </div>

              <div className="field-block">
                <label className="field-label">{t('language')}</label>
                <select
                  className="field-select"
                  value={settings.language}
                  onChange={(e) => updateField('language', e.target.value)}
                >
                  <option value="en">English (Official Default)</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                  <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                  <option value="bn">Bengali (বাংলা)</option>
                </select>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Globe size={11} />
                  <span>{settings.language === 'hi' ? 'सक्रिय भाषा: हिन्दी' : settings.language === 'pa' ? 'ਸਰਗਰਮ ਭਾਸ਼ਾ: ਪੰਜਾਬੀ' : settings.language === 'bn' ? 'সক্রিয় ভাষা: বাংলা' : 'Active Language: English'}</span>
                </div>
              </div>

              <div className="field-block">
                <label className="field-label">{t('theme')}</label>
                <select
                  className="field-select"
                  value={settings.theme}
                  onChange={(e) => updateField('theme', e.target.value)}
                >
                  <option value="dark">Dark (Default Command Console)</option>
                  <option value="light">Light (Daytime Command Console)</option>
                  <option value="night-ops">Night Ops (Tactical Green)</option>
                  <option value="high-contrast">High Contrast (Monochrome)</option>
                </select>
              </div>
            </div>
          </div>

          {/* CARD 2: ALERT SETTINGS */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <Bell size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('alertSettings')}</h3>
                <span className="card-panel-subtitle">{t('alertSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('intrusionAlerts')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.intrusionAlerts ? '#4ade80' : '#94a3b8' }}>
                    {settings.intrusionAlerts ? t('descIntrusionOn') : t('descIntrusionOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.intrusionAlerts}
                  onChange={(val) => updateField('intrusionAlerts', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('animalAlerts')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.animalDetectionAlerts ? '#4ade80' : '#94a3b8' }}>
                    {settings.animalDetectionAlerts ? t('descAnimalOn') : t('descAnimalOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.animalDetectionAlerts}
                  onChange={(val) => updateField('animalDetectionAlerts', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('vehicleAlerts')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.vehicleAlerts ? '#4ade80' : '#94a3b8' }}>
                    {settings.vehicleAlerts ? t('descVehicleOn') : t('descVehicleOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.vehicleAlerts}
                  onChange={(val) => updateField('vehicleAlerts', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('crossBorderAlerts')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.crossBorderMovementAlerts ? '#4ade80' : '#94a3b8' }}>
                    {settings.crossBorderMovementAlerts ? t('descCrossBorderOn') : t('descCrossBorderOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.crossBorderMovementAlerts}
                  onChange={(val) => updateField('crossBorderMovementAlerts', val)}
                />
              </div>

              {/* Weapon Alerts - From Reference Project */}
              <div className="setting-toggle-row" style={{ borderTop: '1px solid rgba(239,68,68,0.2)', paddingTop: '10px', marginTop: '4px' }}>
                <div>
                  <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#f43f5e', fontSize: '13px' }}>⚠</span>
                    {t('weaponAlerts')}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.weaponAlerts ? '#f43f5e' : '#94a3b8' }}>
                    {settings.weaponAlerts ? t('descWeaponAlertsOn') : t('descWeaponAlertsOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.weaponAlerts !== undefined ? settings.weaponAlerts : true}
                  onChange={(val) => updateField('weaponAlerts', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="toggle-label">{t('soundNotifications')}</span>
                    <button
                      type="button"
                      className="btn-inline-sound-test"
                      onClick={playTestAlertSound}
                      title="Test 880Hz alert buzzer"
                    >
                      <Volume2 size={12} /> {soundTested ? 'Beep!' : 'Test'}
                    </button>
                  </div>
                  <span style={{ fontSize: '10.5px', color: settings.soundNotifications ? '#4ade80' : '#94a3b8' }}>
                    {settings.soundNotifications ? t('descSoundOn') : t('descSoundOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.soundNotifications}
                  onChange={(val) => updateField('soundNotifications', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('emailNotifications')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.emailNotifications ? '#4ade80' : '#94a3b8' }}>
                    {settings.emailNotifications ? t('descEmailOn') : t('descEmailOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.emailNotifications}
                  onChange={(val) => updateField('emailNotifications', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('smsNotifications')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.smsNotifications ? '#4ade80' : '#94a3b8' }}>
                    {settings.smsNotifications ? t('descSmsOn') : t('descSmsOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.smsNotifications}
                  onChange={(val) => updateField('smsNotifications', val)}
                />
              </div>
            </div>
          </div>

          {/* CARD 3: DISPLAY SETTINGS */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <Monitor size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('displaySettings')}</h3>
                <span className="card-panel-subtitle">{t('displaySubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('defaultView')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Launch page on system startup</span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.defaultView}
                  onChange={(e) => updateField('defaultView', e.target.value)}
                >
                  <option value="live-monitor">Live Monitoring</option>
                  <option value="video-library">Video Library</option>
                  <option value="border-map">Border Tactical Map</option>
                  <option value="analytics">Analytics &amp; Intelligence</option>
                </select>
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('gridLayout')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Surveillance video screen layout</span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.gridLayout}
                  onChange={(e) => updateField('gridLayout', e.target.value)}
                >
                  <option value="2x2">2 x 2 Tactical Grid</option>
                  <option value="1x1">1 x 1 Single Focus Stream</option>
                  <option value="3x3">3 x 3 Multi-Sector Matrix</option>
                  <option value="focus">Single Focus with Telemetry</option>
                </select>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('showDetectionBoxes')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.showDetectionBoxes ? '#4ade80' : '#94a3b8' }}>
                    {settings.showDetectionBoxes ? t('descBoxesOn') : t('descBoxesOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.showDetectionBoxes}
                  onChange={(val) => updateField('showDetectionBoxes', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('showConfidenceScore')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.showConfidenceScore ? '#4ade80' : '#94a3b8' }}>
                    {settings.showConfidenceScore ? t('descConfOn') : t('descConfOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.showConfidenceScore}
                  onChange={(val) => updateField('showConfidenceScore', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('showTimestamps')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.showTimestamps ? '#4ade80' : '#94a3b8' }}>
                    {settings.showTimestamps ? t('descTimeOn') : t('descTimeOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.showTimestamps}
                  onChange={(val) => updateField('showTimestamps', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('nightModeEnhancement')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.nightModeEnhancement ? '#22c55e' : '#94a3b8' }}>
                    {settings.nightModeEnhancement ? t('descNightOn') : t('descNightOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.nightModeEnhancement}
                  onChange={(val) => updateField('nightModeEnhancement', val)}
                />
              </div>
            </div>
          </div>

          {/* CARD 4: CAMERA SETTINGS */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <Video size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('cameraSettings')}</h3>
                <span className="card-panel-subtitle">{t('cameraSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('defaultStreamQuality')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: '#60a5fa' }}>
                    {settings.defaultStreamQuality === '4k' ? '● 3840 × 2160 Ultra HD (12 Mbps)' : settings.defaultStreamQuality === '720p' ? '● 1280 × 720 Balanced (3 Mbps)' : settings.defaultStreamQuality === '480p' ? '● 854 × 480 Low Bandwidth (1.2 Mbps)' : '● 1920 × 1080 Full HD (6 Mbps)'}
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.defaultStreamQuality}
                  onChange={(e) => updateField('defaultStreamQuality', e.target.value)}
                >
                  <option value="1080p">HD (1080p)</option>
                  <option value="4k">4K Ultra HD</option>
                  <option value="720p">720p Balanced</option>
                  <option value="480p">480p Low Bandwidth</option>
                </select>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('autoReconnect')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.autoReconnect ? '#4ade80' : '#94a3b8' }}>
                    {settings.autoReconnect ? t('descAutoRecOn') : t('descAutoRecOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.autoReconnect}
                  onChange={(val) => updateField('autoReconnect', val)}
                />
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('streamBufferSeconds')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Latency window: ~{settings.streamBufferSeconds || 5}s playback buffer
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="field-input-compact"
                  value={settings.streamBufferSeconds}
                  onChange={(e) => updateField('streamBufferSeconds', parseInt(e.target.value, 10) || 5)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('showCameraStatus')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.showCameraStatus ? '#4ade80' : '#94a3b8' }}>
                    {settings.showCameraStatus ? t('descCamStatusOn') : t('descCamStatusOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.showCameraStatus}
                  onChange={(val) => updateField('showCameraStatus', val)}
                />
              </div>
            </div>
          </div>

          {/* CARD 5: AI MODEL SETTINGS */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <Cpu size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('aiModelSettings')}</h3>
                <span className="card-panel-subtitle">{t('aiSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('detectionSensitivity')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: '#60a5fa' }}>
                    Cutoff: {settings.detectionSensitivity === 'Ultra' ? '≥ 70% (Ultra Precision)' : settings.detectionSensitivity === 'High' ? '≥ 50% (High Precision)' : settings.detectionSensitivity === 'Low' ? '≥ 20% (Max Recall)' : '≥ 35% (Balanced Standard)'}
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.detectionSensitivity}
                  onChange={(e) => updateField('detectionSensitivity', e.target.value)}
                >
                  <option value="Low">Low (0.20)</option>
                  <option value="Medium">Medium (0.35)</option>
                  <option value="High">High (0.50)</option>
                  <option value="Ultra">Ultra (0.70)</option>
                </select>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('personDetection')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.personDetection ? '#4ade80' : '#ef4444' }}>
                    {settings.personDetection ? t('descPersonOn') : t('descPersonOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.personDetection}
                  onChange={(val) => updateField('personDetection', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('animalDetection')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.animalDetection ? '#4ade80' : '#ef4444' }}>
                    {settings.animalDetection ? t('descAnimalDetOn') : t('descAnimalDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.animalDetection}
                  onChange={(val) => updateField('animalDetection', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('vehicleDetection')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.vehicleDetection ? '#4ade80' : '#ef4444' }}>
                    {settings.vehicleDetection ? t('descVehicleDetOn') : t('descVehicleDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.vehicleDetection}
                  onChange={(val) => updateField('vehicleDetection', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('unknownObjectDetection')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.unknownObjectDetection ? '#4ade80' : '#ef4444' }}>
                    {settings.unknownObjectDetection ? t('descUnknownDetOn') : t('descUnknownDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.unknownObjectDetection}
                  onChange={(val) => updateField('unknownObjectDetection', val)}
                />
              </div>

              {/* Weapon Detection - From Reference Project (keshav-077) */}
              <div className="setting-toggle-row" style={{ borderTop: '1px solid rgba(244,63,94,0.25)', paddingTop: '10px', marginTop: '4px' }}>
                <div>
                  <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: 'linear-gradient(135deg, #f43f5e, #dc143c)', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', color: 'white', fontWeight: 700 }}>NEW</span>
                    {t('weaponDetection')}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: (settings.weaponDetection !== undefined ? settings.weaponDetection : true) ? '#f43f5e' : '#94a3b8' }}>
                    {(settings.weaponDetection !== undefined ? settings.weaponDetection : true)
                      ? t('descWeaponDetOn')
                      : t('descWeaponDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.weaponDetection !== undefined ? settings.weaponDetection : true}
                  onChange={(val) => updateField('weaponDetection', val)}
                />
              </div>

              {/* Face Detection - Haar Cascade from Reference Project */}
              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', color: 'white', fontWeight: 700 }}>NEW</span>
                    {t('faceDetection')}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.faceDetection ? '#22d3ee' : '#94a3b8' }}>
                    {settings.faceDetection
                      ? t('descFaceDetOn')
                      : t('descFaceDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.faceDetection !== undefined ? settings.faceDetection : false}
                  onChange={(val) => updateField('faceDetection', val)}
                />
              </div>
            </div>
          </div>

          {/* CARD 6: DATA & STORAGE */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap">
                <Database size={18} color="#60a5fa" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('dataStorage')}</h3>
                <span className="card-panel-subtitle">{t('dataSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('storeDetections')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.storeDetections ? '#4ade80' : '#94a3b8' }}>
                    {settings.storeDetections ? t('descStoreDetOn') : t('descStoreDetOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.storeDetections}
                  onChange={(val) => updateField('storeDetections', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('videoRecording')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.videoRecording ? '#4ade80' : '#94a3b8' }}>
                    {settings.videoRecording ? t('descRecordingOn') : t('descRecordingOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.videoRecording}
                  onChange={(val) => updateField('videoRecording', val)}
                />
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('retentionPeriod')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: '#60a5fa' }}>
                    Footprint: {settings.retentionPeriod === '7 Days' ? '~14.2 GB of 500 GB (3%)' : settings.retentionPeriod === '15 Days' ? '~28.4 GB of 500 GB (6%)' : settings.retentionPeriod === '60 Days' ? '~118 GB of 500 GB (24%)' : settings.retentionPeriod === '90 Days' ? '~176 GB of 500 GB (35%)' : settings.retentionPeriod === 'Permanent' ? 'Uncapped storage archive' : '~58.6 GB of 500 GB (12%)'}
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.retentionPeriod}
                  onChange={(e) => updateField('retentionPeriod', e.target.value)}
                >
                  <option value="7 Days">7 Days</option>
                  <option value="15 Days">15 Days</option>
                  <option value="30 Days">30 Days</option>
                  <option value="60 Days">60 Days</option>
                  <option value="90 Days">90 Days</option>
                  <option value="Permanent">Permanent</option>
                </select>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('autoDeleteOldData')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.autoDeleteOldData ? '#4ade80' : '#94a3b8' }}>
                    {settings.autoDeleteOldData ? t('descAutoDeleteOn') : t('descAutoDeleteOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.autoDeleteOldData}
                  onChange={(val) => updateField('autoDeleteOldData', val)}
                />
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('exportFormat')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Default format for reports and exports
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.exportFormat}
                  onChange={(e) => updateField('exportFormat', e.target.value)}
                >
                  <option value="MP4">MP4</option>
                  <option value="AVI">AVI</option>
                  <option value="MKV">MKV</option>
                  <option value="PDF">PDF Report</option>
                  <option value="CSV">CSV / JSON</option>
                </select>
              </div>

              {/* Disk Maintenance & Cache Purge Button */}
              <div className="setting-control-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                <div>
                  <span className="toggle-label" style={{ color: '#f87171' }}>Storage Maintenance</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Clear local event cache and prune telemetry
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePurgeStorage}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Purge cached detection and stream records"
                >
                  {t('purgeStorage')}
                </button>
              </div>
            </div>
          </div>

          {/* CARD 7: AUTOMATIC NUMBER PLATE RECOGNITION (ANPR) */}
          <div className="settings-card-panel">
            <div className="card-panel-header">
              <div className="card-header-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.3))' }}>
                <Car size={18} color="#38bdf8" />
              </div>
              <div>
                <h3 className="card-panel-title">{t('anprSettings')}</h3>
                <span className="card-panel-subtitle">{t('anprSubtitle')}</span>
              </div>
            </div>

            <div className="card-panel-body row-stack">
              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', color: 'white', fontWeight: 700 }}>TACTICAL</span>
                    {t('anprEnabled')}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.anprEnabled ? '#38bdf8' : '#94a3b8' }}>
                    {settings.anprEnabled ? t('descAnprOn') : t('descAnprOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.anprEnabled !== undefined ? settings.anprEnabled : true}
                  onChange={(val) => updateField('anprEnabled', val)}
                />
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('anprConfidence')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: '#38bdf8' }}>
                    OCR Cutoff: ≥ {Math.round((settings.anprConfidenceThreshold ?? 0.70) * 100)}% Match Precision
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.anprConfidenceThreshold ?? 0.70}
                  onChange={(e) => updateField('anprConfidenceThreshold', parseFloat(e.target.value))}
                >
                  <option value={0.50}>50% - Broad (High Recall)</option>
                  <option value={0.60}>60% - Moderate</option>
                  <option value={0.70}>70% - Balanced (Recommended)</option>
                  <option value={0.80}>80% - High Precision</option>
                  <option value={0.90}>90% - Strict Exact Match</option>
                </select>
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label">{t('anprSaveCrops')}</span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.anprSavePlateCrops ? '#4ade80' : '#94a3b8' }}>
                    {settings.anprSavePlateCrops ? t('descSaveCropsOn') : t('descSaveCropsOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.anprSavePlateCrops !== undefined ? settings.anprSavePlateCrops : true}
                  onChange={(val) => updateField('anprSavePlateCrops', val)}
                />
              </div>

              <div className="setting-toggle-row">
                <div>
                  <span className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldAlert size={13} color="#f59e0b" />
                    {t('anprWatchlistAlerts')}
                  </span>
                  <span style={{ display: 'block', fontSize: '10.5px', color: settings.anprAutoFlagWatchlist ? '#f59e0b' : '#94a3b8' }}>
                    {settings.anprAutoFlagWatchlist ? t('descWatchlistAlertsOn') : t('descWatchlistAlertsOff')}
                  </span>
                </div>
                <ToggleSwitch
                  checked={settings.anprAutoFlagWatchlist !== undefined ? settings.anprAutoFlagWatchlist : true}
                  onChange={(val) => updateField('anprAutoFlagWatchlist', val)}
                />
              </div>

              <div className="setting-control-row">
                <div>
                  <span className="toggle-label">{t('anprPlateFormat')}</span>
                  <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    Plate layout &amp; region syntax filter
                  </span>
                </div>
                <select
                  className="field-select-compact"
                  value={settings.anprRegionFormat || 'IND_HSRP'}
                  onChange={(e) => updateField('anprRegionFormat', e.target.value)}
                >
                  <option value="IND_HSRP">Indian HSRP (DL, JK, PB, HR...)</option>
                  <option value="INTERNATIONAL">International Alpha-Numeric</option>
                </select>
              </div>

              {/* ANPR Engine Telemetry Badge */}
              <div style={{
                marginTop: '6px',
                padding: '8px 10px',
                borderRadius: '6px',
                background: 'rgba(14, 165, 233, 0.08)',
                border: '1px solid rgba(14, 165, 233, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                fontFamily: 'monospace'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>ENGINE: EASYOCR + MORPH-ROI</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>READY // CUDA/CPU</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FIELD MANUAL (HELP) */}
      {activeTab === 'help' && (
        <HelpManualTab />
      )}

      {/* TAB 3: SYSTEM MAINTENANCE (DANGER ZONE) */}
      {activeTab === 'maintenance' && (
        <div className="settings-maintenance-panel">
          <div className="maintenance-header">
            <AlertTriangle size={22} color="#ef4444" />
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#f87171' }}>System Maintenance &amp; Administrative Controls</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Restore configurations, reset neural detection jobs, or purge surveillance logs with administrative authorization.
              </p>
            </div>
          </div>

          {resetMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '16px',
              background: resetMsg.type === 'success' ? 'rgba(20,83,45,0.6)' : 'rgba(127,29,29,0.6)',
              border: `1px solid ${resetMsg.type === 'success' ? '#16a34a' : '#ef4444'}`,
              color: resetMsg.type === 'success' ? '#4ade80' : '#f87171',
              fontSize: '12px'
            }}>
              {resetMsg.text}
            </div>
          )}

          <div className="maintenance-action-card">
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-heading)' }}>Restore Settings to Factory Defaults</h4>
              <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Resets YOLO confidence thresholds, debounce timings, and display options to defense baseline. Retains surveillance video assets and incident history.
              </p>
            </div>
            <button className="btn-secondary" onClick={handleResetSettings}>
              <RotateCcw size={13} style={{ marginRight: 6 }} /> Reset Settings
            </button>
          </div>

          <div className="maintenance-action-card" style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '13px', color: '#ef4444' }}>Purge All Operational Telemetry</h4>
              <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Permanently deletes tracking logs, detected entities, and event history. Camera hardware connections are preserved.
              </p>
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Type <b>RESET IBVAP</b> to confirm:</span>
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="RESET IBVAP"
                  style={{
                    padding: '4px 8px',
                    background: 'var(--bg-card-alt)',
                    border: '1px solid var(--color-red)',
                    color: 'var(--text-primary)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    width: '140px'
                  }}
                />
              </div>
            </div>
            <button
              className="btn-danger"
              disabled={resetConfirmText !== 'RESET IBVAP' || isResetting}
              onClick={handlePurgeData}
            >
              <Trash2 size={13} style={{ marginRight: 6 }} />
              {isResetting ? 'Purging...' : 'Purge All Data'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: OPERATOR ACCOUNTS & BORDER ACCESS CONTROL */}
      {activeTab === 'operators' && (
        <OperatorsTab />
      )}
    </div>
  );
}
