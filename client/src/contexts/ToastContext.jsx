import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismiss = id => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={styles.container}>
        {toasts.map(t => (
          <div key={t.id} style={{ ...styles.toast, ...styles[t.type] }}>
            <span style={styles.msg}>{t.message}</span>
            <button style={styles.close} onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = {
  container: {
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
  },
  toast: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.14)', maxWidth: 360,
    pointerEvents: 'all', animation: 'fadeSlideIn 0.2s ease',
  },
  msg: { flex: 1 },
  close: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, lineHeight: 1, opacity: 0.6, padding: '0 2px', flexShrink: 0,
  },
  error: { background: '#fef2f2', borderLeft: '4px solid #ef4444', color: '#991b1b' },
  success: { background: '#f0fdf4', borderLeft: '4px solid #22c55e', color: '#166534' },
  info: { background: '#eff6ff', borderLeft: '4px solid #3b82f6', color: '#1e40af' },
  warning: { background: '#fffbeb', borderLeft: '4px solid #f59e0b', color: '#92400e' },
};
