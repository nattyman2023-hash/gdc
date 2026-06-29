/**
 * Seed: CRM sample data — leads, applications, invoices and notes.
 * Runs after users (04) and LMS (05) seeds.
 */
exports.seed = async function (knex) {
  await knex('crm_notes').del();
  await knex('invoices').del();
  await knex('leads').del();
  await knex('applications').del();
  await knex('application_fees').del();

  const programs = await knex('programs').orderBy('id');
  const pid = (slug) => {
    const p = programs.find((x) => x.slug === slug);
    return p ? p.id : (programs[0] && programs[0].id) || null;
  };
  const staff = await knex('users').where({ role: 'staff' }).first();
  const student = await knex('users').where({ email: process.env.SEED_STUDENT_EMAIL || 'student@gdcu.edu' }).first();

  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  const daysAhead = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // ─── Leads ─────────────────────────────────────────────────
  await knex('leads').insert([
    { first_name: 'Amina', last_name: 'Hassan', email: 'amina.h@example.com', phone: '+254700111222', country: 'Kenya', program_id: pid('msc-global-leadership'), interest: 'Leadership', source: 'request_info', status: 'new', assigned_to: staff ? staff.id : null, created_at: daysAgo(1), updated_at: daysAgo(1) },
    { first_name: 'David', last_name: 'Okoro', email: 'david.okoro@example.com', phone: '+2348030001111', country: 'Nigeria', program_id: pid('mba-faith-led-business') || pid('msc-business-administration'), interest: 'Business', source: 'request_info', status: 'contacted', assigned_to: staff ? staff.id : null, created_at: daysAgo(3), updated_at: daysAgo(2) },
    { first_name: 'Sofia', last_name: 'Mensah', email: 'sofia.m@example.com', country: 'Ghana', program_id: pid('ma-postcolonial-theology'), interest: 'Theology', source: 'request_info', status: 'qualified', created_at: daysAgo(6), updated_at: daysAgo(4) },
    { first_name: 'John', last_name: 'Banda', email: 'john.banda@example.com', phone: '+260970000000', country: 'Zambia', program_id: pid('diploma-church-leadership'), interest: 'Ministry', source: 'request_info', status: 'nurturing', created_at: daysAgo(10), updated_at: daysAgo(7) },
    { first_name: 'Mary', last_name: 'Achieng', email: 'mary.a@example.com', country: 'Kenya', program_id: pid('certificate-diaspora-mission'), source: 'request_info', status: 'converted', created_at: daysAgo(20), updated_at: daysAgo(15) },
    { first_name: 'Peter', last_name: 'Nkosi', email: 'peter.n@example.com', country: 'South Africa', program_id: pid('ba-theology-ministry'), source: 'request_info', status: 'lost', created_at: daysAgo(30), updated_at: daysAgo(22) },
  ]);

  const leadRows = await knex('leads').orderBy('id');
  if (leadRows[0]) {
    await knex('crm_notes').insert([
      { entity_type: 'lead', entity_id: leadRows[0].id, author_name: staff ? `${staff.first_name} ${staff.last_name}` : 'Staff', body: 'Left a voicemail and sent the prospectus by email.', created_at: daysAgo(1) },
      { entity_type: 'lead', entity_id: leadRows[1].id, author_name: 'Grace Admissions', body: 'Spoke on the phone — very interested, wants instalment options.', created_at: daysAgo(2) },
    ]);
  }

  // ─── Applications ──────────────────────────────────────────
  const apps = [
    { reference: 'GDCU-2026-AP001', program_id: pid('msc-global-leadership'), first_name: 'Daniel', last_name: 'Otieno', email: 'daniel.otieno@example.com', phone: '+254712000000', country: 'Kenya', intake: 'September 2026', status: 'new', payment_status: 'paid', created_at: daysAgo(2), updated_at: daysAgo(2) },
    { reference: 'GDCU-2026-AP002', program_id: pid('ma-postcolonial-theology'), first_name: 'Esther', last_name: 'Abebe', email: 'esther.abebe@example.com', country: 'Ethiopia', intake: 'September 2026', status: 'in_review', payment_status: 'paid', created_at: daysAgo(5), updated_at: daysAgo(3) },
    { reference: 'GDCU-2026-AP003', program_id: pid('diploma-church-leadership'), first_name: 'Samuel', last_name: 'Kofi', email: 'samuel.kofi@example.com', country: 'Ghana', intake: 'January 2027', status: 'interview', payment_status: 'paid', created_at: daysAgo(8), updated_at: daysAgo(4) },
    { reference: 'GDCU-2026-AP004', program_id: pid('ba-theology-ministry'), first_name: 'Ruth', last_name: 'Mwale', email: 'ruth.mwale@example.com', country: 'Malawi', intake: 'September 2026', status: 'offer', payment_status: 'paid', created_at: daysAgo(12), updated_at: daysAgo(6) },
  ];
  await knex('applications').insert(apps);

  const appRows = await knex('applications').orderBy('id');
  if (appRows[1]) {
    await knex('crm_notes').insert([
      { entity_type: 'application', entity_id: appRows[1].id, author_name: 'Admissions', body: 'References received and verified. Ready for academic review.', created_at: daysAgo(3) },
      { entity_type: 'application', entity_id: appRows[2].id, author_name: 'Admissions', body: 'Interview scheduled for next week.', created_at: daysAgo(4) },
    ]);
  }

  // ─── Invoices for the demo student (tuition instalments) ───
  if (student) {
    const program = programs.find((p) => p.slug === 'diploma-church-leadership') || programs[0];
    const total = program ? Number(program.tuition) : 2800;
    const per = Math.round((total / 4) * 100) / 100;
    await knex('invoices').insert([
      { reference: 'INV-2026-0001', user_id: student.id, program_id: program ? program.id : null, description: `${program ? program.title : 'Tuition'} — Instalment 1 of 4`, amount: per, currency: 'GBP', due_date: daysAhead(-20), installment_no: 1, installment_total: 4, status: 'paid', payment_method: 'card', paid_at: daysAgo(18) },
      { reference: 'INV-2026-0002', user_id: student.id, program_id: program ? program.id : null, description: `${program ? program.title : 'Tuition'} — Instalment 2 of 4`, amount: per, currency: 'GBP', due_date: daysAhead(10), installment_no: 2, installment_total: 4, status: 'sent' },
      { reference: 'INV-2026-0003', user_id: student.id, program_id: program ? program.id : null, description: `${program ? program.title : 'Tuition'} — Instalment 3 of 4`, amount: per, currency: 'GBP', due_date: daysAhead(40), installment_no: 3, installment_total: 4, status: 'sent' },
      { reference: 'INV-2026-0004', user_id: student.id, program_id: program ? program.id : null, description: `${program ? program.title : 'Tuition'} — Instalment 4 of 4`, amount: per, currency: 'GBP', due_date: daysAhead(70), installment_no: 4, installment_total: 4, status: 'sent' },
    ]);
  }

  // eslint-disable-next-line no-console
  console.log('\n  Seeded CRM sample data (leads, applications, invoices, notes)\n');
};
