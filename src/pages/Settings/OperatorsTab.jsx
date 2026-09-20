import React, { useState, useEffect } from 'react';
import {
  User, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2,
  AlertTriangle, KeyRound, MapPin, Radio, Award, UserPlus,
  Trash2, RefreshCw, Check, Shield, Users, Clock, Terminal,
  ShieldAlert, Activity, FileText, LockKeyhole
} from 'lucide-react';
import {
  fetchOperatorsList,
  createOperatorAccount,
  deleteOperatorAccount,
  getStoredOperator,
  subscribeOperator,
  getOperatorDutyLogs,
  logOperatorDutyAction,
  setWorkstationLock,
  ROLE_CLEARANCE_MAP,
  SECTOR_CAMERA_MAP
} from '../../services/operatorManager.js';
import OperatorLoginModal from '../../components/OperatorLoginModal.jsx';
import { useTranslation } from '../../services/i18n.js';

export default function OperatorsTab() {
  const { t } = useTranslation();
  const [currentOperator, setCurrentOperator] = useState(getStoredOperator);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dutyLogs, setDutyLogs] = useState([]);
  const [dutyUptime, setDutyUptime] = useState('02h 18m 42s');

  // Auth Modal State for switching user
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [targetOperatorToAuth, setTargetOperatorToAuth] = useState(null);

  // Form State for creating new operator
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'Tactical Operator',
    bop_sector: 'BOP Sector Alpha (Western Sector)',
    callsign: 'EAGLE-02',
    badge_number: 'BSF-5581',
    security_pin: '1234'
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadOperators = async () => {
    setIsLoading(true);
    try {
      const list = await fetchOperatorsList();
      if (list) setOperators(list);
    } catch (e) {
      console.warn('Error fetching operators:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOperators();
    const unsub = subscribeOperator((op) => {
      setCurrentOperator(op);
      setDutyLogs(getOperatorDutyLogs(op.username));
    });
    return unsub;
  }, []);

  // Refresh duty logs when operator changes
  useEffect(() => {
    if (currentOperator?.username) {
      setDutyLogs(getOperatorDutyLogs(currentOperator.username));
    }
  }, [currentOperator?.username]);

  // Live session uptime ticker
  useEffect(() => {
    const start = new Date(currentOperator?.shift_start || Date.now()).getTime();
    const updateTicker = () => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      setDutyUptime(`${hrs}h ${mins}m ${secs}s`);
    };
    updateTicker();
    const timer = setInterval(updateTicker, 1000);
    return () => clearInterval(timer);
  }, [currentOperator?.shift_start]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMsg('');
  };

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, text: 'Empty', color: '#64748b' };
    if (pwd.length < 4) return { score: 1, text: 'Too Short (Min 4 chars)', color: '#ef4444' };
    if (pwd.length < 7) return { score: 2, text: 'Moderate', color: '#f59e0b' };
    const hasNum = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    if (hasNum && hasSpecial) return { score: 4, text: 'Military Standard Compliant', color: '#10b981' };
    return { score: 3, text: 'Standard', color: '#38bdf8' };
  };

  const strength = getPasswordStrength(formData.password);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanUsername = formData.username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMsg('Username must be at least 3 characters long.');
      return;
    }

    if (!formData.password || formData.password.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        username: cleanUsername,
        password: formData.password,
        full_name: formData.full_name.trim() || `Officer ${cleanUsername}`,
        role: formData.role,
        bop_sector: formData.bop_sector,
        callsign: formData.callsign.trim().toUpperCase() || 'EAGLE-01',
        badge_number: formData.badge_number.trim() || 'BSF-0000',
        security_pin: formData.security_pin.trim() || '1234'
      };

      await createOperatorAccount(payload);
      setSuccessMsg(`Personnel credentials registered: @${cleanUsername} (${payload.full_name})`);

      // Reset form fields
      setFormData({
        username: '',
        password: '',
        confirmPassword: '',
        full_name: '',
        role: 'Tactical Operator',
        bop_sector: 'BOP Sector Alpha (Western Sector)',
        callsign: 'EAGLE-03',
        badge_number: 'BSF-9944',
        security_pin: '1234'
      });

      // Reload list
      await loadOperators();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create operator account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOperator = async (op) => {
    if (operators.length <= 1) {
      alert('Cannot revoke the primary operator account. At least one active account must exist.');
      return;
    }

    if (!window.confirm(`CONFIRM PERSONNEL REVOCATION: Revoke credentials and delete operator account '@${op.username}' (${op.full_name})?`)) {
      return;
    }

    try {
      await deleteOperatorAccount(op.id);
      await loadOperators();
    } catch (err) {
      alert(err.message || 'Error revoking operator account.');
    }
  };

  // Open password auth modal before switching
  const handleInitiateSwitch = (op) => {
    setTargetOperatorToAuth(op);
    setIsLoginModalOpen(true);
  };

  const clearance = currentOperator?.role ? ROLE_CLEARANCE_MAP[currentOperator.role] : null;
  const isCommanderOrAdmin = currentOperator?.role === 'Shift Commander' || currentOperator?.role === 'Base Administrator';

  return (
    <div className="gov-admin-container">
      {/* Official Government Border Security Banner */}
      <div className="gov-admin-header-strip">
        <div className="gov-header-left">
          <div className="gov-seal-box">
            <Shield size={26} className="text-amber-400" />
          </div>
          <div>
            <div className="gov-title-row">
              <h2 className="gov-title-text">BORDER POST SURVEILLANCE CORPS // PERSONNEL ADMINISTRATION</h2>
              <span className="gov-class-badge">RESTRICTED // LAW ENFORCEMENT</span>
            </div>
            <p className="gov-desc-text">
              Official access control ledger, cryptographic credential issuance, duty roster, and operational clearance management.
            </p>
          </div>
        </div>

        <div className="gov-header-metrics font-mono">
          <div className="gov-metric-item">
            <span className="gov-metric-val">{operators.length}</span>
            <span className="gov-metric-lbl">REGISTERED PERSONNEL</span>
          </div>
          <div className="gov-metric-item">
            <span className="gov-metric-val text-emerald">1</span>
            <span className="gov-metric-lbl">ACTIVE ON DUTY</span>
          </div>
          <button
            type="button"
            className="btn-gov-refresh"
            onClick={loadOperators}
            disabled={isLoading}
            title="Refresh Personnel Ledger"
          >
            <RefreshCw size={13} className={isLoading ? 'spin-icon' : ''} />
            <span>Sync Ledger</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: ACTIVE OPERATOR DUTY SESSION CARD (DYNAMIC PER USER) */}
      <div className="gov-active-duty-card">
        <div className="duty-card-header">
          <div className="duty-header-badge">
            <span className="duty-pulse-dot" />
            <span className="duty-header-title font-mono">ACTIVE WORKSTATION SESSION // ON DUTY</span>
          </div>
          <div className="duty-header-actions">
            <button
              type="button"
              className="btn-duty-action lock-btn"
              onClick={() => setWorkstationLock(true)}
              title="Lock workstation and require password to re-enter"
            >
              <Lock size={13} />
              <span>Lock Terminal</span>
            </button>
            <button
              type="button"
              className="btn-duty-action switch-btn"
              onClick={() => {
                setTargetOperatorToAuth(null);
                setIsLoginModalOpen(true);
              }}
              title="Authenticate and switch duty operator"
            >
              <KeyRound size={13} />
              <span>Switch Duty Officer (Auth Required)</span>
            </button>
          </div>
        </div>

        <div className="duty-card-body">
          {/* Officer Avatar & Identity */}
          <div className="duty-officer-main">
            <div className="duty-avatar-box">
              <User size={30} color="#38bdf8" />
            </div>
            <div className="duty-officer-meta">
              <div className="duty-officer-name">{currentOperator.full_name}</div>
              <div className="duty-officer-sub font-mono">
                <span className="duty-badge-id">BADGE: {currentOperator.badge_number}</span>
                <span>•</span>
                <span className="duty-callsign">CALLSIGN: {currentOperator.callsign}</span>
                <span>•</span>
                <span className="duty-login">@{currentOperator.username}</span>
              </div>
              <div className="duty-clearance-row">
                <span className={`gov-clearance-pill ${clearance?.badgeClass || 'clearance-l1'}`}>
                  {clearance?.code}: {clearance?.title}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Duty Metrics Grid */}
          <div className="duty-metrics-grid font-mono">
            <div className="duty-metric-box">
              <span className="metric-title">STATIONED OUTPOST</span>
              <span className="metric-val text-amber-300">📍 {currentOperator.bop_sector}</span>
            </div>

            <div className="duty-metric-box">
              <span className="metric-title">PRIMARY OPTICAL FEED</span>
              <span className="metric-val text-sky-400">📹 {currentOperator.assigned_camera || 'CAM-01'}</span>
            </div>

            <div className="duty-metric-box">
              <span className="metric-title">WORKSTATION TERMINAL</span>
              <span className="metric-val">{currentOperator.terminal_id}</span>
            </div>

            <div className="duty-metric-box">
              <span className="metric-title">DUTY SESSION UPTIME</span>
              <span className="metric-val text-emerald">{dutyUptime}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Operator Shift Activity Logs */}
        <div className="duty-activity-timeline">
          <div className="timeline-title-row font-mono">
            <Activity size={13} className="text-emerald" />
            <span>OPERATIONAL ACTIVITY LOG // OFFICER: {currentOperator.callsign}</span>
          </div>
          <div className="timeline-items-row">
            {dutyLogs.slice(0, 3).map((log) => (
              <div key={log.id} className="timeline-card font-mono">
                <div className="timeline-time">{log.time}</div>
                <div className="timeline-action">{log.action}</div>
                <div className="timeline-desc">{log.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: AUTHORIZED PERSONNEL LEDGER TABLE & ENROLMENT FORM */}
      <div className="gov-admin-split-layout">
        {/* LEFT COLUMN: OFFICIAL PERSONNEL LEDGER TABLE */}
        <div className="gov-ledger-panel">
          <div className="panel-gov-header">
            <div className="panel-gov-title">
              <ShieldCheck size={16} color="#38bdf8" />
              <span>AUTHORIZED PERSONNEL LEDGER</span>
            </div>
            <span className="panel-gov-tag font-mono">{operators.length} REGISTERED</span>
          </div>

          <div className="gov-table-wrapper">
            <table className="gov-personnel-table font-mono">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>BADGE & NAME</th>
                  <th>CALLSIGN / ROLE</th>
                  <th>STATIONED POST</th>
                  <th>PRIMARY FEED</th>
                  <th>SESSION CONTROLS</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((op) => {
                  const isCurrent = op.username === currentOperator.username;
                  const opClearance = ROLE_CLEARANCE_MAP[op.role] || ROLE_CLEARANCE_MAP['Tactical Operator'];
                  const primaryFeed = SECTOR_CAMERA_MAP[op.bop_sector] || 'CAM-01';

                  return (
                    <tr key={op.id || op.username} className={isCurrent ? 'row-active-duty' : ''}>
                      <td>
                        {isCurrent ? (
                          <span className="status-tag-active">● ON DUTY</span>
                        ) : (
                          <span className="status-tag-standby">○ STANDBY</span>
                        )}
                      </td>
                      <td>
                        <div className="table-officer-info">
                          <span className="table-officer-name">{op.full_name}</span>
                          <span className="table-officer-badge">{op.badge_number || 'BSF-OFFICER'} (@{op.username})</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-role-info">
                          <span className="table-callsign text-accent">{op.callsign}</span>
                          <span className="table-role">{op.role}</span>
                        </div>
                      </td>
                      <td>
                        <span className="table-sector-text">{op.bop_sector}</span>
                      </td>
                      <td>
                        <span className="table-feed-tag">{primaryFeed}</span>
                      </td>
                      <td>
                        <div className="table-actions-cell">
                          {isCurrent ? (
                            <span className="btn-table-current">
                              <Check size={12} /> Logged In
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn-table-auth-switch"
                              onClick={() => handleInitiateSwitch(op)}
                              title={`Authenticate with password to switch to ${op.full_name}`}
                            >
                              <KeyRound size={12} />
                              <span>Auth & Switch</span>
                            </button>
                          )}

                          {operators.length > 1 && !isCurrent && (
                            <button
                              type="button"
                              className="btn-table-revoke"
                              onClick={() => handleDeleteOperator(op)}
                              title={`Revoke credentials for @${op.username}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: PERSONNEL ENROLMENT & CREDENTIAL ISSUANCE FORM */}
        <div className="gov-enrol-panel">
          <div className="panel-gov-header">
            <div className="panel-gov-title">
              <UserPlus size={16} color="#10b981" />
              <span>PERSONNEL ENROLMENT & CREDENTIAL SETUP</span>
            </div>
            <span className="panel-gov-tag font-mono">MIL-STD AUTH</span>
          </div>

          <form onSubmit={handleCreateAccount} className="gov-enrol-form">
            {errorMsg && (
              <div className="auth-alert-box alert-danger">
                <AlertTriangle size={15} className="flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="auth-alert-box alert-success">
                <CheckCircle2 size={15} className="flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Field: Username / Login ID */}
            <div className="gov-field-group">
              <label className="gov-field-label">
                <User size={12} />
                <span>OFFICIAL USERNAME (LOGIN ID) *</span>
              </label>
              <input
                type="text"
                className="gov-input font-mono"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="e.g. bsf_command_44"
                required
              />
              <span className="gov-field-hint">Unique alphanumeric login identifier</span>
            </div>

            {/* Field: Full Name & Rank */}
            <div className="gov-field-group">
              <label className="gov-field-label">
                <Award size={12} />
                <span>RANK & FULL NAME *</span>
              </label>
              <input
                type="text"
                className="gov-input"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                placeholder="e.g. Sub-Insp. Amit Kumar"
                required
              />
            </div>

            {/* Field: Password Setup */}
            <div className="gov-field-group">
              <label className="gov-field-label">
                <Lock size={12} />
                <span>SECURITY PASSWORD SETUP *</span>
              </label>
              <div className="gov-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="gov-input gov-input-pwd font-mono"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Set account password (min 4 chars)"
                  required
                />
                <button
                  type="button"
                  className="gov-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {formData.password && (
                <div className="gov-password-strength-bar">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${(strength.score / 4) * 100}%`,
                      backgroundColor: strength.color
                    }}
                  />
                  <span className="strength-text font-mono" style={{ color: strength.color }}>
                    Security Standard: {strength.text}
                  </span>
                </div>
              )}
            </div>

            {/* Field: Confirm Password */}
            <div className="gov-field-group">
              <label className="gov-field-label">
                <Lock size={12} />
                <span>CONFIRM PASSWORD *</span>
              </label>
              <div className="gov-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="gov-input gov-input-pwd font-mono"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Re-enter password to verify"
                  required
                />
                <button
                  type="button"
                  className="gov-eye-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <span className="pwd-match-tag font-mono">✓ Passwords match</span>
              )}
            </div>

            {/* 2-Column Row: Role & Callsign */}
            <div className="gov-row-2col">
              <div className="gov-field-group">
                <label className="gov-field-label">
                  <ShieldCheck size={12} />
                  <span>OPERATIONAL ROLE</span>
                </label>
                <select
                  className="gov-select font-mono"
                  value={formData.role}
                  onChange={(e) => handleChange('role', e.target.value)}
                >
                  <option value="Tactical Operator">Tactical Operator (Perimeter Monitoring)</option>
                  <option value="Shift Commander">Shift Commander (Command & Verification)</option>
                  <option value="Perimeter Analyst">Perimeter Analyst (Forensics & Intel)</option>
                  <option value="Base Administrator">Base Administrator (Full System Config)</option>
                </select>
              </div>

              <div className="gov-field-group">
                <label className="gov-field-label">
                  <Radio size={12} />
                  <span>CALLSIGN</span>
                </label>
                <input
                  type="text"
                  className="gov-input font-mono"
                  value={formData.callsign}
                  onChange={(e) => handleChange('callsign', e.target.value)}
                  placeholder="e.g. EAGLE-03"
                />
              </div>
            </div>

            {/* 2-Column Row: BOP Sector & PIN */}
            <div className="gov-row-2col">
              <div className="gov-field-group">
                <label className="gov-field-label">
                  <MapPin size={12} />
                  <span>ASSIGNED BOP POST</span>
                </label>
                <select
                  className="gov-select font-mono"
                  value={formData.bop_sector}
                  onChange={(e) => handleChange('bop_sector', e.target.value)}
                >
                  <option value="BOP Sector Alpha (Western Sector)">BOP Sector Alpha (Western Sector)</option>
                  <option value="BOP Sector Bravo (River Basin)">BOP Sector Bravo (River Basin)</option>
                  <option value="Forward Post 44A (Buffer Zone)">Forward Post 44A (Buffer Zone)</option>
                  <option value="BOP Sector Charlie (Ridge Line)">BOP Sector Charlie (Ridge Line)</option>
                  <option value="BOP Sector Delta (South Gate)">BOP Sector Delta (South Gate)</option>
                </select>
              </div>

              <div className="gov-field-group">
                <label className="gov-field-label">
                  <KeyRound size={12} />
                  <span>SECURITY PIN (4 DIGITS)</span>
                </label>
                <input
                  type="password"
                  maxLength={4}
                  className="gov-input font-mono"
                  value={formData.security_pin}
                  onChange={(e) => handleChange('security_pin', e.target.value.replace(/\D/g, ''))}
                  placeholder="4-digit PIN"
                />
              </div>
            </div>

            {/* Legal Notice */}
            <div className="gov-disclaimer-box font-mono">
              <span>LEGAL DISCLAIMER:</span>
              <p>
                Credential issuance grants access to live border surveillance feeds and telemetry.
                All activities are logged and auditable under defense regulations.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-gov-enrol-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Authorizing Credentials...</span>
              ) : (
                <>
                  <UserPlus size={15} />
                  <span>Authorize & Issue Operator Credentials</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Real-World Password Authentication Modal for User Switching */}
      <OperatorLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        targetOperator={targetOperatorToAuth}
        onLoginSuccess={(newOp) => {
          setCurrentOperator(newOp);
          loadOperators();
        }}
      />
    </div>
  );
}
