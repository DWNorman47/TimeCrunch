import React from 'react';
import { Link } from 'react-router-dom';

const features = [
  { icon: '⏱', title: 'Time Clock & GPS', body: 'Workers clock in from their phone. Location is captured automatically so you know where the work happened — and geofencing keeps it honest.' },
  { icon: '📋', title: 'Daily Reports', body: 'Superintendent-ready daily logs with weather, manpower, equipment, materials, and work performed. Submittal-ready in minutes.' },
  { icon: '📸', title: 'Field Reports', body: 'Workers submit photo reports from the field — tagged with location, project, and time. No more texting images to the office.' },
  { icon: '✅', title: 'Punchlist Management', body: 'Create, assign, and track deficiency items through to resolution. Priority flags and status tracking keep nothing slipping through.' },
  { icon: '🦺', title: 'Safety Talks', body: 'Document toolbox talks with digital sign-off. Every worker signature is timestamped and stored — ready for inspection.' },
  { icon: '💵', title: 'Prevailing Wage Ready', body: 'Track regular and prevailing wage hours side-by-side with configurable rates, overtime multipliers, and daily or weekly OT rules.' },
  { icon: '📅', title: 'Crew Scheduling', body: 'Assign workers to shifts and projects in advance. Workers see their upcoming schedule the moment they log in.' },
  { icon: '📊', title: 'Analytics & Reports', body: 'Live dashboards, overtime alerts, weekly trends, and approval queues. Know your labor cost before payroll closes.' },
  { icon: '📬', title: 'Team Messaging', body: 'Broadcast announcements to the whole crew or message workers inline on timesheet disputes. No email required.' },
  { icon: '🔒', title: 'Pay Period Lock', body: 'Lock a pay period when payroll runs. Workers cannot edit entries inside locked periods. Audit trail included.' },
  { icon: '🔗', title: 'QuickBooks Integration', body: 'Push approved time entries directly into QuickBooks Online. Zero manual entry, zero double-keying. Available as an add-on.' },
];

const steps = [
  { num: '1', title: 'Create your company', body: 'Sign up in under a minute. No credit card required. Your crew can be clocked in today.' },
  { num: '2', title: 'Add workers & projects', body: 'Invite workers by email or add them manually. Set up job sites with GPS boundaries.' },
  { num: '3', title: 'Run your field operations', body: 'Time, reports, safety, punchlist — everything flows through one platform your whole crew already has in their pocket.' },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    desc: 'For small crews just getting started.',
    features: ['Up to 3 workers', 'GPS time clock', 'Scheduling (1 week ahead)', 'Timesheet PDF (latest week)', '90-day history'],
    cta: 'Get started free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$20',
    period: '/mo',
    desc: 'More workers, more exports, more control.',
    features: ['Up to 10 workers', 'Everything in Free', 'Full history & CSV export', 'Overtime reports', 'Entry approvals', 'Pay period lock', 'Mileage & break tracking'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Business',
    price: '$35',
    period: '/mo · 15 workers included',
    desc: 'The full platform for growing contractors. $2/worker after 15.',
    features: ['15 workers included', 'Everything in Starter', 'Daily & field reports', 'Punchlist management', 'Safety talks & sign-off', 'Analytics dashboard', 'Broadcast announcements', '+$2/worker after 15'],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'QBO Add-on',
    price: '+$25',
    period: '/mo',
    desc: 'Push hours directly into QuickBooks Online.',
    features: ['QuickBooks Online sync', 'Zero manual entry', 'Requires Starter or Business'],
    cta: 'Learn more',
    highlight: false,
  },
];

export default function Landing() {
  return (
    <div id="top" style={styles.page}>
      {/* Header */}
      <header style={styles.header} className="landing-header">
        <a href="#top" style={styles.logoLink}>
          <span style={styles.logo}>OpsFloA</span>
          <span style={styles.logoTagline}>Ops Flow Assist</span>
        </a>
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
        <div style={styles.heroWordmark} spellCheck={false}>Ops Flow Assist</div>
        <h1 style={styles.heroTitle}>Operations Management<br />For the Job Site</h1>
        <p style={styles.heroSub}>
          Time tracking, daily reports, field photos, punchlist, safety talks, and crew scheduling — all in one platform your whole team carries in their pocket.
        </p>
        <div style={styles.heroCtas}>
          <Link to="/register" style={styles.heroBtn}>Create your free account</Link>
          <a href="#features" style={styles.heroSecondary}>See all features →</a>
        </div>
        <p style={styles.heroNote}>Free 14-day trial · No credit card required</p>

        {/* Trust stats */}
        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>11+</span>
            <span style={styles.heroStatLabel}>Features built for the field</span>
          </div>
          <div style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>$0</span>
            <span style={styles.heroStatLabel}>To get started — no card required</span>
          </div>
          <div style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>1 min</span>
            <span style={styles.heroStatLabel}>To set up and clock in your crew</span>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <div style={styles.proofBar}>
        {['GPS time clock', 'Daily reports', 'Field photos', 'Punchlist', 'Safety talks', 'Certified payroll', 'QuickBooks sync'].map(t => (
          <span key={t} style={styles.proofItem}>✓ {t}</span>
        ))}
      </div>

      {/* Features */}
      <section id="features" style={styles.section} className="landing-section">
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>One platform. Every part of the job.</h2>
          <p style={styles.sectionSub}>From first clock-in to final sign-off, every workflow is covered.</p>
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
      <section id="how-it-works" style={styles.howSection} className="landing-section">
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
      <section id="pricing" style={styles.section} className="landing-section">
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
                  to="/register"
                  style={{ ...styles.planBtn, ...(p.highlight ? styles.planBtnHighlight : {}) }}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
          <p style={styles.annualNote}>Annual plans available with 2 months free — choose at checkout.</p>
        </div>
      </section>

      {/* Final CTA */}
      <section style={styles.finalCta}>
        <div style={styles.finalCtaInner}>
          <div style={styles.finalCtaBrand}>OpsFloA · Ops Flow Assist</div>
          <h2 style={styles.finalCtaTitle}>Your crew is already on the job site.<br />Give them the tools to match.</h2>
          <p style={styles.finalCtaSub}>One login. Every tool your field team needs — from clock-in to certified payroll.</p>
          <Link to="/register" style={styles.finalCtaBtn}>Create your free account →</Link>
        </div>
      </section>

      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <a href="#top" style={styles.footerLogo}>OpsFloA</a>
          <span style={styles.footerTagline}>Ops Flow Assist</span>
        </div>
        <span style={styles.footerCopy}>© {new Date().getFullYear()} OpsFloA. All rights reserved.</span>
        <div style={styles.footerLinks}>
          <Link to="/login" style={styles.footerLink}>Log in</Link>
          <Link to="/register" style={styles.footerLink}>Sign up</Link>
          <Link to="/privacy" style={styles.footerLink}>Privacy</Link>
          <Link to="/eula" style={styles.footerLink}>Terms</Link>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a202c' },

  // Header
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(64px + env(safe-area-inset-top))', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 100 },
  logoLink: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textDecoration: 'none', lineHeight: 1.1 },
  logo: { fontWeight: 800, fontSize: 20, color: '#1a56db', letterSpacing: '-0.5px' },
  logoTagline: { fontSize: 10, fontWeight: 500, color: '#9ca3af', letterSpacing: '0.04em' },
  nav: { display: 'flex', gap: 28 },
  navLink: { color: '#6b7280', fontWeight: 500, fontSize: 14, textDecoration: 'none' },
  mobileSubnav: { display: 'none' },
  subnavLink: { color: '#374151', fontWeight: 500, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  loginLink: { color: '#374151', fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  ctaBtn: { background: '#1a56db', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },

  // Hero
  hero: { textAlign: 'center', padding: '80px 24px 72px', background: 'linear-gradient(160deg, #f0f4ff 0%, #fafbff 50%, #fff 100%)' },
  heroBadge: { display: 'inline-block', background: '#e0e7ff', color: '#3730a3', fontSize: 13, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginBottom: 18, letterSpacing: '0.03em' },
  heroWordmark: { fontSize: 15, fontWeight: 700, color: '#1a56db', letterSpacing: '0.08em', marginBottom: 18, opacity: 0.8 },
  heroTitle: { fontSize: 52, fontWeight: 900, lineHeight: 1.1, color: '#111827', maxWidth: 680, margin: '0 auto 22px' },
  heroSub: { fontSize: 19, color: '#4b5563', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 },
  heroCtas: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' },
  heroBtn: { display: 'inline-block', background: '#1a56db', color: '#fff', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 14px rgba(26,86,219,0.35)' },
  heroSecondary: { color: '#1a56db', fontWeight: 600, fontSize: 15, textDecoration: 'none' },
  heroNote: { fontSize: 13, color: '#9ca3af', marginBottom: 40 },
  heroStats: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, maxWidth: 580, margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid #e8edf5', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', flexWrap: 'wrap' },
  heroStat: { flex: 1, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 },
  heroStatNum: { fontSize: 26, fontWeight: 800, color: '#1a56db', lineHeight: 1 },
  heroStatLabel: { fontSize: 12, color: '#6b7280', lineHeight: 1.4 },
  heroStatDivider: { width: 1, height: 48, background: '#e8edf5', flexShrink: 0 },

  // Proof bar
  proofBar: { background: '#f8faff', borderTop: '1px solid #e8edf5', borderBottom: '1px solid #e8edf5', padding: '14px 40px', display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' },
  proofItem: { fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 },

  // Sections
  section: { padding: '88px 24px' },
  howSection: { padding: '88px 24px', background: '#f8faff' },
  sectionInner: { maxWidth: 960, margin: '0 auto' },
  sectionTitle: { fontSize: 36, fontWeight: 800, textAlign: 'center', marginBottom: 12, color: '#111827' },
  sectionSub: { fontSize: 17, color: '#6b7280', textAlign: 'center', marginBottom: 52, lineHeight: 1.6 },

  // Features
  featureGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 20 },
  featureCard: { background: '#f8faff', borderRadius: 14, padding: '28px 22px', border: '1px solid #e8edf5', borderLeft: '4px solid #1a56db' },
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
  pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, maxWidth: 960, margin: '0 auto' },
  planCard: { background: '#fff', borderRadius: 16, padding: '32px 28px', border: '2px solid #e5e7eb', position: 'relative' },
  planHighlight: { border: '2px solid #1a56db', boxShadow: '0 8px 32px rgba(26,86,219,0.15)' },
  popularBadge: { position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#1a56db', color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap' },
  planName: { fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 },
  planPrice: { display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8, flexWrap: 'wrap' },
  planAmount: { fontSize: 40, fontWeight: 800, color: '#111827' },
  planPeriod: { fontSize: 13, color: '#9ca3af' },
  planDesc: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 },
  planFeatures: { listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 },
  planFeatureItem: { fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 },
  check: { color: '#059669', fontWeight: 700 },
  planBtn: { display: 'block', textAlign: 'center', border: '2px solid #1a56db', color: '#1a56db', padding: '11px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  planBtnHighlight: { background: '#1a56db', color: '#fff' },
  annualNote: { textAlign: 'center', fontSize: 13, color: '#9ca3af', marginTop: 28 },

  // Final CTA
  finalCta: { background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)', color: '#fff', textAlign: 'center', padding: '96px 24px' },
  finalCtaInner: { maxWidth: 640, margin: '0 auto' },
  finalCtaBrand: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 20 },
  finalCtaTitle: { fontSize: 36, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 },
  finalCtaSub: { fontSize: 17, opacity: 0.85, marginBottom: 36, lineHeight: 1.6 },
  finalCtaBtn: { display: 'inline-block', background: '#fff', color: '#1a56db', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none' },

  // Footer
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap', gap: 12 },
  footerBrand: { display: 'flex', flexDirection: 'column', gap: 2 },
  footerLogo: { fontWeight: 800, fontSize: 16, color: '#1a56db', textDecoration: 'none' },
  footerTagline: { fontSize: 10, color: '#9ca3af', letterSpacing: '0.04em' },
  footerCopy: { fontSize: 13, color: '#9ca3af' },
  footerLinks: { display: 'flex', gap: 20 },
  footerLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
};
