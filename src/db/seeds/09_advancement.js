/**
 * Seed: alumni profiles (+ a sample grant application).
 */
exports.seed = async function (knex) {
  await knex('alumni_profiles').del();
  await knex('grant_applications').del();

  await knex('alumni_profiles').insert([
    { name: 'Dr. Sarah Mensah', graduation_year: 2019, program: 'MA Post-Colonial Theology', role: 'Lead Pastor', organisation: 'Grace Diaspora Church', country: 'Ghana / UK', bio: 'Sarah leads a thriving diaspora congregation and mentors emerging women leaders.', is_mentor: true, published: true, sort_order: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    // Historical record retained, but not displayed publicly while the MBA is
    // outside the current religious-vocation programme catalogue.
    { name: 'David Thompson', graduation_year: 2020, program: 'MBA — Faith-Led Business', role: 'Social Entrepreneur', organisation: 'Kingdom Ventures', country: 'Kenya', bio: 'David builds ethical businesses that fund community development across East Africa.', is_mentor: true, published: false, sort_order: 2, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { name: 'Emmanuel Obi', graduation_year: 2018, program: 'BA Theology & Ministry', role: 'Mission Director', organisation: 'Reach Nations', country: 'Nigeria', bio: 'Emmanuel coordinates cross-cultural mission across West Africa and the diaspora.', is_mentor: true, published: true, sort_order: 3, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { name: 'Prof. Anne Clarke', graduation_year: 2015, program: 'PhD in Theology', role: 'Senior Lecturer', organisation: 'Partner Seminary', country: 'United Kingdom', bio: 'Anne researches diaspora theology and supervises doctoral candidates.', is_mentor: false, published: true, sort_order: 4, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);

  // eslint-disable-next-line no-console
  console.log('\n  Seeded alumni profiles\n');
};
