/**
 * Help-page content. Edit this file to add or revise FAQ entries — the
 * page renders directly from this structure, no other code change needed.
 *
 * Shape:
 *   { id, title, intro?, items: [{ q, a }] }
 *
 * - `id` becomes the URL hash for deep links (`/help#approvals`).
 * - `intro` is an optional paragraph rendered above the Q&A list.
 * - Each `a` (answer) can be a string or an array of strings (rendered as
 *   separate paragraphs). Keep them short — long answers belong in their
 *   own section.
 *
 * Notes when writing:
 * - Talk to the user, not about the system. "You can…" beats "Admins can…".
 * - Mention the path to find the relevant setting in parens, e.g.
 *   "(Administration → Company Settings → Modules)".
 * - If a question is really about a setting, prefer adding a HelpTip next
 *   to that setting in the UI instead of (or in addition to) a FAQ entry.
 */

export const HELP_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    intro: "If you're brand-new to OpsFloa, work through these in order. Most takes a minute each.",
    items: [
      {
        q: 'How do I add my first worker?',
        a: 'Open Team in the AppSwitcher. Click "Add worker" and enter their name and email — they\'ll get an invite link to set their own password. You can also create them with a temporary password if email isn\'t reliable in their environment.',
      },
      {
        q: 'How do I create a project workers can clock in to?',
        a: [
          'Open Projects in the AppSwitcher and click "New project". A project needs at least a name; everything else is optional.',
          'If you\'re a service business that doesn\'t track work by project, create a single "General" project and use it for everything — workers can\'t clock in without selecting one.',
        ],
      },
      {
        q: "Why don't I see Field, Inventory, or some other module?",
        a: 'Modules can be turned off per company under Administration → Company Settings → Modules. New companies default to a minimal set (Time Clock, Projects, Team) and you turn on others as you need them.',
      },
      {
        q: 'How do I switch between admin tools and clocking myself in?',
        a: 'Click the AppSwitcher in the top-left. "Workforce" is the admin oversight view (Live, Approvals, Reports, etc). "Time Clock" is the participating view — that\'s where you clock yourself in like a worker.',
      },
    ],
  },
  {
    id: 'time-tracking',
    title: 'Time Tracking',
    items: [
      {
        q: 'What\'s the difference between hourly and daily workers?',
        a: [
          'Hourly workers clock in, clock out, and get paid for the elapsed time. Standard time tracking.',
          'Daily workers get paid a flat rate per day worked, regardless of hours. You can either have them clock in/out as usual (the day counts) or enable "Mark Day mode" on their worker profile so they tap a single button to record presence — no clock-out needed.',
        ],
      },
      {
        q: 'How does overtime work?',
        a: 'Set the rule under Administration → Company Settings → Overtime. "Daily" pays OT after a per-day threshold (default 8 hours). "Weekly" pays OT after a per-week total (typically 40). The OT multiplier (default 1.5×) controls the rate. You can override OT on a per-entry basis from the Approvals tab if a specific entry needs different treatment.',
      },
      {
        q: 'A worker clocked in but isn\'t showing on Live Workers',
        a: 'Live Workers polls every minute — wait a moment, or hit Refresh. If they still don\'t appear, check that they actually selected a project on clock-in (entries with no project don\'t appear on Live). If their browser blocked location access, the clock-in still goes through but you\'ll get a "Location denied" alert in the bell.',
      },
      {
        q: 'Can workers edit their own time after submitting?',
        a: 'Yes, within 7 days and as long as the entry isn\'t in a locked pay period. They can\'t edit entries you\'ve already approved (those are locked). If you want to disable self-editing entirely (forcing workers to ask an admin for any fix), there\'s a company setting under Company Settings.',
      },
      {
        q: 'What does "Mark Day" do for daily workers?',
        a: 'For daily-rate workers with Mark Day mode enabled, clock-in and clock-out collapse into one button — they tap "Mark Day" and that day counts. Useful for piece-rate or per-diem crews where the actual hours don\'t affect pay. Toggle on the worker\'s profile in Team.',
      },
    ],
  },
  {
    id: 'approvals',
    title: 'Approvals & Edits',
    items: [
      {
        q: 'How do I approve time entries?',
        a: 'Workforce → Approvals. Each entry has Approve / Reject buttons. You can also Edit times before approving (if a worker entered the wrong start), or Split an entry across multiple projects if they worked on more than one job in a single shift.',
      },
      {
        q: 'A worker clocked the wrong day. How do I fix it?',
        a: 'Workforce → Approvals → click Edit on the entry. You\'ll see a Date input alongside Start and End — change it to the correct day and Save. The change is recorded in the audit log. (You can\'t move an entry into or out of a locked pay period.)',
      },
      {
        q: 'What does "lock a pay period" mean?',
        a: 'Locking freezes every entry in a date range so it can\'t be edited (by workers or admins) once you\'ve closed the books on it. Use it after you\'ve exported or paid out a period. Workforce → Approvals → Pay Periods.',
      },
      {
        q: "I rejected an entry by mistake — can I undo?",
        a: 'A rejected entry stays in the system as "rejected" — it isn\'t deleted. The worker can resubmit, and you can also unreject from the entry\'s detail view. Approved entries get a similar "unapprove" option.',
      },
    ],
  },
  {
    id: 'roles-permissions',
    title: 'Roles & Permissions',
    items: [
      {
        q: 'What\'s the difference between Worker, Admin, and Owner?',
        a: [
          'Worker: clocks themselves in, sees their own entries, may submit field reports / RFIs / safety checklists depending on what\'s enabled.',
          'Admin: everything Worker has, plus oversight — approve entries, manage workers and projects, view reports, run exports.',
          'Owner: everything Admin has, plus billing, role management, and (eventually) deleting the company. Each company gets exactly one Owner by default — the person who registered.',
        ],
      },
      {
        q: 'Can I create a custom role?',
        a: 'Yes — Team → Manage Roles. You can pick which Worker or Admin permissions a custom role gets. Useful for "Foreman" (approves entries but not billing) or "Office staff" (sees reports but doesn\'t do field work).',
      },
      {
        q: 'I removed a permission from someone but they still see the tab',
        a: 'They need to refresh / log out + back in. Permissions are computed on login and cached in their session. The next time their auth refreshes (within an hour), the change takes effect automatically.',
      },
    ],
  },
  {
    id: 'reports-exports',
    title: 'Reports & Exports',
    items: [
      {
        q: 'How do I export hours for payroll?',
        a: 'Workforce → Reports → Export. Pick a date range and download as CSV. There\'s a separate "Payroll Export" tile that formats columns the way most payroll providers expect.',
      },
      {
        q: 'What is Certified Payroll?',
        a: 'Certified Payroll (federal form WH-347) is required for prevailing-wage public works projects. If your company does federal/state public projects, enable Certified Payroll under Company Settings → Modules — you\'ll get worker classification fields, fringe benefit tracking, signed weekly reports, and the WH-347 PDF generator.',
      },
      {
        q: 'Can I see how much each project has cost in labor?',
        a: 'Workforce → Reports → Project Reports. Filter by date range and project, see total hours and pay (if Show Worker Wages is enabled).',
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Subscription',
    items: [
      {
        q: 'How do I update my payment method?',
        a: 'Administration → Billing → Manage Subscription. That opens the Stripe customer portal where you can change card, view invoices, and cancel.',
      },
      {
        q: 'My trial is about to expire — what happens?',
        a: 'You\'ll see a banner reminding you starting 7 days before. If the trial ends and you haven\'t subscribed, the app keeps your data but blocks worker login until you pick a plan. Admins can still log in to update billing.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    items: [
      {
        q: "I'm not getting notification bell or push alerts",
        a: 'Open the Account page → Notifications. Workers and admins each need to grant browser notification permission once. On iOS, push notifications only work if OpsFloa is installed as a home-screen app (the "Add to Home Screen" prompt).',
      },
      {
        q: 'Workers say the app feels slow on a job site with bad signal',
        a: 'OpsFloa is a PWA — clock-in and clock-out work offline. Punches are queued locally and replayed when the device gets a signal. If a worker is consistently reporting slowness, it\'s usually network latency, not the app — check their signal at the job site.',
      },
      {
        q: 'A setting I changed didn\'t seem to apply',
        a: 'Most settings take effect immediately, but some cached state (like a worker\'s permission list) only refreshes when their browser revalidates auth. A page refresh or quick logout/login on their side picks up the change.',
      },
      {
        q: 'I need help that isn\'t answered here',
        a: 'Open Administration → Account → Send a support message. Include screenshots or steps if the issue is hard to describe — that gets you to a fix faster.',
      },
    ],
  },
];
