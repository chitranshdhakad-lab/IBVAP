/**
 * IBVAP Centralized Settings Manager
 * Provides reactive persistence in localStorage, backend SQLite synchronization,
 * and global event dispatching for instantaneous cross-application updates.
 */

const STORAGE_KEY = 'ibvap_system_settings';

export const DEFAULT_SETTINGS = {
  // 1. General Settings
  systemName: 'IBVAP - Border Surveillance System',
  timeZone: 'Asia/Kolkata', // (GMT+05:30) India Standard Time
  language: 'en',
  theme: 'light', // 'dark', 'light', 'night-ops', 'high-contrast'

  // 2. Alert Settings
  intrusionAlerts: true,
  animalDetectionAlerts: true,
  vehicleAlerts: true,
  crossBorderMovementAlerts: true,
  virtualFenceEnabled: true,
  weaponAlerts: true,     // From reference project: weapon detection alerts
  soundNotifications: true,
  emailNotifications: false,
  smsNotifications: false,

  // 3. Display Settings
  defaultView: 'live-monitor', // 'live-monitor', 'video-library', 'border-map', 'analytics'
  gridLayout: '2x2', // '1x1', '2x2', '3x3', 'focus'
  showDetectionBoxes: true,
  showConfidenceScore: true,
  showTimestamps: true,
  nightModeEnhancement: false,

  // 4. Camera Settings
  defaultStreamQuality: '1080p', // '1080p', '4k', '720p', '480p'
  autoReconnect: true,
  streamBufferSeconds: 5,
  showCameraStatus: true,

  // 5. AI Model Settings
  detectionSensitivity: 'Medium', // 'Low', 'Medium', 'High', 'Ultra'
  personDetection: true,
  animalDetection: true,
  vehicleDetection: true,
  unknownObjectDetection: true,
  weaponDetection: true,   // From reference project: pistol/rifle/knife detection
  faceDetection: false,    // From reference project: Haar Cascade face detection

  // 6. Data & Storage
  storeDetections: true,
  videoRecording: true,
  retentionPeriod: '30 Days',
  autoDeleteOldData: true,
  exportFormat: 'MP4',

  // 7. ANPR (Automatic Number Plate Recognition) Settings
  anprEnabled: true,
  anprConfidenceThreshold: 0.70,
  anprSavePlateCrops: true,
  anprAutoFlagWatchlist: true,
  anprRegionFormat: 'IND_HSRP'
};


// Sensitivity to confidence mapping calibrated for realistic border CCTV & thermal imagery
export const SENSITIVITY_MAP = {
  Low: 0.15,
  Medium: 0.22,
  High: 0.35,
  Ultra: 0.50
};

export const CONFIDENCE_TO_SENSITIVITY = (conf) => {
  if (conf <= 0.18) return 'Low';
  if (conf <= 0.28) return 'Medium';
  if (conf <= 0.40) return 'High';
  return 'Ultra';
};

import { translate, DICTIONARY } from './i18n.js';
export { translate, DICTIONARY };

export const getTranslation = (lang, key) => {
  return translate(lang, key);
};

// Convert frontend camelCase settings to backend snake_case payload
export const toBackendPayload = (s) => ({
  // AI Model Settings
  yolo_confidence_threshold: SENSITIVITY_MAP[s.detectionSensitivity] || 0.35,
  person_detection: Boolean(s.personDetection),
  animal_detection: Boolean(s.animalDetection),
  vehicle_detection: Boolean(s.vehicleDetection),
  unknown_object_detection: Boolean(s.unknownObjectDetection),
  weapon_detection: Boolean(s.weaponDetection !== undefined ? s.weaponDetection : true),
  face_detection: Boolean(s.faceDetection !== undefined ? s.faceDetection : false),

  // Alert Settings
  intrusion_alerts: Boolean(s.intrusionAlerts),
  restricted_zone_enabled: Boolean(s.intrusionAlerts),
  animal_alerts: Boolean(s.animalDetectionAlerts),
  vehicle_alerts: Boolean(s.vehicleAlerts),
  cross_border_alerts: Boolean(s.crossBorderMovementAlerts),
  border_line_enabled: Boolean(s.crossBorderMovementAlerts),
  virtual_fence_enabled: Boolean(s.virtualFenceEnabled !== undefined ? s.virtualFenceEnabled : true),
  weapon_alerts: Boolean(s.weaponAlerts !== undefined ? s.weaponAlerts : true),
  sound_notifications: Boolean(s.soundNotifications),
  email_notifications: Boolean(s.emailNotifications),
  sms_notifications: Boolean(s.smsNotifications),

  // Display Settings
  show_detection_boxes: Boolean(s.showDetectionBoxes),
  show_confidence_score: Boolean(s.showConfidenceScore),
  show_timestamps: Boolean(s.showTimestamps),
  night_mode_enhancement: Boolean(s.nightModeEnhancement),
  default_view: s.defaultView || 'live-monitor',
  grid_layout: s.gridLayout || '2x2',

  // Camera Settings
  default_stream_quality: s.defaultStreamQuality || '1080p',
  auto_reconnect: Boolean(s.autoReconnect),
  stream_buffer_seconds: parseInt(s.streamBufferSeconds, 10) || 5,
  show_camera_status: Boolean(s.showCameraStatus),

  // Data & Storage Settings
  store_detections: Boolean(s.storeDetections),
  video_recording: Boolean(s.videoRecording),
  retention_period: s.retentionPeriod || '30 Days',
  auto_delete_old_data: Boolean(s.autoDeleteOldData),
  export_format: s.exportFormat || 'MP4',

  // General Settings
  system_name: s.systemName || 'IBVAP - Border Surveillance System',
  time_zone: s.timeZone || 'Asia/Kolkata',
  language: s.language || 'en',
  theme: s.theme || 'light'
});

// Convert backend snake_case settings to frontend camelCase updates
export const fromBackendPayload = (b) => {
  const patch = {};
  if (b.yolo_confidence_threshold !== undefined) patch.detectionSensitivity = CONFIDENCE_TO_SENSITIVITY(b.yolo_confidence_threshold);
  if (b.person_detection !== undefined) patch.personDetection = b.person_detection;
  if (b.animal_detection !== undefined) patch.animalDetection = b.animal_detection;
  if (b.vehicle_detection !== undefined) patch.vehicleDetection = b.vehicle_detection;
  if (b.unknown_object_detection !== undefined) patch.unknownObjectDetection = b.unknown_object_detection;

  if (b.intrusion_alerts !== undefined) patch.intrusionAlerts = b.intrusion_alerts;
  if (b.animal_alerts !== undefined) patch.animalDetectionAlerts = b.animal_alerts;
  if (b.vehicle_alerts !== undefined) patch.vehicleAlerts = b.vehicle_alerts;
  if (b.cross_border_alerts !== undefined) patch.crossBorderMovementAlerts = b.cross_border_alerts;
  if (b.virtual_fence_enabled !== undefined) patch.virtualFenceEnabled = b.virtual_fence_enabled;
  if (b.weapon_alerts !== undefined) patch.weaponAlerts = b.weapon_alerts;
  if (b.weapon_detection !== undefined) patch.weaponDetection = b.weapon_detection;
  if (b.face_detection !== undefined) patch.faceDetection = b.face_detection;
  if (b.sound_notifications !== undefined) patch.soundNotifications = b.sound_notifications;
  if (b.email_notifications !== undefined) patch.emailNotifications = b.email_notifications;
  if (b.sms_notifications !== undefined) patch.smsNotifications = b.sms_notifications;

  if (b.show_detection_boxes !== undefined) patch.showDetectionBoxes = b.show_detection_boxes;
  if (b.show_confidence_score !== undefined) patch.showConfidenceScore = b.show_confidence_score;
  if (b.show_timestamps !== undefined) patch.showTimestamps = b.show_timestamps;
  if (b.night_mode_enhancement !== undefined) patch.nightModeEnhancement = b.night_mode_enhancement;
  if (b.default_view !== undefined) patch.defaultView = b.default_view;
  if (b.grid_layout !== undefined) patch.gridLayout = b.grid_layout;

  if (b.default_stream_quality !== undefined) patch.defaultStreamQuality = b.default_stream_quality;
  if (b.auto_reconnect !== undefined) patch.autoReconnect = b.auto_reconnect;
  if (b.stream_buffer_seconds !== undefined) patch.streamBufferSeconds = b.stream_buffer_seconds;
  if (b.show_camera_status !== undefined) patch.showCameraStatus = b.show_camera_status;

  if (b.store_detections !== undefined) patch.storeDetections = b.store_detections;
  if (b.video_recording !== undefined) patch.videoRecording = b.video_recording;
  if (b.retention_period !== undefined) patch.retentionPeriod = b.retention_period;
  if (b.auto_delete_old_data !== undefined) patch.autoDeleteOldData = b.auto_delete_old_data;
  if (b.export_format !== undefined) patch.exportFormat = b.export_format;

  if (b.system_name !== undefined) patch.systemName = b.system_name;
  if (b.time_zone !== undefined) patch.timeZone = b.time_zone;
  if (b.language !== undefined) patch.language = b.language;
  if (b.theme !== undefined) patch.theme = b.theme;

  return patch;
};

// Listeners set
const listeners = new Set();

export const getStoredSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.warn('Error reading settings from localStorage', e);
    return { ...DEFAULT_SETTINGS };
  }
};

export const saveStoredSettings = async (newSettings) => {
  try {
    const merged = { ...getStoredSettings(), ...newSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

    // Also persist theme to dedicated key for early HTML head loading
    if (merged.theme) {
      localStorage.setItem('ibvap_theme', merged.theme);
      applyThemeToDOM(merged.theme);
    }

    // Dynamic browser tab title
    if (merged.systemName) {
      document.title = `${merged.systemName} | Border Surveillance`;
    }

    // Fully synchronize complete payload with backend SQLite DB & in-memory runtime
    try {
      const payload = toBackendPayload(merged);
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (apiErr) {
      console.warn('Could not sync settings to backend API', apiErr);
    }

    // Notify all active subscribers
    listeners.forEach(fn => {
      try { fn(merged); } catch (err) { console.error('Settings listener error', err); }
    });

    // Dispatch a window CustomEvent for cross-module integration
    window.dispatchEvent(new CustomEvent('ibvap_settings_changed', { detail: merged }));

    return merged;
  } catch (e) {
    console.error('Error saving settings', e);
    return getStoredSettings();
  }
};

export const initSettingsFromServer = async () => {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      const mapped = fromBackendPayload(data);
      const current = getStoredSettings();
      const merged = { ...current, ...mapped };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      if (merged.theme) {
        applyThemeToDOM(merged.theme);
      }
      if (merged.systemName) {
        document.title = `${merged.systemName} | Border Surveillance`;
      }
      listeners.forEach(fn => {
        try { fn(merged); } catch (e) {}
      });
      return merged;
    }
  } catch (e) {
    console.warn('Could not load initial settings from server:', e);
  }
  return getStoredSettings();
};

export const subscribeSettings = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const applyThemeToDOM = (themeName) => {
  const theme = themeName || 'light';
  let cssTheme = 'tactical-dark';
  let genericTheme = 'dark';

  if (theme === 'light' || theme === 'tactical-light') {
    cssTheme = 'tactical-light';
    genericTheme = 'light';
  } else if (theme === 'night-ops') {
    cssTheme = 'night-ops';
    genericTheme = 'night-ops';
  } else if (theme === 'high-contrast') {
    cssTheme = 'high-contrast';
    genericTheme = 'high-contrast';
  } else {
    cssTheme = 'tactical-dark';
    genericTheme = 'dark';
  }

  document.documentElement.setAttribute('data-theme', cssTheme);
  document.documentElement.setAttribute('data-mode', genericTheme);
  document.documentElement.className = `theme-${cssTheme} theme-${genericTheme}`;

  if (document.body) {
    document.body.setAttribute('data-theme', cssTheme);
    document.body.setAttribute('data-mode', genericTheme);
    document.body.className = `theme-${cssTheme} theme-${genericTheme}`;
  }

  try {
    localStorage.setItem('ibvap_theme', cssTheme);
  } catch (e) {}
};
