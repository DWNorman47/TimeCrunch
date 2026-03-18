import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  { icon: '⏱', title: 'Clock In/Out with GPS', body: 'Workers clock in from their phone. Location is captured automatically so you know where the work happened.' },
  { icon: '📊', title: 'Real-Time Reports', body: 'Live dashboards show who is clocked in right now. Worker and project reports break down regular, overtime, and prevailing wage hours.' },
  { icon: '💵', title: 'Prevailing Wage Ready', body: 'Track regular and prevailing wage hours side-by-side with configurable rates, overtime multipliers, and daily or weekly OT rules.' },
  { icon: '✅', title: 'Entry Approvals', body: 'Workers submit hours, admins review and approve before payroll. Bulk-approve or reject with a note.' },
  { icon: '📅', title: 'Scheduling', body: 'Assign workers to shifts in advance. Workers see their upcoming schedule the moment they log in.' },
  { icon: '🔒', title: 'Pay Period Lock', body: 'Lock a pay period when payroll runs. Workers cannot edit entries inside locked periods.' },
  { icon: '☕', title: 'Break & Mileage Tracking', body: 'Log unpaid breaks (deducted automatically) and mileage per shift. Visible in timesheets and reports.' },
  { icon: '📬', title: 'Worker Messaging', body: 'Workers flag disputes on any entry. Admins reply inline from the approval queue. No email required.' },
];

const steps = [
  { num: '1', title: 'Create your company', body: 'Sign up in under a minute. No credit card required.' },
  { num: '2', title: 'Add workers & projects', body: 'Invite workers by email or add them manually. Set up your job sites.' },
  { num: '3', title: 'Track time from day one', body: 'Workers clock in on any device. You see everything in real time.' },
];

const plans = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    desc: 'Perfect for small crews just getting started.',
    features: ['Up to 10 workers', 'Unlimited projects', 'Time tracking & GPS', 'Basic reports & CSV export', 'Email support'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$79',
    period: '/mo',
    desc: 'Everything you need to run a larger team.',
    features: ['Up to 50 workers', 'Everything in Starter', 'Entry approvals & scheduling', 'Pay period lock', 'Break & mileage tracking', 'Analytics dashboard', 'Priority support'],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For large contractors with complex needs.',
    features: ['Unlimited workers', 'Everything in Growth', 'QuickBooks integration', 'Custom overtime rules', 'Dedicated onboarding', 'SLA support'],
    cta: 'Contact us',
    highlight: false,
  },
];

export default function Landing() {
  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header} className="landing-header">
        <span style={styles.logo}>Time Crunch</span>
        <nav style={styles.nav} className="landing-nav">
          <a href="#features" style={styles.navLink}>Features</a>
          <a href="#how-it-works" style={styles.navLink}>How it works</a>
          <a href="#pricing" style={styles.navLink}>Pricing</a>
        </nav>
        <div style={styles.headerRight}>
          <Link to="/login" style={styles.loginLink}>Log in</Link>
          <Link to="/register" style={styles.ctaBtn} className="landing-cta">Get started free</Link>
        </div>
      </header>

      {/* Mobile sub-nav */}
      <nav style={styles.mobileSubnav} className="landing-subnav">
        <a href="#features" style={styles.subnavLink}>Features</a>
        <a href="#how-it-works" style={styles.subnavLink}>How it works</a>
        <a href="#pricing" style={styles.subnavLink}>Pricing</a>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroBadge}>Built for contractors &amp; field crews</div>
        <h1 style={styles.heroTitle}>Time tracking that<br />actually fits the job site</h1>
        <p style={styles.heroSub}>
          Clock in with GPS, track prevailing wage, approve entries, schedule shifts, and run payroll reports — all in one place. No spreadsheets. No guesswork.
        </p>
        <div style={styles.heroCtas}>
          <Link to="/register" style={styles.heroBtn}>Create your free account</Link>
          <a href="#features" style={styles.heroSecondary}>See all features →</a>
        </div>
        <p style={styles.heroNote}>Free 14-day trial · No credit card required</p>
      </section>

      {/* Social proof bar */}
      <div style={styles.proofBar}>
        {['GPS clock-in', 'Prevailing wage', 'Entry approvals', 'Scheduling', 'Pay period lock', 'Live map view'].map(t => (
          <span key={t} style={styles.proofItem}>✓ {t}</span>
        ))}
      </div>

      {/* Features */}
      <section id="features" style={styles.section}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>Everything your crew needs</h2>
          <p style={styles.sectionSub}>From clock-in to payroll, every step is covered.</p>
          <div style={styles.featureGrid}>
            {features.map(f => (
              <div key={f.title} style={styles.featureCard}>
                <span style={styles.featureIcon}>{f.icon}</span>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={styles.howSection}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>Up and running in minutes</h2>
          <p style={styles.sectionSub}>No training. No onboarding call. Just sign up and go.</p>
          <div style={styles.steps}>
            {steps.map(s => (
              <div key={s.num} style={styles.step}>
                <div style={styles.stepNum}>{s.num}</div>
                <h3 style={styles.stepTitle}>{s.title}</h3>
                <p style={styles.stepBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={styles.section}>
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>Simple, honest pricing</h2>
          <p style={styles.sectionSub}>Start free. Upgrade when you're ready. Cancel any time.</p>
          <div style={styles.pricingGrid}>
            {plans.map(p => (
              <div key={p.name} style={{ ...styles.planCard, ...(p.highlight ? styles.planHighlight : {}) }}>
                {p.highlight && <div style={styles.popularBadge}>Most popular</div>}
                <div style={styles.planName}>{p.name}</div>
                <div style={styles.planPrice}>
                  <span style={styles.planAmount}>{p.price}</span>
                  <span style={styles.planPeriod}>{p.period}</span>
                </div>
                <p style={styles.planDesc}>{p.desc}</p>
                <ul style={styles.planFeatures}>
                  {p.features.map(f => (
                    <li key={f} style={styles.planFeatureItem}>
                      <span style={styles.check}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={p.cta === 'Contact us' ? '/login' : '/register'}
                  style={{ ...styles.planBtn, ...(p.highlight ? styles.planBtnHighlight : {}) }}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={styles.finalCta}>
        <h2 style={styles.finalCtaTitle}>Ready to stop guessing and start tracking?</h2>
        <p style={styles.finalCtaSub}>Join contractors already using Time Crunch to run tighter crews and cleaner payroll.</p>
        <Link to="/register" style={styles.finalCtaBtn}>Create your free account →</Link>
      </section>

      <footer style={styles.footer}>
        <span style={styles.footerLogo}>Time Crunch</span>
        <span style={styles.footerCopy}>© {new Date().getFullYear()} Time Crunch. All rights reserved.</span>
        <div style={styles.footerLinks}>
          <Link to="/login" style={styles.footerLink}>Log in</Link>
          <Link to="/register" style={styles.footerLink}>Sign up</Link>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a202c' },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(64px + env(safe-area-inset-top))', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 100 },
  logo: { fontWeight: 800, fontSize: 20, color: '#1a56db', letterSpacing: '-0.5px' },
  nav: { display: 'flex', gap: 28 },
  navLink: { color: '#6b7280', fontWeight: 500, fontSize: 14, textDecoration: 'none' },
  mobileSubnav: { display: 'none' },
  subnavLink: { color: '#374151', fontWeight: 500, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  loginLink: { color: '#374151', fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  ctaBtn: { background: '#1a56db', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },

  // Hero
  hero: { textAlign: 'center', padding: '100px 24px 80px', background: 'linear-gradient(160deg, #f0f4ff 0%, #fafbff 50%, #fff 100%)' },
  heroBadge: { display: 'inline-block', background: '#e0e7ff', color: '#3730a3', fontSize: 13, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginBottom: 20, letterSpacing: '0.03em' },
  heroTitle: { fontSize: 52, fontWeight: 900, lineHeight: 1.1, marginBottom: 22, color: '#111827', maxWidth: 680, margin: '0 auto 22px' },
  heroSub: { fontSize: 19, color: '#4b5563', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.7 },
  heroCtas: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' },
  heroBtn: { display: 'inline-block', background: '#1a56db', color: '#fff', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 14px rgba(26,86,219,0.35)' },
  heroSecondary: { color: '#1a56db', fontWeight: 600, fontSize: 15, textDecoration: 'none' },
  heroNote: { fontSize: 13, color: '#9ca3af' },

  // Proof bar
  proofBar: { background: '#f8faff', borderTop: '1px solid #e8edf5', borderBottom: '1px solid #e8edf5', padding: '14px 40px', display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' },
  proofItem: { fontSize: 13, fontWeight: 600, color: '#374151' },

  // Sections
  section: { padding: '88px 24px' },
  howSection: { padding: '88px 24px', background: '#f8faff' },
  sectionInner: { maxWidth: 960, margin: '0 auto' },
  sectionTitle: { fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 12, color: '#111827' },
  sectionSub: { fontSize: 17, color: '#6b7280', textAlign: 'center', marginBottom: 52, lineHeight: 1.6 },

  // Features
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 },
  featureCard: { background: '#f8faff', borderRadius: 14, padding: '28px 22px', border: '1px solid #e8edf5' },
  featureIcon: { fontSize: 28, display: 'block', marginBottom: 14 },
  featureTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#111827' },
  featureBody: { fontSize: 13, color: '#6b7280', lineHeight: 1.65, margin: 0 },

  // How it works
  steps: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 32 },
  step: { textAlign: 'center' },
  stepNum: { width: 48, height: 48, borderRadius: '50%', background: '#1a56db', color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' },
  stepTitle: { fontSize: 17, fontWeight: 700, marginBottom: 8, color: '#111827' },
  stepBody: { fontSize: 14, color: '#6b7280', lineHeight: 1.6 },

  // Pricing
  pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto' },
  planCard: { background: '#fff', borderRadius: 16, padding: '32px 28px', border: '2px solid #e5e7eb', position: 'relative' },
  planHighlight: { border: '2px solid #1a56db', boxShadow: '0 8px 32px rgba(26,86,219,0.15)' },
  popularBadge: { position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap' },
  planName: { fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
  planPrice: { display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 },
  planAmount: { fontSize: 40, fontWeight: 800, color: '#111827' },
  planPeriod: { fontSize: 15, color: '#9ca3af' },
  planDesc: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 },
  planFeatures: { listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  planFeatureItem: { fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 },
  check: { color: '#059669', fontWeight: 700 },
  planBtn: { display: 'block', textAlign: 'center', border: '2px solid #1a56db', color: '#1a56db', padding: '11px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  planBtnHighlight: { background: '#1a56db', color: '#fff' },

  // Final CTA
  finalCta: { background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)', color: '#fff', textAlign: 'center', padding: '96px 24px' },
  finalCtaTitle: { fontSize: 36, fontWeight: 800, marginBottom: 14, maxWidth: 580, margin: '0 auto 14px' },
  finalCtaSub: { fontSize: 17, opacity: 0.85, marginBottom: 36, lineHeight: 1.6 },
  finalCtaBtn: { display: 'inline-block', background: '#fff', color: '#1a56db', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none' },

  // Footer
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap', gap: 12 },
  footerLogo: { fontWeight: 800, fontSize: 16, color: '#1a56db' },
  footerCopy: { fontSize: 13, color: '#9ca3af' },
  footerLinks: { display: 'flex', gap: 20 },
  footerLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
};
