import React from 'react';
import { reportClientError } from '../errorReporter';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack);
    // Combine the React component stack with the raw error stack so the
    // server can see which component subtree crashed.
    const stack = [error?.stack, info?.componentStack && `\nComponent stack:${info.componentStack}`]
      .filter(Boolean)
      .join('');
    reportClientError({
      kind: 'render',
      message: error?.message || 'Render crash',
      stack,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.wrap}>
          <div style={styles.card}>
            <div style={styles.icon}>⚠️</div>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.msg}>An unexpected error occurred. Try refreshing the page.</p>
            <button style={styles.btn} onClick={() => window.location.reload()}>Reload page</button>
            <details style={styles.details}>
              <summary style={styles.summary}>Error details</summary>
              <pre style={styles.pre}>{this.state.error.stack || this.state.error.message}</pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: 24 },
  card: { background: '#fff', borderRadius: 12, padding: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: 440, width: '100%', textAlign: 'center' },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 },
  msg: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  btn: { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 20 },
  details: { textAlign: 'left', marginTop: 8 },
  summary: { fontSize: 12, color: '#6b7280', cursor: 'pointer' },
  pre: { fontSize: 11, color: '#ef4444', background: '#fef2f2', borderRadius: 6, padding: 10, overflowX: 'auto', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};
