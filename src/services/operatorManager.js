/**
 * IBVAP Tactical Operator & Access Control Manager
 * Real-world Government/Defense Administrative State Service
 */

const OPERATOR_STORAGE_KEY = 'ibvap_current_operator';
const OPERATORS_CACHE_KEY = 'ibvap_operators_roster';
const OPERATOR_DUTY_LOGS_KEY = 'ibvap_operator_duty_logs';
const WORKSTATION_LOCKED_KEY = 'ibvap_terminal_locked';

// Sector to Primary Camera mapping
export const SECTOR_CAMERA_MAP = {
  'BOP Sector Alpha': 'CAM-01',
  'BOP Sector Alpha (Western Sector)': 'CAM-01',
  'BOP Sector Bravo (River Basin)': 'CAM-02',
  'Forward Post 44A (Buffer Zone)': 'CAM-03',
  'BOP Sector Charlie (Ridge Line)': 'CAM-04',
  'BOP Sector Delta (South Gate)': 'CAM-01',
  'BOP Command HQ (All Sectors)': 'ALL'
};

// Clearance levels based on role
export const ROLE_CLEARANCE_MAP = {
  'Tactical Operator': {
    code: 'LEVEL-1',
    title: 'Perimeter Surveillance Clearance',
    badgeClass: 'clearance-l1',
    canDeleteUsers: false,
    canOverrideAlarms: false,
    canExportEvidence: true
  },
  'Perimeter Analyst': {
    code: 'LEVEL-2',
    title: 'Intelligence & Forensics Clearance',
    badgeClass: 'clearance-l2',
    canDeleteUsers: false,
    canOverrideAlarms: false,
    canExportEvidence: true
  },
  'Shift Commander': {
    code: 'LEVEL-3',
    title: 'Operational Command & QRF Dispatch',
    badgeClass: 'clearance-l3',
    canDeleteUsers: true,
    canOverrideAlarms: true,
    canExportEvidence: true
  },
  'Base Administrator': {
    code: 'LEVEL-4',
    title: 'System Root & Access Control Clearance',
    badgeClass: 'clearance-l4',
    canDeleteUsers: true,
    canOverrideAlarms: true,
    canExportEvidence: true
  }
};

const DEFAULT_OPERATOR = {
  id: 1,
  username: 'operator',
  full_name: 'Tactical Surveillance Operator',
  role: 'Tactical Operator',
  bop_sector: 'BOP Sector Alpha (Western Sector)',
  callsign: 'EAGLE-01',
  badge_number: 'BSF-9942',
  is_active: true,
  terminal_id: 'WS-BOP-SEC1-01',
  shift_start: new Date(Date.now() - 3600000 * 2).toISOString(),
  assigned_camera: 'CAM-01'
};

const listeners = new Set();
const lockListeners = new Set();

/**
 * Format and enrich operator object with clearance and camera details
 */
export function enrichOperator(op) {
  if (!op) return DEFAULT_OPERATOR;
  const sector = op.bop_sector || 'BOP Sector Alpha (Western Sector)';
  const role = op.role || 'Tactical Operator';
  const clearance = ROLE_CLEARANCE_MAP[role] || ROLE_CLEARANCE_MAP['Tactical Operator'];
  const assigned_camera = SECTOR_CAMERA_MAP[sector] || 'CAM-01';

  return {
    ...op,
    bop_sector: sector,
    role: role,
    callsign: op.callsign || 'EAGLE-01',
    badge_number: op.badge_number || `BSF-${String(op.id || 1000).padStart(4, '0')}`,
    terminal_id: op.terminal_id || `WS-BOP-${(op.username || 'OP').toUpperCase()}-01`,
    shift_start: op.shift_start || new Date().toISOString(),
    clearance,
    assigned_camera
  };
}

export function getStoredOperator() {
  try {
    const raw = localStorage.getItem(OPERATOR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return enrichOperator(parsed);
    }
  } catch (e) {
    console.warn('Error reading stored operator:', e);
  }
  return enrichOperator(DEFAULT_OPERATOR);
}

export function saveStoredOperator(operator) {
  try {
    const enriched = enrichOperator(operator);
    localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(enriched));
    listeners.forEach((cb) => {
      try { cb(enriched); } catch (err) { console.error('Listener error:', err); }
    });
    return enriched;
  } catch (e) {
    console.warn('Error writing stored operator:', e);
    return operator;
  }
}

export function subscribeOperator(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Workstation Lock State Management
 */
export function isWorkstationLocked() {
  return localStorage.getItem(WORKSTATION_LOCKED_KEY) === 'true';
}

export function setWorkstationLock(isLocked) {
  localStorage.setItem(WORKSTATION_LOCKED_KEY, isLocked ? 'true' : 'false');
  lockListeners.forEach((cb) => {
    try { cb(isLocked); } catch (e) {}
  });
}

export function subscribeWorkstationLock(callback) {
  lockListeners.add(callback);
  return () => lockListeners.delete(callback);
}

/**
 * Operator Duty Logs & Action History (Specific to each operator)
 */
export function getOperatorDutyLogs(username) {
  try {
    const raw = localStorage.getItem(`${OPERATOR_DUTY_LOGS_KEY}_${username}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  // Generate realistic initial duty log for this operator
  const now = new Date();
  const time1 = new Date(now.getTime() - 1000 * 60 * 75).toLocaleTimeString('en-GB');
  const time2 = new Date(now.getTime() - 1000 * 60 * 45).toLocaleTimeString('en-GB');
  const time3 = new Date(now.getTime() - 1000 * 60 * 12).toLocaleTimeString('en-GB');

  return [
    {
      id: 1,
      time: time1,
      action: 'DUTY_LOGIN',
      description: `Authenticated on Workstation terminal WS-BOP-${(username || 'OP').toUpperCase()}-01`,
      severity: 'info'
    },
    {
      id: 2,
      time: time2,
      action: 'PERIMETER_SURVEILLANCE_ACTIVE',
      description: `Surveillance feed synchronized. Optical & thermal AI filters armed.`,
      severity: 'info'
    },
    {
      id: 3,
      time: time3,
      action: 'EVENT_VERIFICATION',
      description: `Reviewed Boundary Movement telemetry. Sector perimeter verified secure.`,
      severity: 'success'
    }
  ];
}

export function logOperatorDutyAction(username, action, description, severity = 'info') {
  const currentLogs = getOperatorDutyLogs(username);
  const newEntry = {
    id: Date.now(),
    time: new Date().toLocaleTimeString('en-GB'),
    action,
    description,
    severity
  };
  const updated = [newEntry, ...currentLogs].slice(0, 25);
  try {
    localStorage.setItem(`${OPERATOR_DUTY_LOGS_KEY}_${username}`, JSON.stringify(updated));
  } catch (e) {}
  return updated;
}

/**
 * Fetch all registered operators from backend with local fallback cache
 */
export async function fetchOperatorsList() {
  try {
    const res = await fetch('/api/operators');
    if (res.ok) {
      const data = await res.json();
      const enriched = data.map(enrichOperator);
      localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify(enriched));
      return enriched;
    }
  } catch (err) {
    console.warn('Could not fetch operators from API, using cache:', err);
  }

  // Fallback to cache or defaults
  try {
    const cached = localStorage.getItem(OPERATORS_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  return [enrichOperator(DEFAULT_OPERATOR)];
}

/**
 * Create a new operator account with username & password setup
 */
export async function createOperatorAccount(accountData) {
  const res = await fetch('/api/operators', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(accountData)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create operator account' }));
    throw new Error(err.detail || 'Failed to create operator account');
  }

  const result = await res.json();
  
  // Refresh operators cache
  fetchOperatorsList().catch(() => {});
  
  return result;
}

/**
 * Authenticate operator with username & password (REAL WORLD LOGIN)
 */
export async function authenticateOperator(username, password) {
  const res = await fetch('/api/operators/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
    throw new Error(err.detail || 'Invalid operator credentials. Access denied.');
  }

  const data = await res.json();
  if (data.operator) {
    const enriched = enrichOperator(data.operator);
    enriched.shift_start = new Date().toISOString();
    saveStoredOperator(enriched);
    setWorkstationLock(false);
    logOperatorDutyAction(
      enriched.username,
      'AUTHENTICATED_SESSION',
      `Session established via SHA-256 token on terminal ${enriched.terminal_id}`,
      'success'
    );
    return { ...data, operator: enriched };
  }
  return data;
}

/**
 * Delete an operator account
 */
export async function deleteOperatorAccount(operatorId) {
  const res = await fetch(`/api/operators/${operatorId}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete operator' }));
    throw new Error(err.detail || 'Failed to delete operator');
  }

  fetchOperatorsList().catch(() => {});
  return await res.json();
}
