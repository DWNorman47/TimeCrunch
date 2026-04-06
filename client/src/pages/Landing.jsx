import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const painPoints = [
  { icon: '📝', text: 'Paper timesheets that go missing — or never get turned in at all.' },
  { icon: '📞', text: 'Field photos texted to six different numbers, none of them in one place.' },
  { icon: '💸', text: 'Payroll that takes all weekend because nothing is connected.' },
];

const features = [
  { icon: '⏱', title: 'GPS Time Clock', body: 'Workers clock in from their phone in one tap. GPS captures where they are. Geofencing locks clock-ins to the job site — no buddy punching, no off-site entries.' },
  { icon: '📁', title: 'Projects & Billing', body: 'Track every project with budget bars, progress %, and a live activity feed. Generate formatted PDF invoices and export billing data per project in seconds.' },
  { icon: '🤝', title: 'Client Management', body: 'Keep a directory of client companies with contacts, linked projects, and compliance documents — COI, W-9, contracts, licenses — with automatic expiry alerts.' },
  { icon: '📸', title: 'Field Reports & Photos', body: 'Workers submit photo and video reports from the field, tagged with location, project, and time. No more hunting through text messages to find a job site photo.' },
  { icon: '✅', title: 'Punchlist & RFIs', body: 'Track deficiency items from open to resolved. Submit and manage RFIs with status and response fields. Every item tied to a project, nothing falls through.' },
  { icon: '🦺', title: 'Safety Checklists', body: 'Build reusable safety checklist templates and require workers to complete one before they can clock in. Every submission is timestamped and stored for compliance.' },
  { icon: '🏖', title: 'Time Off Requests', body: 'Workers submit time off requests from their dashboard. Admins approve or deny from the admin panel. Everyone sees the status — no more back-and-forth over text.' },
  { icon: '💵', title: 'Payroll & Overtime', body: 'Daily or weekly overtime rules, configurable thresholds and multipliers, prevailing wage tracking, and certified payroll reports — everything payroll needs, already calculated.' },
  { icon: '📅', title: 'Crew Scheduling', body: 'Assign workers to shifts and projects. Workers see their upcoming schedule the moment they log in and can clock in directly from a shift with one tap.' },
  { icon: '📊', title: 'Analytics & Reports', body: 'Live dashboards, overtime alerts, weekly trends, top projects, and approval queues. Know your labor cost before payroll closes — not after.' },
  { icon: '📬', title: 'Team Communication', body: 'Broadcast announcements to the whole crew instantly via push notification. Comment directly on time entries. No email required, no group texts.' },
  { icon: '🔗', title: 'QuickBooks Integration', body: 'Push approved time entries directly into QuickBooks Online. Map your workers and projects once — then it\'s one click. Zero manual re-entry, zero double-keying.' },
];

const steps = [
  { num: '1', title: 'Create Your Company', body: 'Sign up in under a minute. No credit card required. Set your company name, add your first project, and your crew can be clocked in today.' },
  { num: '2', title: 'Invite Your Workers', body: 'Workers get an email invite and set their own password. They open OpsFloa on their phone — no app download — and they\'re ready to go.' },
  { num: '3', title: 'Run Everything From One Place', body: 'Time, reports, safety, punchlist, projects, clients — everything flows through one platform your whole crew already has in their pocket.' },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    desc: 'For small crews just getting started.',
    features: ['Up to 3 Workers', 'GPS Time Clock & Approval', 'Scheduling (Current Week)', 'Timesheet PDF (Latest Week)', '90-Day History'],
    cta: 'Get Started Free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$20',
    period: '/mo',
    desc: 'More workers, more exports, more control.',
    features: ['Up to 10 Workers', 'Everything in Free', 'GPS Geofencing', 'Full History & CSV Export', 'Overtime Reports', 'Pay Period Lock', 'Mileage & Break Tracking', 'Scheduling (Any Date Range)'],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Business',
    price: '$35',
    period: '/mo · 15 workers included',
    desc: 'The full platform for growing contractors. $2/worker after 15.',
    features: ['15 Workers Included', 'Everything in Starter', 'Projects & Client Management', 'Field Reports, Photos & RFIs', 'Safety Checklists & Incidents', 'Punchlist & Equipment Log', 'Time Off Requests', 'Analytics Dashboard', 'Broadcast Announcements', '+$2/Worker After 15'],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'QBO Add-On',
    price: '+$25',
    period: '/mo',
    desc: 'Push hours directly into QuickBooks Online.',
    features: ['QuickBooks Online Sync', 'Zero Manual Entry', 'Map Workers & Projects Once', 'Requires Starter or Business'],
    cta: 'Start Free Trial',
    highlight: false,
  },
];

const compareRows = [
  { feature: 'Workers',                    free: 'Up to 3',      starter: 'Up to 10',   business: 'Unlimited' },
  { feature: 'GPS Time Clock',             free: '✓',            starter: '✓',          business: '✓' },
  { feature: 'GPS Geofencing',             free: '—',            starter: '✓',          business: '✓' },
  { feature: 'Approval Queue',             free: '✓',            starter: '✓',          business: '✓' },
  { feature: 'Scheduling',                 free: 'Current week', starter: '✓',          business: '✓' },
  { feature: 'Timesheet PDF',             free: 'Latest week',  starter: '✓',          business: '✓' },
  { feature: 'CSV Export',                 free: '—',            starter: '✓',          business: '✓' },
  { feature: 'Full History',              free: '90 days',      starter: '✓',          business: '✓' },
  { feature: 'Pay Period Lock',            free: '—',            starter: '✓',          business: '✓' },
  { feature: 'Overtime Reports',           free: '—',            starter: '✓',          business: '✓' },
  { feature: 'Mileage & Breaks',          free: '—',            starter: '✓',          business: '✓' },
  { feature: 'Projects & Budget Tracking', free: '—',            starter: '—',          business: '✓' },
  { feature: 'Client Management',          free: '—',            starter: '—',          business: '✓' },
  { feature: 'Field Reports & Photos',     free: '—',            starter: '—',          business: '✓' },
  { feature: 'Punchlist & RFI Tracking',   free: '—',            starter: '—',          business: '✓' },
  { feature: 'Safety Checklists',          free: '—',            starter: '—',          business: '✓' },
  { feature: 'Incident Reports',           free: '—',            starter: '—',          business: '✓' },
  { feature: 'Equipment Log',              free: '—',            starter: '—',          business: '✓' },
  { feature: 'Time Off Requests',          free: '—',            starter: '—',          business: '✓' },
  { feature: 'Analytics Dashboard',        free: '—',            starter: '—',          business: '✓' },
  { feature: 'Broadcast Announcements',    free: '—',            starter: '—',          business: '✓' },
  { feature: 'QuickBooks Online Sync',     free: '—',            starter: 'QBO Add-On', business: 'QBO Add-On' },
  { feature: 'Monthly Price',              free: '$0',           starter: '$20',        business: '$35 + $2/worker after 15' },
];

const faqs = [
  { q: 'Is the free plan actually free?', a: 'Yes — no credit card required, no trial period, no catch. The Free plan supports up to 3 workers with GPS time clock and scheduling. Upgrade when your crew grows.' },
  { q: 'Do my workers need to download an app?', a: 'No download required. OpsFloa works in any mobile browser. Workers can also install it to their home screen as a PWA for a native app experience — no App Store, no IT department, no waiting for anyone to update.' },
  { q: 'Does it work without internet or in poor signal areas?', a: 'Yes. Workers can clock in and submit entries offline. Everything syncs automatically when they\'re back online — no data is lost.' },
  { q: 'How does the Business plan pricing work?', a: 'It\'s $35/month and includes 15 workers. After that, it\'s $2 per additional worker per month. A 25-person crew is $55/mo. A 50-person crew is $105/mo. Annual billing is available with 2 months free.' },
  { q: 'Can I track prevailing wage and regular hours separately?', a: 'Yes. Every time entry is tagged as regular or prevailing wage. Rates, overtime multipliers, and daily vs. weekly OT rules are all configurable. The Pro add-on adds certified payroll reports in WH-347 format.' },
  { q: 'How does the QuickBooks integration work?', a: 'Connect your QuickBooks Online account in one click. Map your workers and projects to their QB counterparts. When ready, push approved time entries directly to QuickBooks as Time Activities — no manual re-entry.' },
  { q: 'What happens to my data if I cancel?', a: 'No contracts, no cancellation fees. Cancel from your billing page at any time. Your data stays accessible through the end of your current billing period.' },
  { q: 'Can different workers have different pay rates?', a: 'Yes. Each worker has their own hourly rate. Overtime multipliers and prevailing wage rates are set at the company level. Pay stubs and reports use each worker\'s individual rate.' },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={styles.faqItem}>
      <button style={styles.faqQ} onClick={() => setOpen(o => !o)}>
        <span>{q}</span>
        <span style={{ ...styles.faqChevron, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && <p style={styles.faqA}>{a}</p>}
    </div>
  );
}

export default function Landing() {
  return (
    <div id="top" style={styles.page}>
      {/* Header */}
      <header style={styles.header} className="landing-header">
        <a href="#top" style={styles.logoLink}>
          <span style={styles.logo}>OpsFloa</span>
          <span style={styles.logoTagline}>Operations Flow Assistant</span>
        </a>
        <nav style={styles.nav} className="landing-nav">
          <a href="#features" style={styles.navLink}>Features</a>
          <a href="#how-it-works" style={styles.navLink}>How It Works</a>
          <a href="#pricing" style={styles.navLink}>Pricing</a>
          <a href="#faq" style={styles.navLink}>FAQ</a>
        </nav>
        <div style={styles.headerRight}>
          <Link to="/login" style={styles.loginLink}>Log In</Link>
          <Link to="/register" style={styles.ctaBtn} className="landing-cta">Get Started Free</Link>
        </div>
      </header>

      {/* Mobile sub-nav */}
      <nav style={styles.mobileSubnav} className="landing-subnav">
        <a href="#features" style={styles.subnavLink}>Features</a>
        <a href="#how-it-works" style={styles.subnavLink}>How It Works</a>
        <a href="#pricing" style={styles.subnavLink}>Pricing</a>
        <a href="#faq" style={styles.subnavLink}>FAQ</a>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroBadge}>Built for Contractors &amp; Field Crews</div>
        <h1 style={styles.heroTitle}>One app for time, field, safety, and payroll. Built for contractors, not HR departments.</h1>
        <p style={styles.heroSub}>
          Time tracking, field reports, projects, clients, safety checklists, punchlist, and payroll prep — all in one platform, on any phone, online or offline. No app download required.
        </p>
        <div style={styles.heroCtas}>
          <Link to="/register" style={styles.heroBtn}>Start Free — No Card Required</Link>
          <a href="#features" style={styles.heroSecondary}>See Everything It Does →</a>
        </div>
        <p style={styles.heroNote}>14-Day Free Trial · All Features Included · Cancel Anytime</p>

        {/* Trust stats */}
        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>Offline</span>
            <span style={styles.heroStatLabel}>Clock-ins queue locally, sync when back online</span>
          </div>
          <div style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>$0</span>
            <span style={styles.heroStatLabel}>To get started — no credit card required</span>
          </div>
          <div style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatNum}>No App</span>
            <span style={styles.heroStatLabel}>Works in any phone browser — nothing to download</span>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <div style={styles.painBar}>
        <p style={styles.painIntro}>Sound familiar?</p>
        <div style={styles.painPoints}>
          {painPoints.map(p => (
            <div key={p.text} style={styles.painPoint}>
              <span style={styles.painIcon}>{p.icon}</span>
              <span style={styles.painText}>{p.text}</span>
            </div>
          ))}
        </div>
        <p style={styles.painCta}>OpsFloa fixes all of it — in one place, from any device.</p>
      </div>

      {/* Social proof bar */}
      <div style={styles.proofBar}>
        {['GPS Time Clock', 'Projects & Billing', 'Client Management', 'Field Photos', 'Safety Checklists', 'Punchlist', 'RFI Tracking', 'Time Off', 'Payroll Reports', 'QuickBooks Sync'].map(t => (
          <span key={t} style={styles.proofItem}>✓ {t}</span>
        ))}
      </div>

      {/* Features */}
      <section id="features" style={styles.section} className="landing-section">
        <div style={styles.sectionInner}>
          <h2 style={styles.sectionTitle}>One Platform. Every Part of the Job.</h2>
          <p style={styles.sectionSub}>From the first clock-in on Monday to payroll on Friday — every workflow is covered.</p>
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
          <h2 style={styles.sectionTitle}>Up and Running Today</h2>
          <p style={styles.sectionSub}>No training. No onboarding call. No IT department. Just sign up and go.</p>
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
          <h2 style={styles.sectionTitle}>Simple, Honest Pricing</h2>
          <p style={styles.sectionSub}>Start free. Upgrade when you're ready. No contracts, no surprises.</p>
          <div style={styles.pricingGrid}>
            {plans.map(p => (
              <div key={p.name} style={{ ...styles.planCard, ...(p.highlight ? styles.planHighlight : {}) }}>
                {p.highlight && <div style={styles.popularBadge}>Most Popular</div>}
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
          <p style={styles.annualNote}>Annual plans available — save 2 months. Choose at checkout.</p>

          {/* Comparison table */}
          <div style={styles.compareWrap}>
            <h3 style={styles.compareTitle}>Full Feature Comparison</h3>
            <div style={styles.tableScroll}>
              <table style={styles.compareTable}>
                <thead>
                  <tr>
                    <th style={styles.compareTh}>Feature</th>
                    <th style={styles.compareTh}>Free</th>
                    <th style={styles.compareTh}>Starter</th>
                    <th style={{ ...styles.compareTh, ...styles.compareThBusiness }}>Business</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.compareRowEven : {}}>
                      <td style={styles.compareTdFeature}>{row.feature}</td>
                      <td style={styles.compareTd}>{row.free}</td>
                      <td style={styles.compareTd}>{row.starter}</td>
                      <td style={{ ...styles.compareTd, ...styles.compareTdBusiness }}>{row.business}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={styles.howSection} className="landing-section">
        <div style={{ ...styles.sectionInner, maxWidth: 720 }}>
          <h2 style={styles.sectionTitle}>Frequently Asked Questions</h2>
          <p style={styles.sectionSub}>Everything you need to know before you sign up.</p>
          <div style={styles.faqList}>
            {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={styles.finalCta}>
        <div style={styles.finalCtaInner}>
          <div style={styles.finalCtaBrand}>OpsFloa · Operations Flow Assistant</div>
          <h2 style={styles.finalCtaTitle}>Your crew is already on the job site.<br />Give them the tools to match.</h2>
          <p style={styles.finalCtaSub}>Time tracking, field documentation, projects, clients, safety, and payroll — all in one platform, on any phone, no download required.</p>
          <Link to="/register" style={styles.finalCtaBtn}>Create Your Free Account →</Link>
          <p style={styles.finalCtaNote}>14-day trial · All features included · No credit card</p>
        </div>
      </section>

      <footer style={styles.footer}>
        <div style={styles.footerBrand}>
          <a href="#top" style={styles.footerLogo}>OpsFloa</a>
          <span style={styles.footerTagline}>Operations Flow Assistant</span>
        </div>
        <span style={styles.footerCopy}>© {new Date().getFullYear()} OpsFloa. All rights reserved.</span>
        <div style={styles.footerLinks}>
          <Link to="/login" style={styles.footerLink}>Log In</Link>
          <Link to="/register" style={styles.footerLink}>Sign Up</Link>
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
  heroTitle: { fontSize: 50, fontWeight: 900, lineHeight: 1.1, color: '#111827', maxWidth: 720, margin: '0 auto 22px' },
  heroSub: { fontSize: 19, color: '#4b5563', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 },
  heroCtas: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' },
  heroBtn: { display: 'inline-block', background: '#1a56db', color: '#fff', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 14px rgba(26,86,219,0.35)' },
  heroSecondary: { color: '#1a56db', fontWeight: 600, fontSize: 15, textDecoration: 'none' },
  heroNote: { fontSize: 13, color: '#9ca3af', marginBottom: 40 },
  heroStats: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, maxWidth: 620, margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid #e8edf5', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden', flexWrap: 'wrap' },
  heroStat: { flex: 1, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 },
  heroStatNum: { fontSize: 24, fontWeight: 800, color: '#1a56db', lineHeight: 1 },
  heroStatLabel: { fontSize: 12, color: '#6b7280', lineHeight: 1.4 },
  heroStatDivider: { width: 1, height: 48, background: '#e8edf5', flexShrink: 0 },

  // Pain points
  painBar: { background: '#fff8f0', borderTop: '1px solid #fed7aa', borderBottom: '1px solid #fed7aa', padding: '36px 24px', textAlign: 'center' },
  painIntro: { fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.06em' },
  painPoints: { display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 20 },
  painPoint: { display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 260, textAlign: 'left' },
  painIcon: { fontSize: 20, flexShrink: 0, marginTop: 2 },
  painText: { fontSize: 14, color: '#78350f', lineHeight: 1.5 },
  painCta: { fontSize: 16, fontWeight: 700, color: '#1a56db' },

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

  // Comparison table
  compareWrap: { marginTop: 52 },
  compareTitle: { fontSize: 18, fontWeight: 700, color: '#111827', textAlign: 'center', marginBottom: 20 },
  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 12, border: '1px solid #e5e7eb' },
  compareTable: { width: '100%', borderCollapse: 'collapse', minWidth: 500 },
  compareTh: { padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  compareThBusiness: { background: '#eff6ff', color: '#1a56db' },
  compareTdFeature: { padding: '11px 16px', fontSize: 13, fontWeight: 600, color: '#374151', textAlign: 'left', borderBottom: '1px solid #f3f4f6' },
  compareTd: { padding: '11px 16px', fontSize: 13, color: '#374151', textAlign: 'center', borderBottom: '1px solid #f3f4f6' },
  compareTdBusiness: { background: '#fafcff', fontWeight: 600, color: '#1a56db' },
  compareRowEven: { background: '#fafafa' },

  // FAQ
  faqList: { display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #e8edf5', borderRadius: 12, overflow: 'hidden' },
  faqItem: { borderBottom: '1px solid #e8edf5' },
  faqQ: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: '#fff', border: 'none', textAlign: 'left', fontSize: 15, fontWeight: 600, color: '#111827', cursor: 'pointer', gap: 16 },
  faqChevron: { fontSize: 16, color: '#9ca3af', flexShrink: 0, transition: 'transform 0.2s' },
  faqA: { margin: 0, padding: '0 24px 20px', fontSize: 14, color: '#6b7280', lineHeight: 1.7 },

  // Final CTA
  finalCta: { background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1e40af 100%)', color: '#fff', textAlign: 'center', padding: '96px 24px' },
  finalCtaInner: { maxWidth: 640, margin: '0 auto' },
  finalCtaBrand: { fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 20 },
  finalCtaTitle: { fontSize: 36, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 },
  finalCtaSub: { fontSize: 17, opacity: 0.85, marginBottom: 36, lineHeight: 1.6 },
  finalCtaBtn: { display: 'inline-block', background: '#fff', color: '#1a56db', padding: '15px 34px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none' },
  finalCtaNote: { fontSize: 13, opacity: 0.55, marginTop: 16 },

  // Footer
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 40px', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap', gap: 12 },
  footerBrand: { display: 'flex', flexDirection: 'column', gap: 2 },
  footerLogo: { fontWeight: 800, fontSize: 16, color: '#1a56db', textDecoration: 'none' },
  footerTagline: { fontSize: 10, color: '#9ca3af', letterSpacing: '0.04em' },
  footerCopy: { fontSize: 13, color: '#9ca3af' },
  footerLinks: { display: 'flex', gap: 20 },
  footerLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
};
