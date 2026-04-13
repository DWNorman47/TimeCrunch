import React, { useState } from 'react';
import { useT } from '../hooks/useT';

const EyeIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function PasswordInput({ style, ...props }) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        style={{ ...style, paddingRight: 40, width: '100%', boxSizing: 'border-box' }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(s => !s)}
        aria-label={show ? t.hidePassword : t.showPassword}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 38, background: 'none', border: 'none',
          cursor: 'pointer', color: '#9ca3af',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        {show ? EyeOffIcon : EyeIcon}
      </button>
    </div>
  );
}
