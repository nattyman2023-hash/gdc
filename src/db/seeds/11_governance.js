/**
 * Seed: budget lines, governance documents, board members, sample payroll.
 */
exports.seed = async function (knex) {
  await knex('payroll_entries').del();
  await knex('budget_lines').del();
  await knex('governance_documents').del();
  await knex('board_members').del();

  await knex('budget_lines').insert([
    { fiscal_year: '2026', category: 'Faculty & Teaching', description: 'Salaries and teaching delivery', allocated: 180000, spent: 96000, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { fiscal_year: '2026', category: 'Technology & LMS', description: 'Platform, hosting and tools', allocated: 35000, spent: 21000, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { fiscal_year: '2026', category: 'Student Support & Scholarships', description: 'Bursaries and welfare', allocated: 60000, spent: 28500, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { fiscal_year: '2026', category: 'Marketing & Recruitment', description: 'Campaigns and outreach', allocated: 25000, spent: 17800, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { fiscal_year: '2026', category: 'Operations & Admin', description: 'Running costs', allocated: 40000, spent: 19200, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  await knex('governance_documents').insert([
    { title: 'Academic Integrity Policy', category: 'Policy', doc_type: 'Link', url: 'https://example.com/policies/academic-integrity', review_date: '2027-01-01', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Safeguarding Policy', category: 'Policy', doc_type: 'Link', url: 'https://example.com/policies/safeguarding', review_date: '2026-09-01', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Data Protection & Privacy Statement', category: 'Legal', doc_type: 'Link', url: 'https://example.com/legal/privacy', review_date: '2027-05-01', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Board Minutes — Q1 2026', category: 'Minutes', doc_type: 'Link', url: 'https://example.com/board/minutes-q1', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Annual Quality Assurance Report', category: 'Report', doc_type: 'Link', url: 'https://example.com/reports/qa-2025', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  await knex('board_members').insert([
    { name: 'Rev. Dr. Samuel Adeyemi', role: 'Chair of the Board', bio: 'Provides strategic and spiritual oversight of the University.', sort_order: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { name: 'Mrs. Grace Whitfield', role: 'Vice-Chair & Treasurer', bio: 'Oversees financial stewardship and audit.', sort_order: 2, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { name: 'Prof. Daniel Mwangi', role: 'Academic Governance', bio: 'Chairs the academic standards committee.', sort_order: 3, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { name: 'Ms. Aisha Bello', role: 'Safeguarding & Compliance', bio: 'Leads on safeguarding, compliance and risk.', sort_order: 4, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  // Sample payroll for any faculty users
  const faculty = await knex('users').whereIn('role', ['faculty']).select('id');
  for (const f of faculty) {
    await knex('payroll_entries').insert({
      user_id: f.id, period: 'June 2026', gross: 3200, deductions: 640, net: 2560, status: 'paid', paid_at: knex.fn.now(), created_at: knex.fn.now(), updated_at: knex.fn.now(),
    });
  }

  // eslint-disable-next-line no-console
  console.log('\n  Seeded governance (budget, documents, board, payroll)\n');
};
