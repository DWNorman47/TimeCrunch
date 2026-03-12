import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  { icon: '⏱', title: 'Simple Time Tracking', body: 'Workers log their hours in seconds — start time, end time, project. No training required.' },
  { icon: '📊', title: 'Instant Reports', body: 'See regular, overtime, and prevailing wage hours broken down per worker or per project, ready to bill.' },
  { icon: '💵', title: 'Built for Prevailing Wage', body: 'Track regular and prevailing wage hours side-by-side with configurable rates and overtime multipliers.' },
  { icon: '👷', title: 'Multi-Worker Teams', body: 'Add as many workers as you need. Each has their own login and sees only their own entries.' },
];

export default function Landing() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>Time Crunch</span>
        <div style={styles.headerRight}>
          <Link to="/login" style={styles.loginLink}>Log in</Link>
          <Link to="/register" style={styles.ctaBtn}>Get started free</Link>
        </div>
      </header>

      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>Time tracking built for contractors</h1>
        <p style={styles.heroSub}>
          Log hours, track prevailing wage, and generate bills — without spreadsheets or complicated software.
        </p>
        <Link to="/register" style={styles.heroBtn}>Create your free account</Link>
      </section>

      <section style={styles.features}>
        {features.map(f => (
          <div key={f.title} style={styles.featureCard}>
            <span style={styles.featureIcon}>{f.icon}</span>
            <h3 style={styles.featureTitle}>{f.title}</h3>
            <p style={styles.featureBody}>{f.body}</p>
          </div>
        ))}
      </section>

      <section style={styles.cta}>
        <h2 style={styles.ctaTitle}>Ready to get started?</h2>
        <p style={styles.ctaSub}>Set up your company in under a minute.</p>
        <Link to="/register" style={styles.heroBtn}>Create your free account</Link>
      </section>

      <footer style={styles.footer}>
        <span>© {new Date().getFullYear()} Time Crunch</span>
      </footer>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif', color: '#1a202c' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 60, borderBottom: '1px solid #eee' },
  logo: { fontWeight: 800, fontSize: 20, color: '#1a56db' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  loginLink: { color: '#444', fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  ctaBtn: { background: '#1a56db', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },

  hero: { textAlign: 'center', padding: '96px 24px 80px', background: 'linear-gradient(160deg, #f0f4ff 0%, #fff 60%)' },
  heroTitle: { fontSize: 48, fontWeight: 800, lineHeight: 1.15, marginBottom: 20, color: '#111827', maxWidth: 640, margin: '0 auto 20px' },
  heroSub: { fontSize: 20, color: '#4b5563', maxWidth: 520, margin: '0 auto 36px', lineHeight: 1.6 },
  heroBtn: { display: 'inline-block', background: '#1a56db', color: '#fff', padding: '14px 32px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none' },

  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto', padding: '80px 24px' },
  featureCard: { background: '#f8faff', borderRadius: 12, padding: '28px 24px' },
  featureIcon: { fontSize: 28, display: 'block', marginBottom: 12 },
  featureTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  featureBody: { fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: 0 },

  cta: { textAlign: 'center', background: '#1a56db', color: '#fff', padding: '72px 24px' },
  ctaTitle: { fontSize: 32, fontWeight: 800, marginBottom: 12 },
  ctaSub: { fontSize: 16, opacity: 0.85, marginBottom: 32 },

  footer: { textAlign: 'center', padding: '24px', fontSize: 13, color: '#9ca3af', borderTop: '1px solid #f0f0f0' },
};
