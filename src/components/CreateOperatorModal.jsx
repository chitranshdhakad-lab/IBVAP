import React, { useState, useEffect } from 'react';
import {
  X, User, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2,
  AlertTriangle, KeyRound, MapPin, Radio, Award, ArrowLeft
} from 'lucide-react';

import { createOperatorAccount, saveStoredOperator } from '../services/operatorManager.js';
import { useTranslation } from '../services/i18n.js';

export default function CreateOperatorModal({ isOpen, onClose, onOperatorCreated }) {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'Tactical Operator',
    bop_sector: 'BOP Sector Alpha (Western Sector)',
    callsign: 'EAGLE-02',
    badge_number: 'BSF-5581',
    security_pin: '1234',
    autoLogin: true
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
    if (hasNum && hasSpecial) return { score: 4, text: 'Strong Defense-Grade', color: '#10b981' };
    return { score: 3, text: 'Good', color: '#38bdf8' };
  };

  const strength = getPasswordStrength(formData.password);

  const handleSubmit = async (e) => {
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

      const res = await createOperatorAccount(payload);
      setSuccessMsg(`Operator account '${cleanUsername}' successfully authorized!`);

      if (formData.autoLogin && res.operator) {
        saveStoredOperator(res.operator);
      }

      if (onOperatorCreated) {
        onOperatorCreated(res.operator);
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create operator account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="operator-modal-backdrop" onClick={handleBackdropClick}>
      <div className="operator-modal-dialog">
        {/* Modal Header */}
        <div className="operator-modal-header">
          <div className="operator-modal-title-group">
            <div className="operator-modal-icon-wrap">
              <ShieldCheck size={20} color="#38bdf8" />
            </div>
            <div>
              <div className="operator-modal-title">CREATE OPERATOR ACCOUNT</div>
              <div className="operator-modal-subtitle">
                AUTHORIZE NEW BORDER SURVEILLANCE PERSONNEL & CREDENTIALS
              </div>
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
            <button
              type="button"
              className="operator-modal-close-btn"
              onClick={onClose}
              title="Close (ESC)"
            >
              <X size={16} />
            </button>
          </div>

        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="operator-modal-body">
          {errorMsg && (
            <div className="operator-alert-box alert-error">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="operator-alert-box alert-success">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="operator-form-grid">
            {/* 1. Username (Tactical Login ID) */}
            <div className="op-field-group">
              <label className="op-label">
                <User size={12} className="op-field-icon" />
                <span>OPERATOR USERNAME (LOGIN ID) *</span>
              </label>
              <input
                type="text"
                className="op-input"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="e.g. bsf_officer_44"
                required
                autoFocus
              />
              <span className="op-hint">Unique alphanumeric callsign login</span>
            </div>

            {/* 2. Full Name & Rank */}
            <div className="op-field-group">
              <label className="op-label">
                <Award size={12} className="op-field-icon" />
                <span>FULL NAME & RANK *</span>
              </label>
              <input
                type="text"
                className="op-input"
                value={formData.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
                placeholder="e.g. Sub-Insp. Rajesh Sharma"
                required
              />
              <span className="op-hint">Display name in tactical audit log</span>
            </div>

            {/* 3. Password Setup */}
            <div className="op-field-group">
              <label className="op-label">
                <Lock size={12} className="op-field-icon" />
                <span>PASSWORD SETUP *</span>
              </label>
              <div className="op-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="op-input op-input-pwd"
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  placeholder="Enter security password"
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-eye"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {formData.password && (
                <div className="password-strength-bar">
                  <div
                    className="strength-fill"
                    style={{
                      width: `${(strength.score / 4) * 100}%`,
                      backgroundColor: strength.color
                    }}
                  />
                  <span className="strength-text" style={{ color: strength.color }}>
                    Strength: {strength.text}
                  </span>
                </div>
              )}
            </div>

            {/* 4. Confirm Password */}
            <div className="op-field-group">
              <label className="op-label">
                <Lock size={12} className="op-field-icon" />
                <span>CONFIRM PASSWORD *</span>
              </label>
              <div className="op-password-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="op-input op-input-pwd"
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Re-type password"
                  required
                />
                <button
                  type="button"
                  className="btn-toggle-eye"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <span className="pwd-match-tag">✓ Passwords match</span>
              )}
            </div>

            {/* 5. Role Clearance */}
            <div className="op-field-group">
              <label className="op-label">
                <ShieldCheck size={12} className="op-field-icon" />
                <span>OPERATIONAL ROLE</span>
              </label>
              <select
                className="op-select"
                value={formData.role}
                onChange={(e) => handleChange('role', e.target.value)}
              >
                <option value="Tactical Operator">Tactical Operator (Perimeter Monitoring)</option>
                <option value="Shift Commander">Shift Commander (Incident Verification & Escalation)</option>
                <option value="Perimeter Analyst">Perimeter Analyst (Forensics & Intelligence)</option>
                <option value="Base Administrator">Base Administrator (Full System Configuration)</option>
              </select>
            </div>

            {/* 6. Assigned BOP / Sector */}
            <div className="op-field-group">
              <label className="op-label">
                <MapPin size={12} className="op-field-icon" />
                <span>ASSIGNED BORDER OUTPOST (BOP)</span>
              </label>
              <select
                className="op-select"
                value={formData.bop_sector}
                onChange={(e) => handleChange('bop_sector', e.target.value)}
              >
                <option value="BOP Sector Alpha (Western Sector)">BOP Sector Alpha (Western Sector)</option>
                <option value="BOP Sector Bravo (River Basin)">BOP Sector Bravo (River Basin)</option>
                <option value="BOP Sector Charlie (Ridge Line)">BOP Sector Charlie (Ridge Line)</option>
                <option value="BOP Sector Delta (South Gate)">BOP Sector Delta (South Gate)</option>
                <option value="Forward Post 44A (Buffer Zone)">Forward Post 44A (Buffer Zone)</option>
              </select>
            </div>

            {/* 7. Callsign */}
            <div className="op-field-group">
              <label className="op-label">
                <Radio size={12} className="op-field-icon" />
                <span>TACTICAL CALLSIGN</span>
              </label>
              <input
                type="text"
                className="op-input font-mono"
                value={formData.callsign}
                onChange={(e) => handleChange('callsign', e.target.value)}
                placeholder="e.g. EAGLE-02"
              />
            </div>

            {/* 8. Security Access PIN */}
            <div className="op-field-group">
              <label className="op-label">
                <KeyRound size={12} className="op-field-icon" />
                <span>EMERGENCY OVERRIDE PIN (4 DIGITS)</span>
              </label>
              <input
                type="password"
                maxLength={4}
                className="op-input font-mono"
                value={formData.security_pin}
                onChange={(e) => handleChange('security_pin', e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit PIN"
              />
            </div>
          </div>

          {/* Auto-login checkbox */}
          <div className="op-checkbox-row">
            <label className="op-checkbox-label">
              <input
                type="checkbox"
                checked={formData.autoLogin}
                onChange={(e) => handleChange('autoLogin', e.target.checked)}
              />
              <span>Immediately activate and switch to this operator session upon creation</span>
            </label>
          </div>

          {/* Modal Bottom Buttons */}
          <div className="operator-modal-footer">
            <button
              type="button"
              className="btn-op-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-op-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Authorizing Account...</span>
              ) : (
                <>
                  <ShieldCheck size={14} />
                  <span>Create Account & Authorize</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
