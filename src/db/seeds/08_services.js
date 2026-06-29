/**
 * Seed: scholarships and job openings.
 */
exports.seed = async function (knex) {
  await knex('job_applications').del();
  await knex('job_openings').del();
  await knex('scholarships').del();

  const ahead = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

  await knex('scholarships').insert([
    { slug: 'diaspora-leaders-scholarship', title: 'Diaspora Leaders Scholarship', summary: 'For emerging leaders serving diaspora communities.', description: 'Awarded to applicants demonstrating leadership potential and a commitment to serving diaspora communities through ministry, business or community work.', award: 'Up to 50% tuition', eligibility: 'Open to all postgraduate applicants. Requires a personal statement and one reference.', deadline: ahead(45), published: true, sort_order: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'global-mission-bursary', title: 'Global Mission Bursary', summary: 'Support for students called to cross-cultural mission.', description: 'A needs-based bursary for students preparing for mission and pastoral work in under-resourced regions.', award: 'Up to £2,000', eligibility: 'Demonstrated financial need and a clear mission calling.', deadline: ahead(60), published: true, sort_order: 2, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'women-in-theology-award', title: 'Women in Theology Award', summary: 'Encouraging women in theological scholarship and leadership.', description: 'Supports women pursuing theology, ministry and leadership studies at GDCU.', award: 'Up to 30% tuition', eligibility: 'Open to women applicants across all programmes.', deadline: ahead(30), published: true, sort_order: 3, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  await knex('job_openings').insert([
    { slug: 'lecturer-global-theology', title: 'Lecturer in Global Theology', department: 'School of Global Theology', location: 'Remote / Online', type: 'Faculty', summary: 'Teach and supervise students in theology and diaspora studies.', description: 'We are seeking an experienced theologian to join our faculty, teaching online modules, supervising research and contributing to curriculum development. A postgraduate qualification in theology and teaching experience are required.', published: true, closes_on: ahead(40), created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'admissions-officer', title: 'Admissions Officer', department: 'Registry & Admissions', location: 'Remote', type: 'Staff', summary: 'Support prospective students through the admissions journey.', description: 'Guide applicants from enquiry to enrolment, manage the admissions pipeline and provide an excellent applicant experience.', published: true, closes_on: ahead(25), created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'student-mentor-volunteer', title: 'Student Mentor (Volunteer)', department: 'Student Life', location: 'Online', type: 'Volunteer', summary: 'Mentor and encourage new students in their first year.', description: 'Volunteer mentors walk alongside new students, offering encouragement, prayer and practical guidance.', published: true, closes_on: ahead(90), created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  // eslint-disable-next-line no-console
  console.log('\n  Seeded scholarships and job openings\n');
};
