import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function WelcomeModal() {
  const { user, firstLogin, clearFirstLogin } = useAuth();
  const navigate = useNavigate();
  if (!firstLogin || !user) return null;

  const firstName = user.first_name || user.full_name?.split(' ')[0] || user.username;
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  const handleStart = () => {
    clearFirstLogin();
    if (isAdmin) navigate('/administration');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.brand}>OpsFloA · Ops Flow Assist</div>
        <div style={styles.emoji}>{isAdmin ? '🏗️' : '👷'}</div>
        <h2 style={styles.title}>Welcome, {firstName}!</h2>
        {isAdmin ? (
          <>
            <p style={styles.body}>
              <strong>Ops Flow Assist</strong> is your all-in-one field operations platform — built for contractors and the crews who run the job.
            </p>
            <p style={styles.body}>
              As an admin, you're in control. Add your team, set up projects, track time, approve timesheets, and push hours straight to QuickBooks.
            </p>
          </>
        ) : (
          <>
            <p style={styles.body}>
              <strong>Ops Flow Assist</strong> (OpsFloA) is your field operations hub — time clock, schedule, reports, and more, right in your pocket.
            </p>
            <p style={styles.body}>
              Use the <strong>Time Clock</strong> to log your hours, check your upcoming shifts, and submit field reports — all from this app.
            </p>
          </>
        )}
        <button style={styles.btn} onClick={handleStart}>
          {isAdmin ? 'Let\'s get started →' : 'Got it →'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#fff', borderRadius: 16, padding: '36px 32px', maxWidth: 440, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' },
  brand: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9ca3af' },
  emoji: { fontSize: 48, lineHeight: 1 },
  title: { fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 },
  body: { fontSize: 14, color: '#4b5563', lineHeight: 1.7, margin: 0, textAlign: 'left' },
  btn: { marginTop: 8, padding: '12px 28px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: 'pointer', alignSelf: 'center' },
};
