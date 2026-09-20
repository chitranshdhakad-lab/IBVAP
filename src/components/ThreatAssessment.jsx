import React from 'react';
import { ShieldAlert, AlertCircle, Compass, Moon, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../services/i18n.js';

export default function ThreatAssessment({ threatAssessment, analysisActive = false }) {
  const { t } = useTranslation();
  const isLive = Boolean(analysisActive);

  // Directly reflect backend threat score and level from CV pipeline when live
  const score = isLive ? (threatAssessment?.score ?? 0) : '—';
  const numericScore = typeof score === 'number' ? score : 0;
  
  const rawLevel = isLive
    ? (threatAssessment?.level ?? (numericScore >= 70 ? 'CRITICAL' : numericScore >= 40 ? 'MEDIUM RISK' : 'SECURE'))
    : 'NO ACTIVE ASSESSMENT';

  // Localize level tag
  const level = isLive
    ? (numericScore >= 70 ? t('levelCritical') : numericScore >= 40 ? t('levelModerate') : t('levelSecure'))
    : t('noActiveAnalysis');

  const description = isLive
    ? (threatAssessment?.description ?? (numericScore > 0 ? 'Active tracked entities in sector' : 'Perimeter secure. Analysis running.'))
    : 'Sector threat analysis standby. Click Start Analysis to initiate AI risk evaluation.';
  const factors = isLive
    ? (threatAssessment?.key_factors?.length > 0
        ? threatAssessment.key_factors
        : ['Perimeter optical feed ready', 'No boundary breaches detected'])
    : ['Analysis engine on standby', 'Zero active intrusions evaluated'];

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = isLive
    ? circumference - (numericScore / 100) * circumference
    : circumference;

  const getFactorIcon = (text) => {
    if (text.includes('Person')) return AlertCircle;
    if (text.includes('Movement') || text.includes('boundary')) return Compass;
    if (text.includes('Night')) return Moon;
    if (text.includes('Proximity') || text.includes('zone')) return ShieldAlert;
    if (text.includes('secure') || text.includes('ready')) return ShieldCheck;
    return Clock;
  };

  const getRiskColor = (s) => {
    if (!isLive) return '#64748b';
    if (s >= 70) return '#dc2626'; // High / Critical
    if (s >= 40) return '#d97706'; // Medium / Warning
    return '#16a34a'; // Low / Secure Green
  };

  const riskColor = getRiskColor(numericScore);

  return (
    <div className="threat-card">
      <div className="section-label">
        <span>{t('threatAssessment')}</span>
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
          {isLive ? '● ACTIVE EVALUATION' : 'STANDBY'}
        </span>
      </div>

      <div className="threat-content-row">
        {/* Left: Circular Risk Score & Classification */}
        <div className="threat-left">
          <div className="gauge-container">
            <svg className="gauge-svg" viewBox="0 0 70 70">
              {/* Background circle track */}
              <circle
                cx="35"
                cy="35"
                r={radius}
                fill="none"
                stroke="#ded8cb"
                strokeWidth="5"
              />
              {/* Dynamic threat risk score arc */}
              <circle
                cx="35"
                cy="35"
                r={radius}
                fill="none"
                stroke={riskColor}
                strokeWidth="5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
              />
            </svg>
            <div className="gauge-center-text">
              <span className="gauge-score">{score}</span>
              <span className="gauge-total">/100</span>
            </div>
          </div>

          <div className="threat-meta">
            <div
              className="threat-level-badge"
              style={{ color: riskColor }}
            >
              {level}
            </div>
            <div className="threat-description">
              {description}
            </div>
          </div>
        </div>

        {/* Right: Key Factors */}
        <div className="threat-right">
          <div className="factors-title">{t('threatFactors').toUpperCase()}</div>
          {factors.slice(0, 5).map((factor, idx) => {
            const Icon = getFactorIcon(factor);
            return (
              <div key={idx} className="factor-item">
                <Icon className="factor-icon" size={10} />
                <span>{factor}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
