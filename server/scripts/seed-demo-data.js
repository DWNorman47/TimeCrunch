const pool = require('../db');
const bcrypt = require('bcryptjs');
const { seedBuiltinRoles } = require('../permissions');

// Manual or opt-in dev/stage seed for visual QA. It creates/fills only the
// named fictional company and runs automatically only when DEMO_SEED_AUTO=true.
const TARGET_COMPANY = process.env.DEMO_COMPANY_NAME || 'Demo Operations';
const DEMO_ADMIN_USERNAME = process.env.DEMO_ADMIN_USERNAME || 'Admin';
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Admin123';
const TODAY = new Date('2026-05-06T12:00:00Z');

function slugify(value) {
  return String(value || 'demo-workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'demo-workspace';
}

function isoDate(offsetDays = 0) {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isoTimestamp(offsetDays = 0, hour = 10, minute = 0) {
  const d = new Date(`${isoDate(offsetDays)}T00:00:00Z`);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function one(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] || null;
}

async function ensureBy(client, table, key, values, returning = '*') {
  const where = Object.keys(key).map((name, index) => `${name} = $${index + 1}`).join(' AND ');
  const existing = await one(client, `SELECT ${returning} FROM ${table} WHERE ${where} LIMIT 1`, Object.values(key));
  if (existing) return existing;

  const merged = { ...key, ...values };
  const cols = Object.keys(merged);
  const placeholders = cols.map((_, index) => `$${index + 1}`);
  return one(
    client,
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returning}`,
    Object.values(merged)
  );
}

async function upsertStock(client, stock) {
  await client.query(
    `INSERT INTO inventory_stock
       (company_id, item_id, location_id, quantity, area_id, rack_id, bay_id, compartment_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (item_id, location_id, (COALESCE(uom_id, 0)))
     DO UPDATE SET quantity = EXCLUDED.quantity,
                   area_id = EXCLUDED.area_id,
                   rack_id = EXCLUDED.rack_id,
                   bay_id = EXCLUDED.bay_id,
                   compartment_id = EXCLUDED.compartment_id,
                   updated_at = NOW()`,
    [
      stock.company_id,
      stock.item_id,
      stock.location_id,
      stock.quantity,
      stock.area_id || null,
      stock.rack_id || null,
      stock.bay_id || null,
      stock.compartment_id || null,
    ]
  );
}

async function ensureChildRows(client, table, keyName, keyValue, rows) {
  const count = await one(client, `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${keyName} = $1`, [keyValue]);
  if (count.count > 0) return;
  for (const row of rows) {
    const merged = { [keyName]: keyValue, ...row };
    const cols = Object.keys(merged);
    await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(merged)
    );
  }
}

async function ensureDemoCompany(client) {
  const existing = await one(client, 'SELECT id, name FROM companies WHERE name = $1', [TARGET_COMPANY]);
  if (existing) return existing;

  const baseSlug = slugify(TARGET_COMPANY);
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const taken = await one(client, 'SELECT id FROM companies WHERE slug = $1 LIMIT 1', [slug]);
    if (!taken) break;
    slug = `${baseSlug}-${i}`;
  }

  return one(
    client,
    `INSERT INTO companies
       (name, slug, subscription_status, plan, trial_ends_at, pro_addon, addon_qbo,
        addon_certified_payroll, accepts_service_requests, client_portal_pro_interest,
        registration_ip)
     VALUES ($1,$2,'exempt','business',NOW() + INTERVAL '90 days',true,true,true,true,true,'127.0.0.1')
     RETURNING id, name`,
    [TARGET_COMPANY, slug]
  );
}

async function ensureDemoAdmin(client, companyId) {
  const { ownerId } = await seedBuiltinRoles(client, companyId);
  const username = DEMO_ADMIN_USERNAME;
  const existingUser = await one(
    client,
    'SELECT id, company_id FROM users WHERE username = $1 LIMIT 1',
    [username]
  );

  if (existingUser && existingUser.company_id !== companyId) {
    throw new Error(
      `Cannot seed demo admin "${username}" because that username belongs to another company. ` +
      'Set DEMO_ADMIN_USERNAME to a unique value for this environment.'
    );
  }

  const hash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
  if (existingUser) {
    return one(
      client,
      `UPDATE users
       SET password_hash = $1,
           full_name = 'Admin',
           first_name = 'Admin',
           last_name = NULL,
           role = 'admin',
           role_id = $2,
           email = $3,
           email_confirmed = true,
           active = true,
           timezone = COALESCE(timezone, 'America/Phoenix')
       WHERE id = $4
       RETURNING id, full_name`,
      [hash, ownerId || null, `${username}@example.test`, existingUser.id]
    );
  }

  return one(
    client,
    `INSERT INTO users
       (company_id, username, password_hash, full_name, first_name, last_name, role,
        role_id, email, email_confirmed, hourly_rate, rate_type, overtime_rule,
        worker_type, welcomed_at, active, timezone)
     VALUES ($1,$2,$3,'Admin','Admin',NULL,'admin',$4,$5,true,72,'hourly','daily','employee',NOW(),true,'America/Phoenix')
     RETURNING id, full_name`,
    [companyId, username, hash, ownerId || null, `${username}@example.test`]
  );
}

async function ensureDemoSettings(client, companyId) {
  const settings = {
    module_timeclock: '1',
    module_field: '1',
    module_projects: '1',
    module_inventory: '1',
    module_analytics: '1',
    module_team: '1',
    feature_scheduling: '1',
    feature_analytics: '1',
    feature_chat: '1',
    feature_prevailing_wage: '1',
    feature_reimbursements: '1',
    feature_pto: '1',
    feature_project_integration: '1',
    feature_overtime: '1',
    feature_geolocation: '1',
    feature_overtime_alerts: '1',
    feature_media_gallery: '1',
    feature_admin_edit_time: '1',
    feature_worker_edit_time: '1',
    show_worker_wages: '1',
    company_timezone: 'America/Phoenix',
    setup_questionnaire_completed_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(settings)) {
    await client.query(
      `INSERT INTO settings (company_id, key, value)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [companyId, key, value]
    );
  }
}

async function main() {
  const client = await pool.connect();
  const summary = {};
  try {
    await client.query('BEGIN');

    const company = await ensureDemoCompany(client);
    const companyId = company.id;
    await ensureDemoSettings(client, companyId);

    const admin = await ensureDemoAdmin(client, companyId);

    const peopleSeed = [
      ['riley.brooks', 'Riley Brooks', 'worker', 'riley.brooks@example.test', 36],
      ['morgan.diaz', 'Morgan Diaz', 'worker', 'morgan.diaz@example.test', 33],
      ['casey.nguyen', 'Casey Nguyen', 'worker', 'casey.nguyen@example.test', 34],
      ['samira.patel', 'Samira Patel', 'worker', 'samira.patel@example.test', 37],
      ['leo.martinez', 'Leo Martinez', 'worker', 'leo.martinez@example.test', 31],
      ['nora.bennett', 'Nora Bennett', 'worker', 'nora.bennett@example.test', 35],
      ['avery.johnson', 'Avery Johnson', 'admin', 'avery.johnson@example.test', 42],
      ['quinn.parker', 'Quinn Parker', 'worker', 'quinn.parker@example.test', 32],
    ];

    const users = [];
    for (const [username, fullName, role, email, rate] of peopleSeed) {
      const row = await ensureBy(
        client,
        'users',
        { username },
        {
          password_hash: 'demo-disabled-password',
          role,
          full_name: fullName,
          email,
          hourly_rate: rate,
          company_id: companyId,
          active: true,
          first_name: fullName.split(' ')[0],
          last_name: fullName.split(' ').slice(1).join(' '),
          welcomed_at: isoTimestamp(-12, 9),
        },
        'id, full_name, role'
      );
      users.push(row);
    }
    const existingUsers = await client.query(
      `SELECT id, full_name, role FROM users WHERE company_id = $1 AND active = true ORDER BY id`,
      [companyId]
    );
    const workers = existingUsers.rows.filter(u => u.role === 'worker').slice(0, 10);
    const admins = existingUsers.rows.filter(u => u.role !== 'worker');
    summary.users = existingUsers.rowCount;

    const clientSeed = [
      ['Cedar Learning Center', 'Elaine Foster', 'elaine.foster@example.test', '(555) 010-4102', 'Multi-site education operations'],
      ['Harbor Clinic Network', 'Dr. Mina Rowe', 'mina.rowe@example.test', '(555) 010-7240', 'Healthcare facilities and room readiness'],
      ['Sunset Retail Group', 'Jonas Whitaker', 'jonas.whitaker@example.test', '(555) 010-8831', 'Retail refreshes and store support'],
      ['Atlas Fleet Services', 'Cam Lopez', 'cam.lopez@example.test', '(555) 010-1928', 'Fleet equipment and dispatch operations'],
      ['Pineview HOA', 'Rachel Kim', 'rachel.kim@example.test', '(555) 010-6722', 'Community maintenance and resident support'],
    ];
    const clients = [];
    for (const [name, contactName, contactEmail, contactPhone, notes] of clientSeed) {
      clients.push(await ensureBy(
        client,
        'clients',
        { company_id: companyId, name },
        { contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone, notes, active: true },
        '*'
      ));
    }
    const allClients = await client.query('SELECT * FROM clients WHERE company_id = $1 ORDER BY id', [companyId]);
    summary.clients = allClients.rowCount;

    const projectSeed = [
      ['Cedar Learning Center Rollout', 'CLC-204', 'Cedar Learning Center', 320, 48500, 34, 'in_progress', 'Room readiness, tablet carts, signage, and handoff support.', '810 E Learning Loop, Mesa, AZ'],
      ['Harbor Clinic Room Turnover', 'HCN-118', 'Harbor Clinic Network', 210, 39200, 48, 'in_progress', 'Exam room refresh, stock staging, and safety walkthroughs.', '2212 S Harbor Way, Phoenix, AZ'],
      ['Sunset Retail Refresh', 'SRG-552', 'Sunset Retail Group', 160, 27400, 62, 'in_progress', 'Fixture reset, backroom organization, and overnight closeout.', '455 W Sunset Ave, Tempe, AZ'],
      ['Atlas Fleet Maintenance Cycle', 'AFS-330', 'Atlas Fleet Services', 240, 31200, 28, 'in_progress', 'Vehicle kit replenishment, inspections, and work bay coordination.', '1200 N Industrial Rd, Phoenix, AZ'],
      ['Pineview HOA Service Queue', 'PVH-019', 'Pineview HOA', 145, 19800, 18, 'in_progress', 'Resident requests, common area upkeep, and punch follow-up.', '77 Pineview Pkwy, Chandler, AZ'],
      ['Cactus Office Onboarding', 'COO-047', 'Mesa Facilities Co-op', 90, 13600, 82, 'completed', 'Office move support and final checklist closeout.', '501 E Main St, Mesa, AZ'],
      ['Riverpoint Equipment Reset', 'RER-411', 'Atlas Fleet Services', 130, 22100, 11, 'planning', 'Upcoming staging and replacement cycle.', '1880 Riverpoint Dr, Glendale, AZ'],
    ];
    const projects = [];
    for (const [name, job, clientName, hours, dollars, progress, status, description, address] of projectSeed) {
      const clientRow = allClients.rows.find(c => c.name === clientName) || allClients.rows[0];
      projects.push(await ensureBy(
        client,
        'projects',
        { company_id: companyId, name },
        {
          client_id: clientRow?.id || null,
          client_name: clientName,
          job_number: job,
          address,
          start_date: isoDate(-28),
          end_date: isoDate(45),
          description,
          status,
          progress_pct: progress,
          budget_hours: hours,
          budget_dollars: dollars,
          active: true,
        },
        '*'
      ));
    }
    const allProjects = await client.query('SELECT * FROM projects WHERE company_id = $1 AND active = true ORDER BY id', [companyId]);
    summary.projects = allProjects.rowCount;

    const projectByIndex = index => allProjects.rows[index % allProjects.rows.length];
    const workerByIndex = index => workers[index % workers.length] || admin;

    const fieldNotes = [
      ['Morning site check', 'Walked the primary work areas, confirmed access, and photographed the items that need owner review.', 'submitted'],
      ['Delivery received', 'Received staged materials, checked counts against the packing slip, and flagged one damaged carton.', 'submitted'],
      ['Client walkthrough notes', 'Client approved the main work area. Remaining notes are cosmetic and assigned to punchlist.', 'reviewed'],
      ['Access issue', 'South entrance was unavailable for two hours. Crew shifted to interior tasks until access reopened.', 'submitted'],
      ['End of day closeout', 'Cleaned work zones, secured loose materials, and uploaded photos for the gallery.', 'draft'],
      ['Quality check', 'Verified installed labels, room layouts, and inventory kit placement. Two labels need replacement.', 'reviewed'],
    ];
    for (let i = 0; i < 42; i++) {
      const [title, notes, status] = fieldNotes[i % fieldNotes.length];
      const project = projectByIndex(i);
      const worker = workerByIndex(i);
      const reportTitle = `${title} - ${project.job_number || project.name} ${isoDate(-Math.floor(i / 2))}`;
      const report = await ensureBy(
        client,
        'field_reports',
        { company_id: companyId, title: reportTitle },
        {
          user_id: worker.id,
          project_id: project.id,
          notes,
          status,
          lat: 33.4484 + (i % 6) / 1000,
          lng: -112.0740 - (i % 6) / 1000,
          report_date: isoDate(-Math.floor(i / 2)),
          reported_at: isoTimestamp(-Math.floor(i / 2), 8 + (i % 8), 15),
        },
        '*'
      );
      const photoCount = await one(client, 'SELECT COUNT(*)::int AS count FROM field_report_photos WHERE report_id = $1', [report.id]);
      if (photoCount.count === 0) {
        for (let p = 0; p < (i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1); p++) {
          await client.query(
            `INSERT INTO field_report_photos (report_id, url, caption, media_type, size_bytes)
             VALUES ($1,$2,$3,'photo',$4)`,
            [
              report.id,
              `https://picsum.photos/seed/opsfloa-field-${i}-${p}/1100/825`,
              ['Before view', 'Progress detail', 'Closeout photo', 'Material staging', 'Issue detail', 'Owner review'][p % 6],
              180000 + (i * 1000),
            ]
          );
        }
      }
    }

    for (let i = 0; i < 18; i++) {
      const project = projectByIndex(i);
      const date = isoDate(-i);
      const report = await ensureBy(
        client,
        'daily_reports',
        { company_id: companyId, project_id: project.id, report_date: date },
        {
          superintendent: (admins[i % admins.length] || admin).full_name,
          weather_condition: ['Clear', 'Partly cloudy', 'Windy', 'Hot', 'Light rain'][i % 5],
          weather_temp: [74, 78, 81, 88, 92][i % 5],
          work_performed: [
            'Completed setup, inventory staging, and owner walk-through items.',
            'Advanced task list, verified material counts, and closed two open notes.',
            'Completed safety huddle, equipment check, and phase handoff.',
          ][i % 3],
          delays_issues: i % 4 === 0 ? 'Late delivery moved one task to the next workday.' : null,
          visitor_log: i % 3 === 0 ? 'Client representative visited for progress review.' : null,
          status: ['draft', 'submitted', 'reviewed'][i % 3],
          created_by: admin.id,
        },
        '*'
      );
      await ensureChildRows(client, 'daily_report_manpower', 'report_id', report.id, [
        { trade: 'Operations', worker_count: 3 + (i % 3), hours: 22 + (i % 6), notes: 'Task execution and closeout support' },
        { trade: 'Support', worker_count: 1 + (i % 2), hours: 8 + (i % 4), notes: 'Stock staging and documentation' },
      ]);
      await ensureChildRows(client, 'daily_report_equipment', 'report_id', report.id, [
        { name: ['Service Van', 'Lift Cart', 'Tablet Kit'][i % 3], quantity: 1, hours: 5 + (i % 4) },
      ]);
      await ensureChildRows(client, 'daily_report_materials', 'report_id', report.id, [
        { description: ['Labels', 'Mounting hardware', 'Gloves', 'Filter cartridges'][i % 4], quantity: `${4 + i} units` },
      ]);
    }

    const punchTitles = [
      'Replace missing room label',
      'Confirm final shelf count',
      'Retouch scuffed panel',
      'Re-check access badge packet',
      'Move spare kit to secure storage',
      'Photograph completed bay',
      'Update closeout notes',
      'Verify client sign-off item',
      'Clean staging corner',
      'Add warning label to service cart',
      'Confirm route van bin labels',
      'Repair loose bracket',
    ];
    for (let i = 0; i < 24; i++) {
      const item = await ensureBy(
        client,
        'punchlist_items',
        { company_id: companyId, title: `${punchTitles[i % punchTitles.length]} ${i + 1}` },
        {
          project_id: projectByIndex(i).id,
          description: 'Demo punch item with enough detail to exercise wrapping, status chips, assignment, and mobile spacing.',
          location: ['Lobby', 'Back room', 'Suite 204', 'Vehicle bay', 'Storage cage', 'Common area'][i % 6],
          status: ['open', 'in_progress', 'resolved', 'verified'][i % 4],
          priority: ['low', 'normal', 'high', 'urgent'][i % 4],
          assigned_to: workerByIndex(i).id,
          created_by: admin.id,
          phase: ['Intake', 'Execution', 'Closeout'][i % 3],
          resolved_at: i % 4 >= 2 ? isoTimestamp(-i, 15, 30) : null,
        },
        '*'
      );
      await ensureChildRows(client, 'punchlist_checklist_items', 'punchlist_id', item.id, [
        { text: 'Take photo after correction', checked: i % 2 === 0, order_index: 1 },
        { text: 'Confirm with client contact', checked: i % 3 === 0, order_index: 2 },
      ]);
    }

    const incidents = [
      ['near_miss', 'Cart rolled into marked walkway before being chocked.', 'open'],
      ['first_aid', 'Minor scrape during unpacking. Cleaned and bandaged on site.', 'closed'],
      ['property_damage', 'Small wall mark found during closeout walk.', 'under_review'],
      ['other', 'Unauthorized access door was found propped open.', 'open'],
      ['recordable', 'Worker reported shoulder strain after lifting carton.', 'under_review'],
      ['lost_time', 'Worker sent home after medical evaluation.', 'closed'],
      ['near_miss', 'Temporary cord crossed a doorway before a cover strip was placed.', 'closed'],
      ['property_damage', 'Service cart clipped a corner guard during staging.', 'open'],
      ['first_aid', 'Worker washed dust from eye and returned to duty.', 'closed'],
      ['other', 'Visitor entered the work area before check-in was completed.', 'under_review'],
      ['near_miss', 'Loose shelf pin was found before loading stock.', 'open'],
      ['property_damage', 'Scuffed cabinet face found during room reset.', 'closed'],
      ['first_aid', 'Minor pinch while closing a cart latch.', 'closed'],
      ['other', 'Incorrect access badge packet was issued and recovered.', 'open'],
    ];
    for (let i = 0; i < incidents.length; i++) {
      const [type, description, status] = incidents[i];
      await ensureBy(
        client,
        'incident_reports',
        { company_id: companyId, description },
        {
          user_id: workerByIndex(i).id,
          project_id: projectByIndex(i).id,
          incident_date: isoDate(-i * 3),
          incident_time: `${8 + i}:20`,
          type,
          injured_name: type === 'first_aid' || type === 'recordable' || type === 'lost_time' ? workerByIndex(i).full_name : null,
          body_part: type === 'recordable' ? 'Shoulder' : type === 'first_aid' ? 'Hand' : null,
          treatment: type === 'first_aid' ? 'First aid kit' : type === 'recordable' || type === 'lost_time' ? 'Clinic evaluation' : null,
          work_stopped: type === 'lost_time',
          witnesses: i % 2 === 0 ? workerByIndex(i + 1).full_name : null,
          corrective_action: 'Reviewed procedure, documented follow-up, and assigned a corrective action.',
          status,
        },
        '*'
      );
    }

    for (let i = 0; i < 18; i++) {
      await ensureBy(
        client,
        'sub_reports',
        { company_id: companyId, project_id: projectByIndex(i).id, report_date: isoDate(-i - 1), sub_company: ['Brightline Support', 'Mesa Specialty Services', 'Cedar Tech Group', 'Northstar Access', 'Valley Finish Crew'][i % 5] },
        {
          foreman_name: ['Jamie Cole', 'Drew Allen', 'Mia Torres', 'Rene Holt', 'Priya Shah'][i % 5],
          headcount: 2 + (i % 7),
          work_performed: [
            'Completed assigned support scope and uploaded closeout notes.',
            'Staged materials, verified access, and finished assigned room list.',
            'Assisted with stock movement, cleanup, and client-facing touch-ups.',
            'Finished inspection support and returned unused materials to storage.',
          ][i % 4],
          notes: i % 3 === 0 ? 'Waiting on final owner direction for one item.' : i % 5 === 0 ? 'Crew will return tomorrow for a short follow-up.' : null,
          created_by: admin.id,
        },
        '*'
      );
    }

    for (let i = 0; i < 20; i++) {
      await ensureBy(
        client,
        'rfis',
        { company_id: companyId, project_id: projectByIndex(i).id, rfi_number: 100 + i },
        {
          subject: [
            'Confirm alternate mounting location',
            'Clarify room naming convention',
            'Approve equivalent stock item',
            'Confirm after-hours access window',
            'Confirm preferred closeout photo standard',
            'Approve temporary storage location',
            'Clarify owner-provided equipment handoff',
            'Confirm sequence for occupied rooms',
          ][i % 8],
          description: [
            'Demo RFI used to show status, due dates, responses, and project context.',
            'Please confirm the preferred approach before the team proceeds with this work block.',
            'The field team needs a written direction so the daily report and closeout notes match the owner expectation.',
          ][i % 3],
          directed_to: ['Client PM', 'Facilities Lead', 'Operations Contact', 'Owner Rep'][i % 4],
          submitted_by: admin.full_name,
          date_submitted: isoDate(-i - 4),
          date_due: isoDate(i % 5 === 0 ? -1 : 3 + i),
          response: i % 3 === 0 ? 'Approved as proposed.' : i % 4 === 0 ? 'Use the alternate shown in the field note photo.' : null,
          status: ['open', 'answered', 'closed'][i % 3],
          created_by: admin.id,
        },
        '*'
      );
    }

    const talks = [
      ['Heat readiness', 'Hydration, shade breaks, and buddy checks for warm workdays.'],
      ['Manual handling', 'Team lifting, cart use, and stopping when loads are awkward.'],
      ['Vehicle staging', 'Safe loading zones, cone placement, and route van visibility.'],
      ['Client access', 'Badge control, locked doors, and visitor handoff expectations.'],
      ['Housekeeping', 'Clear walk paths, cord control, and end-of-day cleanup.'],
      ['Photo documentation', 'Privacy-safe photos, useful captions, and closeout evidence.'],
    ];
    for (let i = 0; i < talks.length; i++) {
      const [title, content] = talks[i];
      const talk = await ensureBy(
        client,
        'safety_talks',
        { company_id: companyId, title },
        {
          project_id: projectByIndex(i).id,
          content,
          given_by: (admins[i % admins.length] || admin).full_name,
          talk_date: isoDate(-i * 2),
          created_by: admin.id,
          pass_threshold: 80,
        },
        '*'
      );
      const signoffCount = await one(client, 'SELECT COUNT(*)::int AS count FROM safety_talk_signoffs WHERE talk_id = $1', [talk.id]);
      if (signoffCount.count === 0) {
        for (const worker of workers.slice(0, 6)) {
          await client.query(
            `INSERT INTO safety_talk_signoffs (talk_id, worker_id, worker_name, signed_at, quiz_score, quiz_passed)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [talk.id, worker.id, worker.full_name, isoTimestamp(-i * 2, 9, 10), 82 + ((worker.id + i) % 18), true]
          );
        }
      }
    }

    const safetyChecklistTemplates = [
      {
        name: 'Opening Readiness Check',
        description: 'Start-of-day readiness for active work areas.',
        scope: 'general',
        items: [
          { label: 'Access path is open and clear', type: 'check', required: true },
          { label: 'Required supplies are staged', type: 'check', required: true },
          { label: 'Team has reviewed special instructions', type: 'check', required: true },
          { label: 'Opening notes', type: 'text', required: false },
        ],
      },
      {
        name: 'Vehicle and Kit Check',
        description: 'Quick verification for route vehicles, mobile kits, and job carts.',
        scope: 'general',
        items: [
          { label: 'Vehicle or cart is clean and ready', type: 'check', required: true },
          { label: 'Stock kit is complete', type: 'check', required: true },
          { label: 'Emergency supplies are present', type: 'check', required: true },
          { label: 'Mileage or kit notes', type: 'text', required: false },
        ],
      },
      {
        name: 'Closeout Walkthrough',
        description: 'End-of-day check before leaving the work area.',
        scope: 'general',
        items: [
          { label: 'Walkways are clear', type: 'check', required: true },
          { label: 'Tools and stock are secured', type: 'check', required: true },
          { label: 'Photos or notes were uploaded where needed', type: 'check', required: false },
          { label: 'Closeout notes', type: 'text', required: false },
        ],
      },
    ];
    const checklistTemplates = [];
    for (const tmpl of safetyChecklistTemplates) {
      checklistTemplates.push(await ensureBy(
        client,
        'safety_checklist_templates',
        { company_id: companyId, name: tmpl.name },
        {
          description: tmpl.description,
          scope: tmpl.scope,
          items: JSON.stringify(tmpl.items),
          created_by: admin.id,
        },
        '*'
      ));
    }
    for (let i = 0; i < 24; i++) {
      const template = checklistTemplates[i % checklistTemplates.length];
      const worker = workerByIndex(i);
      const checkDate = isoDate(-Math.floor(i / 2));
      await ensureBy(
        client,
        'safety_checklist_submissions',
        {
          company_id: companyId,
          template_id: template.id,
          project_id: projectByIndex(i).id,
          submitted_by: worker.id,
          check_date: checkDate,
        },
        {
          template_name: template.name,
          submitted_by_name: worker.full_name,
          answers: JSON.stringify({
            0: true,
            1: i % 7 !== 0,
            2: true,
            3: [
              'Ready for dispatch.',
              'One item restocked before work started.',
              'Closeout photos added to the field log.',
              'Follow-up assigned for the next shift.',
            ][i % 4],
          }),
          notes: i % 5 === 0 ? 'Demo note: one follow-up item was flagged for visibility.' : null,
        },
        '*'
      );
    }

    const inspectionTemplates = [
      {
        name: 'Work Area Readiness',
        description: 'General work area inspection for access, housekeeping, supplies, and readiness.',
        items: [
          { id: 'access-clear', label: 'Access path is clear', type: 'pass_fail' },
          { id: 'walkways-safe', label: 'Walkways are safe and unobstructed', type: 'pass_fail' },
          { id: 'materials-staged', label: 'Materials are staged correctly', type: 'pass_fail' },
          { id: 'lighting-ok', label: 'Lighting is adequate', type: 'pass_fail' },
          { id: 'readiness-score', label: 'Readiness score', type: 'number' },
          { id: 'inspector-note', label: 'Inspector note', type: 'text' },
        ],
      },
      {
        name: 'Vehicle and Mobile Kit Inspection',
        description: 'Inspection for vehicles, mobile kits, carts, and route equipment.',
        items: [
          { id: 'vehicle-clean', label: 'Vehicle or cart is clean', type: 'pass_fail' },
          { id: 'kit-stocked', label: 'Required kit stock is present', type: 'pass_fail' },
          { id: 'documents-current', label: 'Documents and tags are current', type: 'pass_fail' },
          { id: 'damage-check', label: 'No new damage found', type: 'pass_fail' },
          { id: 'odometer', label: 'Mileage or hour reading', type: 'number' },
          { id: 'kit-note', label: 'Kit notes', type: 'text' },
        ],
      },
      {
        name: 'Closeout Quality Review',
        description: 'End-of-day quality review for photos, labels, cleanup, and client-facing items.',
        items: [
          { id: 'photos-complete', label: 'Photos or evidence are complete', type: 'pass_fail' },
          { id: 'labels-correct', label: 'Labels and signage are correct', type: 'pass_fail' },
          { id: 'cleanup-complete', label: 'Cleanup is complete', type: 'pass_fail' },
          { id: 'client-items-closed', label: 'Client-facing items are closed', type: 'pass_fail' },
          { id: 'open-count', label: 'Open follow-up count', type: 'number' },
          { id: 'closeout-note', label: 'Closeout note', type: 'text' },
        ],
      },
      {
        name: 'Inventory Location Audit',
        description: 'Spot audit for stock rooms, carts, shelves, bins, and labeled storage areas.',
        items: [
          { id: 'bins-labeled', label: 'Bins and compartments are labeled', type: 'pass_fail' },
          { id: 'counts-match', label: 'Spot counts match expected stock', type: 'pass_fail' },
          { id: 'no-damaged-stock', label: 'No damaged stock found', type: 'pass_fail' },
          { id: 'reorder-visible', label: 'Reorder needs are visible', type: 'pass_fail' },
          { id: 'variance-count', label: 'Variance count', type: 'number' },
          { id: 'audit-note', label: 'Audit note', type: 'text' },
        ],
      },
    ];
    const inspectionTemplateRows = [];
    for (const tmpl of inspectionTemplates) {
      inspectionTemplateRows.push(await ensureBy(
        client,
        'inspection_templates',
        { company_id: companyId, name: tmpl.name },
        {
          description: tmpl.description,
          items: JSON.stringify(tmpl.items),
          created_by: null,
        },
        '*'
      ));
    }
    const templateItems = template => Array.isArray(template.items) ? template.items : JSON.parse(template.items || '[]');
    for (let i = 0; i < 32; i++) {
      const template = inspectionTemplateRows[i % inspectionTemplateRows.length];
      const items = templateItems(template);
      const project = projectByIndex(i);
      const hasFailure = i % 7 === 0;
      const pending = i % 11 === 0;
      const results = {};
      for (const item of items) {
        if (item.type === 'pass_fail') {
          results[item.id] = pending && item.id.includes('client')
            ? { value: null, note: 'Waiting on client contact.' }
            : hasFailure && Object.keys(results).length === 1
              ? { value: 'fail', note: 'Demo follow-up flagged for review.' }
              : { value: 'pass' };
        } else if (item.type === 'number') {
          results[item.id] = { value: String((i * 3) % 12) };
        } else {
          results[item.id] = {
            value: [
              'Looks ready for the next work block.',
              'Minor cleanup note added for visibility.',
              'Client-facing area reviewed and documented.',
              'Stock and labels checked during walkthrough.',
            ][i % 4],
          };
        }
      }
      await ensureBy(
        client,
        'inspections',
        { company_id: companyId, name: `${template.name} - ${project.job_number || project.name} ${isoDate(-Math.floor(i / 2))}` },
        {
          template_id: template.id,
          project_id: null,
          inspector: (admins[i % admins.length] || admin).full_name,
          location: `${project.name} - ${['Front area', 'Back room', 'Vehicle bay', 'Supply room', 'Suite 204', 'Common area'][i % 6]}`,
          notes: hasFailure
            ? 'One demo issue was left open so fail-state cards have realistic content.'
            : pending
              ? 'Inspection started; one response is pending confirmation.'
              : 'Inspection complete with no blocking issues.',
          results: JSON.stringify(results),
          status: pending ? 'pending' : hasFailure ? 'fail' : 'pass',
          inspected_at: isoDate(-Math.floor(i / 2)),
          created_by: null,
        },
        '*'
      );
    }

    const equipmentSeed = [
      ['Route Van 14', 'Vehicle', 'VAN-014', 500],
      ['Route Van 22', 'Vehicle', 'VAN-022', 500],
      ['Lift Cart A', 'Material handling', 'LC-A', 250],
      ['Portable Label Printer', 'Tooling', 'LBL-03', 300],
      ['Tablet Kit 5', 'Technology', 'TAB-05', 200],
      ['Service Trailer 2', 'Trailer', 'TRL-02', 750],
      ['Floor Scrubber', 'Cleaning', 'FS-01', 400],
      ['Inspection Camera', 'Technology', 'CAM-09', 150],
      ['Mobile Supply Cart', 'Material handling', 'MSC-04', 275],
      ['Portable Work Light Set', 'Tooling', 'LGT-02', 220],
      ['Route Van 31', 'Vehicle', 'VAN-031', 500],
      ['Inventory Scanner Pair', 'Technology', 'SCAN-02', 180],
    ];
    const equipment = [];
    for (const [name, type, unit, interval] of equipmentSeed) {
      equipment.push(await ensureBy(
        client,
        'equipment_items',
        { company_id: companyId, name },
        { type, unit_number: unit, maintenance_interval_hours: interval, notes: 'Seeded demo equipment for visual testing.', active: true },
        '*'
      ));
    }
    for (let i = 0; i < 60; i++) {
      const eq = equipment[i % equipment.length];
      await ensureBy(
        client,
        'equipment_hours',
        { company_id: companyId, equipment_id: eq.id, log_date: isoDate(-i), operator_name: workerByIndex(i).full_name },
        {
          project_id: projectByIndex(i).id,
          hours: 1.5 + (i % 7),
          notes: ['Delivery support', 'Inspection run', 'Material staging', 'Closeout support'][i % 4],
          created_by: admin.id,
        },
        '*'
      );
    }

    const locationSeed = [
      ['Mesa Job Closet', 'job_site', projectByIndex(1).id, 'On-site consumables and small equipment.'],
      ['Clinic North Supply Room', 'job_site', projectByIndex(4).id, 'Controlled room stock for clinic turnover.'],
      ['Retail Night Cart', 'truck', projectByIndex(5).id, 'Mobile cart for after-hours store work.'],
      ['Central Overflow', 'warehouse', null, 'Overflow and slow-moving inventory.'],
    ];
    const locations = [];
    for (const [name, type, projectId, notes] of locationSeed) {
      locations.push(await ensureBy(
        client,
        'inventory_locations',
        { company_id: companyId, name },
        { type, project_id: projectId, notes, active: true, address: 'Phoenix metro area' },
        '*'
      ));
    }
    const allLocations = await client.query('SELECT * FROM inventory_locations WHERE company_id = $1 AND active = true ORDER BY id', [companyId]);

    const binMap = [];
    for (const loc of allLocations.rows.slice(0, 5)) {
      const area = await ensureBy(client, 'inventory_areas', { company_id: companyId, location_id: loc.id, name: 'Main Area' }, { notes: 'Primary storage area.' }, '*');
      const rack = await ensureBy(client, 'inventory_racks', { company_id: companyId, area_id: area.id, name: 'Rack A' }, { notes: 'Fast-moving stock.' }, '*');
      const bay = await ensureBy(client, 'inventory_bays', { company_id: companyId, rack_id: rack.id, name: `Bay ${1 + (loc.id % 3)}` }, { notes: 'Seeded bay.' }, '*');
      const compartment = await ensureBy(client, 'inventory_compartments', { company_id: companyId, bay_id: bay.id, name: `Compartment ${String.fromCharCode(65 + (loc.id % 4))}` }, { notes: 'Seeded compartment.' }, '*');
      binMap.push({ location_id: loc.id, area_id: area.id, rack_id: rack.id, bay_id: bay.id, compartment_id: compartment.id });
    }

    const supplierSeed = [
      ['Apex Facilities Supply', 'Marin Gray', '(555) 010-3401', 'orders@apex.example.test'],
      ['Summit Safety Co.', 'Peter Shaw', '(555) 010-1180', 'sales@summit.example.test'],
      ['BlueLine Hardware', 'Ivy Chen', '(555) 010-5068', 'team@blueline.example.test'],
    ];
    const suppliers = [];
    for (const [name, contactName, phone, email] of supplierSeed) {
      suppliers.push(await ensureBy(
        client,
        'inventory_suppliers',
        { company_id: companyId, name },
        { contact_name: contactName, phone, email, notes: 'Demo supplier.', active: true },
        '*'
      ));
    }

    const inventorySeed = [
      ['Access Badge Sleeve', 'BADGE-SLV', 'Office', 'each', 1.2, 25, 100],
      ['Sanitizer Refill Pack', 'SAN-REF-1L', 'Healthcare', 'case', 42.5, 6, 12],
      ['Shelf Label Roll', 'LBL-ROLL', 'Retail', 'roll', 18.75, 10, 24],
      ['Cord Cover Strip', 'CORD-CVR-6', 'Safety', 'each', 9.85, 8, 20],
      ['Tablet Charging Cable', 'USB-C-10', 'Technology', 'each', 7.25, 20, 50],
      ['Work Order Clipboard', 'CLIP-WO', 'Office', 'each', 5.5, 10, 30],
      ['Caution Floor Sign', 'SIGN-WET', 'Safety', 'each', 14.2, 5, 12],
      ['Door Stop Kit', 'DOOR-STP', 'Hardware', 'kit', 12.95, 6, 18],
      ['Cleaning Cloth Bundle', 'CLOTH-MF', 'Cleaning', 'pack', 16.4, 12, 30],
      ['Exam Room Bin', 'BIN-EXAM', 'Healthcare', 'each', 22.75, 8, 16],
      ['Retail Fixture Hook', 'HOOK-FIX', 'Retail', 'box', 27.9, 7, 14],
      ['Route Van First Aid Refill', 'FA-REFILL', 'Safety', 'kit', 31.5, 4, 10],
      ['Battery Pack', 'BAT-10K', 'Technology', 'each', 24, 5, 12],
      ['Floor Tape Yellow', 'TAPE-YEL', 'Safety', 'roll', 11.2, 9, 24],
      ['Service Request Door Tag', 'TAG-SR', 'Office', 'pack', 8.4, 15, 40],
      ['Replacement Air Filter', 'AIR-FLT-20', 'Maintenance', 'each', 19.95, 10, 30],
      ['Small Parts Organizer', 'ORG-SM', 'Hardware', 'each', 13.6, 8, 20],
      ['Nitrile Gloves Large', 'GLV-NTR-L', 'Safety', 'box', 12.75, 10, 30],
      ['Desk Cable Tray', 'TRAY-CBL', 'Office', 'each', 17.35, 6, 18],
      ['Inspection Tag Green', 'TAG-INSP-G', 'Compliance', 'pack', 6.2, 12, 36],
    ];
    const invItems = [];
    for (const [name, sku, category, unit, cost, reorderPoint, reorderQty] of inventorySeed) {
      invItems.push(await ensureBy(
        client,
        'inventory_items',
        { company_id: companyId, sku },
        {
          name,
          description: `${category} demo item for inventory table density and filtering.`,
          category,
          unit,
          unit_cost: cost,
          reorder_point: reorderPoint,
          reorder_qty: reorderQty,
          active: true,
          created_by: admin.id,
        },
        '*'
      ));
    }
    const itemBySku = Object.fromEntries(invItems.map(item => [item.sku, item]));
    const uomSeed = [
      ['SAN-REF-1L', 'bottle', '1 liter', 0.25],
      ['LBL-ROLL', 'case', '12 rolls', 12],
      ['USB-C-10', 'pack', '10 cables', 10],
      ['CLOTH-MF', 'case', '6 packs', 6],
      ['GLV-NTR-L', 'case', '10 boxes', 10],
      ['TAG-SR', 'case', '20 packs', 20],
      ['TAPE-YEL', 'case', '24 rolls', 24],
      ['BADGE-SLV', 'pack', '100 sleeves', 100],
    ];
    for (const [sku, unit, unitSpec, factor] of uomSeed) {
      const item = itemBySku[sku];
      if (!item) continue;
      await ensureBy(
        client,
        'inventory_item_uoms',
        { company_id: companyId, item_id: item.id, unit, unit_spec: unitSpec },
        { factor, is_base: false, active: true },
        '*'
      );
    }
    if (itemBySku['SAN-REF-1L']) {
      await client.query(
        `UPDATE inventory_item_uoms
         SET active = false
         WHERE company_id = $1
           AND item_id = $2
           AND unit = 'each'
           AND unit_spec = '1 liter bottle'`,
        [companyId, itemBySku['SAN-REF-1L'].id]
      );
    }
    const allItems = await client.query('SELECT * FROM inventory_items WHERE company_id = $1 AND active = true ORDER BY id', [companyId]);
    for (let i = 0; i < allItems.rows.length; i++) {
      const item = allItems.rows[i];
      const primary = binMap[i % binMap.length];
      const secondary = binMap[(i + 2) % binMap.length];
      await upsertStock(client, { company_id: companyId, item_id: item.id, location_id: primary.location_id, quantity: 3 + ((i * 7) % 64), ...primary });
      if (i % 2 === 0) {
        await upsertStock(client, { company_id: companyId, item_id: item.id, location_id: secondary.location_id, quantity: 1 + ((i * 5) % 34), ...secondary });
      }
    }

    for (let i = 0; i < 70; i++) {
      const item = allItems.rows[i % allItems.rows.length];
      const locA = allLocations.rows[i % allLocations.rows.length];
      const locB = allLocations.rows[(i + 1) % allLocations.rows.length];
      const type = ['receive', 'issue', 'transfer', 'adjust'][i % 4];
      await ensureBy(
        client,
        'inventory_transactions',
        { company_id: companyId, reference_no: `DEMO-TXN-${String(i + 1).padStart(3, '0')}` },
        {
          type,
          item_id: item.id,
          quantity: type === 'issue' ? -(1 + (i % 6)) : 1 + (i % 12),
          from_location_id: type === 'receive' ? null : locA.id,
          to_location_id: type === 'issue' ? null : locB.id,
          project_id: type === 'issue' ? projectByIndex(i).id : null,
          performed_by: workerByIndex(i).id,
          notes: ['Cycle replenish', 'Project issue', 'Location transfer', 'Count adjustment'][i % 4],
          unit_cost: item.unit_cost || null,
          supplier_id: suppliers[i % suppliers.length]?.id || null,
          lot_number: i % 3 === 0 ? `LOT-${202600 + i}` : null,
          created_at: isoTimestamp(-Math.floor(i / 3), 9 + (i % 8), (i * 7) % 60),
        },
        '*'
      );
    }

    for (let i = 0; i < 5; i++) {
      const po = await ensureBy(
        client,
        'purchase_orders',
        { company_id: companyId, po_number: `DEMO-PO-${String(i + 1).padStart(3, '0')}` },
        {
          supplier_id: suppliers[i % suppliers.length]?.id || null,
          status: ['draft', 'submitted', 'partial', 'received', 'cancelled'][i % 5],
          order_date: isoDate(-12 + i),
          expected_date: isoDate(4 + i),
          to_location_id: allLocations.rows[i % allLocations.rows.length].id,
          notes: 'Seeded demo PO with multiple line states.',
          reference_no: `REF-${9000 + i}`,
          created_by: admin.id,
          submitted_at: i > 0 ? isoTimestamp(-10 + i, 11, 0) : null,
          received_at: i === 3 ? isoTimestamp(-2, 14, 30) : null,
        },
        '*'
      );
      await ensureChildRows(client, 'purchase_order_lines', 'po_id', po.id, [
        { item_id: allItems.rows[(i * 2) % allItems.rows.length].id, qty_ordered: 12 + i, qty_received: i >= 2 ? 8 + i : 0, unit_cost: allItems.rows[(i * 2) % allItems.rows.length].unit_cost || 10, notes: 'Primary replenishment' },
        { item_id: allItems.rows[(i * 2 + 1) % allItems.rows.length].id, qty_ordered: 6 + i, qty_received: i === 3 ? 6 + i : 0, unit_cost: allItems.rows[(i * 2 + 1) % allItems.rows.length].unit_cost || 10, notes: 'Secondary stock' },
      ]);
    }

    const countSeed = [
      { label: 'Phoenix depot cycle count', count_type: 'cycle', status: 'completed', location: 0, started: -9, completed: -8, counted: 7, total: 7 },
      { label: 'North route van audit', count_type: 'audit', status: 'in_progress', location: 1, started: -3, completed: null, counted: 4, total: 8 },
      { label: 'Clinic supply room reconcile', count_type: 'reconcile', status: 'draft', location: 2, started: -1, completed: null, counted: 0, total: 6 },
    ];
    for (let i = 0; i < countSeed.length; i++) {
      const seed = countSeed[i];
      const loc = allLocations.rows[seed.location % allLocations.rows.length];
      const count = await ensureBy(
        client,
        'inventory_cycle_counts',
        { company_id: companyId, notes: `Demo count: ${seed.label}` },
        {
          location_id: loc.id,
          count_type: seed.count_type,
          status: seed.status,
          started_by: admin.id,
          completed_by: seed.completed ? admin.id : null,
          started_at: isoTimestamp(seed.started, 8, 15 + i * 10),
          completed_at: seed.completed ? isoTimestamp(seed.completed, 15, 30) : null,
        },
        '*'
      );
      await client.query(
        `UPDATE inventory_cycle_counts
         SET location_id=$1, count_type=$2, status=$3, started_by=$4,
             completed_by=$5, started_at=$6, completed_at=$7
         WHERE id=$8`,
        [
          loc.id,
          seed.count_type,
          seed.status,
          admin.id,
          seed.completed ? admin.id : null,
          isoTimestamp(seed.started, 8, 15 + i * 10),
          seed.completed ? isoTimestamp(seed.completed, 15, 30) : null,
          count.id,
        ]
      );
      const stockRows = await client.query(
        `SELECT item_id, location_id, quantity, uom_id
         FROM inventory_stock
         WHERE company_id=$1 AND location_id=$2
         ORDER BY item_id
         LIMIT $3`,
        [companyId, loc.id, seed.total]
      );
      const lines = stockRows.rows.map((row, index) => {
        const expected = parseFloat(row.quantity || 0);
        const isCounted = index < seed.counted;
        const counted = isCounted ? expected + ([0, 1, -1, 0.5][index % 4]) : null;
        return {
          item_id: row.item_id,
          location_id: row.location_id,
          expected_qty: expected,
          counted_qty: counted,
          counted_by: isCounted ? workerByIndex(index).id : null,
          counted_at: isCounted ? isoTimestamp(seed.started + 1, 10 + (index % 4), (index * 9) % 60) : null,
          stock_uom_id: row.uom_id || null,
          counted_uom_id: row.uom_id || null,
          line_status: isCounted ? 'accepted' : 'pending',
          notes: isCounted ? 'Seeded demo count entry.' : null,
        };
      });
      await ensureChildRows(client, 'inventory_cycle_count_lines', 'cycle_count_id', count.id, lines);
      await client.query(
        `INSERT INTO inventory_count_workers (cycle_count_id, user_id, roles)
         VALUES ($1,$2,$3),($1,$4,$5)
         ON CONFLICT (cycle_count_id, user_id) DO UPDATE SET roles=EXCLUDED.roles`,
        [count.id, workerByIndex(i).id, ['counter'], workerByIndex(i + 1).id, ['auditor', 'reconciler']]
      );
    }

    for (let day = -12; day <= -1; day++) {
      for (let i = 0; i < Math.min(8, workers.length); i++) {
        if ((day + i) % 5 === 0) continue;
        const startHour = 7 + (i % 3);
        const duration = 7 + ((i + Math.abs(day)) % 3);
        const status = (day + i) % 4 === 0 ? 'pending' : 'approved';
        await ensureBy(
          client,
          'time_entries',
          { company_id: companyId, user_id: workers[i].id, work_date: isoDate(day), start_time: `${String(startHour).padStart(2, '0')}:00:00` },
          {
            project_id: projectByIndex(i + Math.abs(day)).id,
            end_time: `${String(startHour + duration).padStart(2, '0')}:00:00`,
            wage_type: 'regular',
            rate: 30 + (i % 6),
            notes: ['Demo work block', 'Travel and staging', 'Closeout support', 'Field task execution'][i % 4],
            status,
            approved_by: status === 'approved' ? admin.id : null,
            approved_at: status === 'approved' ? isoTimestamp(day, 17, 20) : null,
            break_minutes: i % 2 === 0 ? 30 : 0,
            mileage: i % 3 === 0 ? 12 + i : null,
            clock_source: i % 4 === 0 ? 'admin' : 'worker',
            clocked_in_by: i % 4 === 0 ? admin.id : null,
            start_ts: isoTimestamp(day, startHour, 0),
            end_ts: isoTimestamp(day, startHour + duration, 0),
          },
          '*'
        );
      }
    }

    for (let i = 0; i < Math.min(3, workers.length); i++) {
      await ensureBy(
        client,
        'active_clock',
        { company_id: companyId, user_id: workers[i].id },
        {
          project_id: projectByIndex(i).id,
          clock_in_time: isoTimestamp(0, 7 + i, 15),
          work_date: isoDate(0),
          notes: ['Route prep', 'Clinic turnover', 'Inventory staging'][i % 3],
          timezone: 'America/Phoenix',
          clock_source: 'worker',
          current_lat: 33.45 + (i / 100),
          current_lng: -112.07 - (i / 100),
          location_updated_at: isoTimestamp(0, 10 + i, 5),
        },
        '*'
      );
    }

    for (let i = 0; i < 18; i++) {
      await ensureBy(
        client,
        'shifts',
        { company_id: companyId, user_id: workerByIndex(i).id, shift_date: isoDate(i + 1), start_time: `${String(7 + (i % 3)).padStart(2, '0')}:00:00` },
        {
          project_id: projectByIndex(i).id,
          end_time: `${String(15 + (i % 3)).padStart(2, '0')}:30:00`,
          notes: ['Demo scheduled shift', 'Route support', 'Closeout day', 'Inventory count'][i % 4],
          start_ts: isoTimestamp(i + 1, 7 + (i % 3), 0),
          end_ts: isoTimestamp(i + 1, 15 + (i % 3), 30),
        },
        '*'
      );
    }

    const timeOffSeed = [
      [0, 'vacation', 9, 11, 'Family trip'],
      [1, 'sick', -2, -2, 'Doctor visit'],
      [2, 'personal', 4, 4, 'Appointment'],
      [3, 'vacation', 18, 20, 'Long weekend'],
      [4, 'other', 6, 7, 'School event'],
      [5, 'sick', 13, 13, 'Medical follow-up'],
    ];
    for (let i = 0; i < timeOffSeed.length; i++) {
      const [workerIndex, type, start, end, note] = timeOffSeed[i];
      await ensureBy(
        client,
        'time_off_requests',
        { company_id: companyId, user_id: workerByIndex(workerIndex).id, start_date: isoDate(start), end_date: isoDate(end) },
        {
          type,
          note,
          status: ['pending', 'approved', 'denied'][i % 3],
          reviewed_by: i % 3 === 0 ? null : admin.id,
          review_note: i % 3 === 1 ? 'Approved for demo schedule.' : i % 3 === 2 ? 'Coverage already committed.' : null,
          reviewed_at: i % 3 === 0 ? null : isoTimestamp(-1, 14, 0),
        },
        '*'
      );
    }

    const reimbursements = [
      ['Mileage to clinic pickup', 'mileage', 28.75, -1, 50],
      ['Parking for client walkthrough', 'travel', 16, -3, null],
      ['Replacement labels purchased locally', 'materials', 34.8, -5, null],
      ['After-hours meal during retail closeout', 'meal', 18.25, -7, null],
      ['Fuel for route van', 'fuel', 52.1, -8, null],
      ['Small hardware receipt', 'materials', 22.4, -10, null],
    ];
    for (let i = 0; i < reimbursements.length; i++) {
      const [description, category, amount, dateOffset, miles] = reimbursements[i];
      await ensureBy(
        client,
        'reimbursements',
        { company_id: companyId, user_id: workerByIndex(i).id, description },
        {
          amount,
          category,
          expense_date: isoDate(dateOffset),
          status: ['pending', 'approved', 'rejected'][i % 3],
          admin_notes: i % 3 === 1 ? 'Approved in demo review.' : null,
          project_id: projectByIndex(i).id,
          miles,
          mileage_rate: miles ? 0.575 : null,
        },
        '*'
      );
    }

    const requestSeed = [
      ['Amanda West', 'Facilities help', 'Need help reorganizing the supply area before staff training.', 'new'],
      ['Ben Ortega', 'Repair', 'Door hardware is sticking and needs service this week.', 'in_review'],
      ['Maya Reed', 'New work', 'Requesting a quote for room setup and signage.', 'converted'],
      ['Victor Hall', 'Maintenance', 'Common area lights need inspection after the weekend.', 'new'],
      ['Tessa Grant', 'Other', 'Please confirm options for recurring weekly support.', 'declined'],
    ];
    for (let i = 0; i < requestSeed.length; i++) {
      const [name, category, description, status] = requestSeed[i];
      await ensureBy(
        client,
        'service_requests',
        { company_id: companyId, requester_name: name, description },
        {
          client_id: allClients.rows[i % allClients.rows.length]?.id || null,
          requester_email: `${name.toLowerCase().replace(/ /g, '.')}@example.test`,
          requester_phone: `(555) 010-${7000 + i}`,
          requester_address: `${100 + i} Demo Ave, Phoenix, AZ`,
          category,
          status,
          admin_notes: i % 2 === 0 ? 'Seeded request for demo review.' : null,
          converted_project_id: status === 'converted' ? projectByIndex(i).id : null,
          reviewed_by: status !== 'new' ? admin.id : null,
          reviewed_at: status !== 'new' ? isoTimestamp(-i, 13, 15) : null,
        },
        '*'
      );
    }

    await client.query('COMMIT');

    const countTables = [
      'users', 'clients', 'projects', 'field_reports', 'daily_reports', 'punchlist_items',
      'incident_reports', 'sub_reports', 'rfis', 'safety_talks', 'safety_checklist_templates',
      'safety_checklist_submissions', 'inspection_templates', 'inspections', 'equipment_items',
      'inventory_items', 'inventory_stock', 'inventory_transactions', 'purchase_orders', 'inventory_cycle_counts',
      'time_entries', 'active_clock', 'shifts', 'time_off_requests', 'reimbursements', 'service_requests',
    ];
    for (const table of countTables) {
      const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE company_id = $1`, [companyId]);
      summary[table] = result.rows[0].count;
    }
    const photos = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM field_report_photos ph
       JOIN field_reports r ON r.id = ph.report_id
       WHERE r.company_id = $1`,
      [companyId]
    );
    summary.field_report_photos = photos.rows[0].count;
    console.log(JSON.stringify({ company: company.name, summary }, null, 2));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
