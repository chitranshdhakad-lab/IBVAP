import React, { useState } from 'react';
import { useTranslation } from '../services/i18n.js';

export default function RecentEvents({
  onViewAllClick,
  events = [],
  onSelectEvent,
  selectedEventId
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const displayEvents = expanded ? events.slice(0, 10) : events.slice(0, 5);

  const getSeverityBadge = (severity) => {
    const sev = (severity || 'Low').toLowerCase();
    const label = sev === 'critical' ? t('levelCritical') : sev === 'high' ? t('levelHigh') : sev === 'medium' ? t('levelModerate') : t('levelLow');
    return (
      <span className={`severity-pill severity-${sev}`}>
        <span className={`severity-dot dot-${sev}`}></span>
        {label}
      </span>
    );
  };

  return (
    <div className="bottom-card">
      <div className="card-header-row">
        <span className="section-label">{t('recentEvents')}</span>
        <button
          className="card-link"
          style={{ background: 'none', border: 'none' }}
          onClick={() => {
            if (onViewAllClick) {
              onViewAllClick();
            } else {
              setExpanded(!expanded);
            }
          }}
        >
          <span>{expanded ? t('showLess') : `${t('viewAll')} →`}</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '11px' }}>
          {t('noIncidentsRecorded')}
        </div>
      ) : (
        <table className="events-table">
          <thead>
            <tr>
              <th>{t('time')}</th>
              <th>{t('incident')}</th>
              <th>{t('target')}</th>
              <th>{t('station')}</th>
              <th>{t('severity')}</th>
            </tr>
          </thead>
          <tbody>
            {displayEvents.map((evt) => {
              const isSelected = selectedEventId === evt.id;
              return (
                <tr
                  key={evt.id}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.12)' : undefined
                  }}
                  onClick={() => onSelectEvent && onSelectEvent(evt)}
                  title="Click to view event details and evidence"
                >
                  <td>{evt.time}</td>
                  <td className={evt.severity === 'Critical' ? 'event-critical-name' : ''}>
                    {evt.event}
                  </td>
                  <td>{evt.object}</td>
                  <td>{evt.camera}</td>
                  <td>{getSeverityBadge(evt.severity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
