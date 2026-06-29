/**
 * Seed: sample events and library resources.
 */
exports.seed = async function (knex) {
  await knex('event_rsvps').del();
  await knex('events').del();
  await knex('resources').del();

  const at = (daysAhead, hour = 18) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  const plus = (base, hours) => {
    const d = new Date(base);
    d.setHours(d.getHours() + hours);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  const events = [
    { slug: 'global-online-chapel', title: 'Global Online Chapel', category: 'Worship', description: 'Join believers across the diaspora for our weekly online chapel service of worship, the Word and prayer.', is_online: true, join_url: 'https://example.com/chapel', starts_at: at(3, 17), image_url: null, published: true },
    { slug: 'diaspora-leadership-webinar', title: 'Diaspora Leadership Webinar', category: 'Webinar', description: 'A live webinar with faculty on leading across cultures, followed by Q&A.', is_online: true, join_url: 'https://example.com/webinar', starts_at: at(7, 16), published: true },
    { slug: 'new-student-orientation', title: 'New Student Orientation', category: 'Orientation', description: 'Everything you need to begin your studies at GDCU — meet your tutors and learn the virtual campus.', is_online: true, join_url: 'https://example.com/orientation', starts_at: at(10, 15), published: true },
    { slug: 'annual-mission-conference', title: 'Annual Global Mission Conference', category: 'Conference', description: 'Our flagship conference gathering students, alumni and partners around the Great Commission.', is_online: false, location: 'London & Online', starts_at: at(30, 9), published: true },
  ];
  for (const e of events) {
    e.ends_at = plus(e.starts_at, e.category === 'Conference' ? 8 : 2);
    e.created_at = knex.fn.now();
    e.updated_at = knex.fn.now();
  }
  await knex('events').insert(events);

  const leadership = await knex('courses').where({ slug: 'church-leadership-foundations' }).first();
  const resources = [
    { title: 'The Holy Bible (ESV) — Online', type: 'book', category: 'Scripture', description: 'Full searchable text of the English Standard Version.', url: 'https://www.esv.org/', author: 'Crossway', published: true, sort_order: 1 },
    { title: 'GDCU Referencing & Citation Guide', type: 'document', category: 'Study Skills', description: 'How to reference sources correctly in your assignments.', url: 'https://example.com/referencing.pdf', published: true, sort_order: 2 },
    { title: 'Introduction to Servant Leadership (Lecture)', type: 'video', category: 'Leadership', description: 'Recorded lecture introducing servant leadership.', url: 'https://example.com/video/servant-leadership', course_id: leadership ? leadership.id : null, published: true, sort_order: 3 },
    { title: 'Journal of Diaspora Theology', type: 'journal', category: 'Theology', description: 'Open-access scholarship on diaspora and migration theology.', url: 'https://example.com/journal', published: true, sort_order: 4 },
    { title: 'Academic Writing Skills Portal', type: 'link', category: 'Study Skills', description: 'External resource for developing academic writing.', url: 'https://example.com/writing', published: true, sort_order: 5 },
  ];
  for (const r of resources) { r.created_at = knex.fn.now(); r.updated_at = knex.fn.now(); }
  await knex('resources').insert(resources);

  // eslint-disable-next-line no-console
  console.log('\n  Seeded events and library resources\n');
};
