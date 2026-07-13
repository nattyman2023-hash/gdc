/**
 * Use the recognised degree-title format for the four public programmes.
 *
 * Programme slugs and IDs remain unchanged so existing links, applications,
 * enrolments and invoices continue to point to the same records.
 */
const UPDATES = [
  {
    slug: 'bachelor-christian-ministry',
    oldTitle: 'Bachelor of Christian Ministry',
    oldCredential: 'Bachelor of Arts',
    title: 'Bachelor of Arts in Christian Ministry',
  },
  {
    slug: 'bachelor-missions-global-christianity',
    oldTitle: 'Bachelor of Missions and Global Christianity',
    oldCredential: 'Bachelor of Arts',
    title: 'Bachelor of Arts in Christian Missions and Global Christianity',
  },
  {
    slug: 'master-chaplaincy-spiritual-care',
    oldTitle: 'Master of Chaplaincy and Spiritual Care',
    oldCredential: 'Master of Arts',
    title: 'Master of Arts in Christian Chaplaincy and Spiritual Care',
  },
  {
    slug: 'master-missions-diaspora-ministry',
    oldTitle: 'Master of Missions and Diaspora Ministry',
    oldCredential: 'Master of Arts',
    title: 'Master of Arts in Christian Missions and Diaspora Ministry',
  },
];

function replaceInFields(record, from, to, fields) {
  const changes = {};
  for (const field of fields) {
    if (typeof record[field] !== 'string') continue;
    const next = record[field].split(from).join(to);
    if (next !== record[field]) changes[field] = next;
  }
  return changes;
}

async function updateCourses(knex, programId, from, to) {
  const courses = await knex('courses').where({ program_id: programId });
  for (const course of courses) {
    const changes = replaceInFields(course, from, to, ['title', 'summary', 'description']);
    if (Object.keys(changes).length === 0) continue;
    changes.updated_at = knex.fn.now();
    await knex('courses').where({ id: course.id }).update(changes);
  }
}

exports.up = async function (knex) {
  for (const item of UPDATES) {
    const program = await knex('programs').where({ slug: item.slug }).first();
    if (!program) continue;

    await knex('programs').where({ id: program.id }).update({
      title: item.title,
      credential: item.title,
      updated_at: knex.fn.now(),
    });

    await updateCourses(knex, program.id, item.oldTitle, item.title);
  }
};

exports.down = async function (knex) {
  for (const item of UPDATES) {
    const program = await knex('programs').where({ slug: item.slug }).first();
    if (!program) continue;

    await knex('programs').where({ id: program.id }).update({
      title: item.oldTitle,
      credential: item.oldCredential,
      updated_at: knex.fn.now(),
    });

    await updateCourses(knex, program.id, item.title, item.oldTitle);
  }
};
