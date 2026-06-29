/**
 * Seed: lesson materials, a webinar, and a couple of interview slots.
 */
exports.seed = async function (knex) {
  await knex('webinar_questions').del();
  await knex('webinars').del();
  await knex('lesson_materials').del();
  await knex('interview_slots').del();

  // Attach materials to the first couple of lessons
  const lessons = await knex('lessons').orderBy('id').limit(3);
  for (const l of lessons) {
    await knex('lesson_materials').insert([
      { lesson_id: l.id, label: 'Lesson slides (PDF)', url: 'https://example.com/slides.pdf', type: 'slides', sort_order: 1 },
      { lesson_id: l.id, label: 'Further reading', url: 'https://example.com/reading', type: 'link', sort_order: 2 },
    ]);
  }

  const soon = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString().slice(0, 19).replace('T', ' '); };

  await knex('webinars').insert([
    { title: 'Global Missiology: Bridging Traditions in the Diaspora', presenter: 'Dr. Elias Ndlovu', description: 'A live session exploring how diaspora communities carry and adapt faith traditions.', starts_at: soon(4, 17), join_url: 'https://example.com/webinar/missiology', resources: 'Session slides|https://example.com/missiology.pdf\nReading list|https://example.com/missiology-reading', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Leading Healthy Diaspora Churches', presenter: 'Dr. Sarah Mensah', description: 'Practical leadership for multicultural congregations.', starts_at: soon(11, 18), join_url: 'https://example.com/webinar/leadership', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { title: 'Diaspora Theology — Recorded Lecture', presenter: 'Prof. Anne Clarke', description: 'A past session, now available on demand.', starts_at: soon(-7, 16), recording_url: 'https://example.com/recording/diaspora-theology', published: true, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  // Interview slots from faculty/admin
  const interviewers = await knex('users').whereIn('role', ['faculty', 'admin']).limit(2);
  for (const iv of interviewers) {
    await knex('interview_slots').insert([
      { interviewer_id: iv.id, starts_at: soon(5, 10), mode: 'online', capacity: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
      { interviewer_id: iv.id, starts_at: soon(5, 14), mode: 'online', capacity: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
      { interviewer_id: iv.id, starts_at: soon(6, 11), mode: 'online', capacity: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    ]);
  }

  // eslint-disable-next-line no-console
  console.log('\n  Seeded LMS materials, webinars and interview slots\n');
};
