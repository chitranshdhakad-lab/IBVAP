import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UI Crash intercepted by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          color: 'var(--sys-text-main, #0f172a)',
          background: 'var(--sys-bg-card, #ffffff)',
          borderRadius: '12px',
          border: '1px solid var(--sys-border, #e2e8f0)',
          margin: '20px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: '#ef4444'
          }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>
            Section Rendering Error
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--sys-text-muted, #64748b)', maxWidth: '420px', margin: '0 0 20px 0' }}>
            {this.state.error?.message || 'An unexpected error occurred while displaying this section.'}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={this.handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '6px',
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} /> Retry Section
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: 'transparent',
                color: 'var(--sys-text-muted, #64748b)',
                border: '1px solid var(--sys-border, #e2e8f0)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
