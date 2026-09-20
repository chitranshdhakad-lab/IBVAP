import React, { useState, useEffect } from 'react';
import {
  Shield, Lock, Eye, EyeOff, KeyRound, AlertTriangle,
  CheckCircle2, User, ArrowRight, ShieldAlert, Laptop
} from 'lucide-react';
import {
  getStoredOperator,
  authenticateOperator,
  isWorkstationLocked,
  setWorkstationLock,
  subscribeWorkstationLock,
  fetchOperatorsList
} from '../services/operatorManager.js';

export default function WorkstationLockScreen() {
  const [locked, setLocked] = useState(isWorkstationLocked);
  const [currentOperator, setCurrentOperator] = useState(getStoredOperator);
  const [operators, setOperators] = useState([]);
  const [selectedUser, setSelectedUser] = useState(currentOperator.username || 'operator');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [clockTime, setClockTime] = useState('');
  const [clockDate, setClockDate] = useState('');

  useEffect(() => {
    const unsub = subscribeWorkstationLock((isLocked) => {
      setLocked(isLocked);
      if (isLocked) {
        const op = getStoredOperator();
        setCurrentOperator(op);
        setSelectedUser(op.username);
        setPassword('');
        setErrorMsg('');
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (locked) {
      fetchOperatorsList().then((list) => {
        if (list) setOperators(list);
      });
    }
  }, [locked]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClockTime(now.toLocaleTimeString('en-GB', { hour12: false }));
      setClockDate(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!locked) return null;

  const activeOp = operators.find((o) => o.username === selectedUser) || currentOperator;

  const handleUnlock = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!password) {
      setErrorMsg('Enter your authentication password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authenticateOperator(selectedUser, password);
      setSuccessMsg('CREDENTIALS VERIFIED // WORKSTATION UNLOCKED');
      setTimeout(() => {
        setWorkstationLock(false);
      }, 500);
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Incorrect password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="workstation-lock-container">
      {/* Background overlay with military grid watermark */}
      <div className="lock-watermark-overlay" />

      {/* Top Defense Header */}
      <div className="lock-top-bar">
        <div className="lock-top-left">
          <img src="/assets/emblem.png" alt="Gov Emblem" className="lock-emblem-img" />
          <div>
            <div className="lock-org-name">MINISTRY OF HOME AFFAIRS // BORDER MANAGEMENT DIVISION</div>
            <div className="lock-sub-org">INTEGRATED BORDER VULNERABILITY AUDIT PLATFORM (IBVAP)</div>
          </div>
        </div>
        <div className="lock-top-right font-mono">
          <div className="lock-terminal-id">TERMINAL: {activeOp.terminal_id || 'WS-BOP-SEC01'}</div>
          <div className="lock-sec-level">SECURITY LEVEL: RESTRICTED // MIL-STD</div>
        </div>
      </div>

      {/* Center Authentication Card */}
      <div className="lock-center-content">
        <div className="lock-clock-box">
          <div className="lock-time font-mono">{clockTime}</div>
          <div className="lock-date">{clockDate}</div>
        </div>

        <div className="lock-auth-box">
          <div className="lock-auth-header">
            <div className="lock-icon-wrap">
              <Lock size={20} color="#e2e8f0" />
            </div>
            <div>
              <h2 className="lock-title">WORKSTATION LOCKED</h2>
              <p className="lock-subtitle">Enter operator credentials to resume boundary surveillance</p>
            </div>
          </div>

          {errorMsg && (
            <div className="auth-alert-box alert-danger" style={{ margin: '14px 0' }}>
              <ShieldAlert size={16} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="auth-alert-box alert-success" style={{ margin: '14px 0' }}>
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleUnlock} className="lock-form">
            {/* Operator Selection */}
            <div className="lock-field">
              <label className="lock-field-label">SELECT OPERATOR</label>
              <select
                className="lock-select font-mono"
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setErrorMsg('');
                }}
              >
                {operators.map((op) => (
                  <option key={op.id || op.username} value={op.username}>
                    {op.full_name} ({op.callsign}) - @{op.username}
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Badge Summary */}
            <div className="lock-operator-badge-strip">
              <div className="op-badge-avatar">
                <User size={15} />
              </div>
              <div className="op-badge-info">
                <span className="op-badge-name">{activeOp.full_name}</span>
                <span className="op-badge-sub font-mono">
                  {activeOp.role} • 📍 {activeOp.bop_sector}
                </span>
              </div>
            </div>

            {/* Password Input */}
            <div className="lock-field">
              <label className="lock-field-label">OPERATOR PASSWORD</label>
              <div className="auth-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input auth-input-pwd font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter account password"
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-lock-unlock"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Verifying Authentication...</span>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Authenticate & Unlock Terminal</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom Footer Notice */}
      <div className="lock-bottom-bar">
        <span>SECURITY NOTICE: Unauthorized access to boundary telemetry and border defense controls is strictly prohibited.</span>
        <span className="font-mono">IP: 192.168.10.42 // ENCRYPTION: SHA-256 SALT</span>
      </div>
    </div>
  );
}
