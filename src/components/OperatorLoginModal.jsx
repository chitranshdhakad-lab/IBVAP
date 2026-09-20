import React, { useState, useEffect } from 'react';
import {
  Shield, Lock, Eye, EyeOff, KeyRound, AlertTriangle,
  CheckCircle2, X, User, ArrowRight, ShieldAlert, Laptop, ArrowLeft
} from 'lucide-react';

import {
  authenticateOperator,
  ROLE_CLEARANCE_MAP
} from '../services/operatorManager.js';

export default function OperatorLoginModal({
  isOpen,
  onClose,
  targetOperator = null, // If switching to a specific operator
  onLoginSuccess
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Prefill if a target operator was clicked
  useEffect(() => {
    if (targetOperator) {
      setUsername(targetOperator.username || '');
    } else {
      setUsername('');
    }
    setPassword('');
    setPin('');
    setErrorMessage('');
    setSuccessMessage('');
  }, [targetOperator, isOpen]);

  if (!isOpen) return null;

  const clearance = targetOperator?.role ? ROLE_CLEARANCE_MAP[targetOperator.role] : null;
  const isElevatedRole = targetOperator?.role === 'Shift Commander' || targetOperator?.role === 'Base Administrator';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      setErrorMessage('Enter your registered Operator Username.');
      return;
    }
    if (!password) {
      setErrorMessage('Security credentials required. Enter your password.');
      return;
    }

    if (isElevatedRole && targetOperator?.security_pin && pin && pin !== targetOperator.security_pin) {
      setErrorMessage('Security Override PIN verification failed.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authenticateOperator(cleanUser, password);
      setSuccessMessage(`ACCESS GRANTED // Session initialized for ${res.operator.full_name || cleanUser}`);
      setTimeout(() => {
        if (onLoginSuccess) onLoginSuccess(res.operator);
        if (onClose) onClose();
      }, 700);
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed. Access denied.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="defense-auth-overlay" onClick={onClose}>
      <div className="defense-auth-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Top Government Banner */}
        <div className="defense-auth-header">
          <div className="auth-header-badge">
            <Shield size={20} className="text-amber-500" />
            <div className="auth-header-titles">
              <span className="auth-sys-name">BORDER SECURITY SURVEILLANCE CORPS</span>
              <span className="auth-sys-sub">OPERATOR AUTHENTICATION GATEWAY // SECURE ACCESS</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-modal-back"
              onClick={onClose}
              title="Go Back"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
            <button type="button" className="auth-close-btn" onClick={onClose} title="Cancel">
              <X size={16} />
            </button>
          </div>

        </div>

        {/* Security Classification Strip */}
        <div className="auth-classification-strip">
          <span>RESTRICTED // LAW ENFORCEMENT & BORDER GUARD USE ONLY</span>
          <span className="auth-terminal-tag font-mono">TERM: WS-BOP-AUTH01</span>
        </div>

        {/* Selected Operator Identity Card (if switching to specific user) */}
        {targetOperator && (
          <div className="auth-target-operator-card">
            <div className="target-op-avatar">
              <User size={18} color="#94a3b8" />
            </div>
            <div className="target-op-meta">
              <div className="target-op-name">{targetOperator.full_name}</div>
              <div className="target-op-sub font-mono">
                <span>@{targetOperator.username}</span>
                <span>•</span>
                <span>{targetOperator.callsign}</span>
                <span>•</span>
                <span className="text-accent">{targetOperator.role}</span>
              </div>
              <div className="target-op-sector font-mono">
                📍 {targetOperator.bop_sector}
              </div>
            </div>
            {clearance && (
              <span className={`auth-clearance-pill ${clearance.badgeClass}`}>
                {clearance.code}
              </span>
            )}
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="defense-auth-form">
          {errorMessage && (
            <div className="auth-alert-box alert-danger">
              <ShieldAlert size={16} className="flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert-box alert-success">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Username Input (Only editable if no targetOperator preselected) */}
          <div className="auth-field-group">
            <label className="auth-field-label">
              <User size={12} />
              <span>OPERATOR LOGIN ID</span>
            </label>
            <input
              type="text"
              className="auth-input font-mono"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. operator or commander"
              disabled={!!targetOperator}
              required
            />
          </div>

          {/* Password Input */}
          <div className="auth-field-group">
            <div className="auth-label-row">
              <label className="auth-field-label">
                <Lock size={12} />
                <span>OPERATOR PASSWORD *</span>
              </label>
              <span className="auth-sec-notice">SHA-256 Verified</span>
            </div>
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

          {/* Elevated PIN if Commander / Admin */}
          {isElevatedRole && (
            <div className="auth-field-group">
              <label className="auth-field-label">
                <KeyRound size={12} />
                <span>SECURITY OVERRIDE PIN (4 DIGITS)</span>
              </label>
              <input
                type="password"
                maxLength={4}
                className="auth-input font-mono"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Optional 4-digit PIN override"
              />
            </div>
          )}

          {/* Official Disclaimer */}
          <div className="auth-legal-disclaimer">
            <p>
              By accessing this boundary workstation, you confirm authorization under operational orders.
              All actions, camera accesses, and alarm overrides are cryptographically logged with IP and timestamp.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="auth-btn-row">
            <button
              type="button"
              className="btn-auth-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-auth-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Verifying Credentials...</span>
              ) : (
                <>
                  <span>Authenticate & Switch Session</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
