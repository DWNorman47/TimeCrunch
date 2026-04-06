import React, { useState } from 'react';
import { useT } from '../hooks/useT';

const DISMISS_KEY = 'opsfloa_onboarding_dismissed';

export default function OnboardingChecklist({ workers, projects, settings }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));

  if (dismissed) return null;

  const hasWorkers = workers.some(w => w.role === 'worker');
  const hasProjects = projects.length > 0;
  const projectsEnabled = settings?.feature_project_integration !== false;

  const steps = [
    {
      done: hasWorkers,
      label: t.onboardingAddWorker,
      sub: t.onboardingAddWorkerSub,
      href: '/administration#workers',
      cta: t.onboardingAddWorkerCta,
    },
    ...(projectsEnabled ? [{
      done: hasProjects,
      label: t.onboardingAddProject,
      sub: t.onboardingAddProjectSub,
      href: '/administration#projects',
      cta: t.onboardingAddProjectCta,
    }] : []),
    {
      done: false,
      label: t.onboardingRates,
      sub: t.onboardingRatesSub,
      href: '/administration#rates',
      cta: t.onboardingRatesCta,
    },
  ];

  const doneCount = steps.filter(s => s.done).length;
  const allDone = doneCount === steps.length;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>🚀 {t.onboardingTitle}</div>
          <div style={styles.progress}>
            {doneCount} {t.onboardingOf} {steps.length} {t.onboardingStepsComplete}
            <span style={styles.progressBar}>
              <span style={{ ...styles.progressFill, width: `${(doneCount / steps.length) * 100}%` }} />
            </span>
          </div>
        </div>
        <button style={styles.closeBtn} onClick={dismiss} title="Dismiss">✕</button>
      </div>

      <div style={styles.steps}>
        {steps.map((step, i) => (
          <div key={i} style={{ ...styles.step, opacity: step.done ? 0.6 : 1 }}>
            <div style={{ ...styles.check, background: step.done ? '#d1fae5', color: '#065f46' }}>
              {step.done ? '✓' : <span style={{ color: '#9ca3af' }}>{i + 1}</span>}
            </div>
            <div style={styles.stepBody}>
              <div style={{ ...styles.stepLabel, textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </div>
              {!step.done && <div style={styles.stepSub}>{step.sub}</div>}
            </div>
            {!step.done && (
              <a href={step.href} style={styles.stepBtn}>{step.cta}</a>
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div style={styles.allDone}>
          {t.onboardingAllDone} <button style={styles.dismissLink} onClick={dismiss}>{t.onboardingDismiss}</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  title: { fontWeight: 800, fontSize: 16, color: '#111827', marginBottom: 6 },
  progress: { fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 8 },
  progressBar: {
    display: 'inline-block',
    width: 80,
    height: 6,
    background: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    display: 'block',
    height: '100%',
    background: '#1a56db',
    borderRadius: 3,
    transition: 'width 0.3s',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 16,
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    flexShrink: 0,
  },
  steps: { display: 'flex', flexDirection: 'column', gap: 12 },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: '#f9fafb',
    borderRadius: 8,
    transition: 'opacity 0.2s',
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  stepBody: { flex: 1, minWidth: 0 },
  stepLabel: { fontSize: 14, fontWeight: 600, color: '#111827' },
  stepSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  stepBtn: {
    fontSize: 12,
    fontWeight: 700,
    background: '#1a56db',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 6,
    textDecoration: 'none',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  allDone: {
    marginTop: 14,
    padding: '10px 12px',
    background: '#d1fae5',
    borderRadius: 8,
    fontSize: 13,
    color: '#065f46',
    fontWeight: 600,
  },
  dismissLink: {
    background: 'none',
    border: 'none',
    color: '#065f46',
    fontWeight: 700,
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    marginLeft: 4,
  },
};
