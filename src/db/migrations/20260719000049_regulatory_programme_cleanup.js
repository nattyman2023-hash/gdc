/**
 * Align the public programme catalogue with the supplied regulatory review.
 *
 * IDs and slugs are deliberately preserved. The duplicate BA record and the
 * general MBA are unpublished rather than deleted so historical applications,
 * enrolments and invoices keep their relationships.
 */
const PROGRAMMES = [
  {
    slug: 'bachelor-biblical-studies',
    title: 'Bachelor of Arts in Christian Biblical Studies',
    aliases: ['Bachelor of Biblical Studies'],
  },
  {
    slug: 'bachelor-christian-ministry',
    title: 'Bachelor of Arts in Christian Ministry',
    aliases: ['Bachelor of Christian Ministry'],
  },
  {
    slug: 'bachelor-christian-leadership',
    title: 'Bachelor of Arts in Christian Leadership',
    aliases: ['Bachelor of Christian Leadership'],
  },
  {
    slug: 'bachelor-chaplaincy-pastoral-care',
    title: 'Bachelor of Arts in Christian Chaplaincy and Pastoral Care',
    aliases: ['Bachelor of Chaplaincy and Pastoral Care'],
  },
  {
    slug: 'bachelor-theology-ministry',
    title: 'Bachelor of Arts in Christian Theology and Ministry',
    aliases: ['Bachelor of Theology and Ministry'],
  },
  {
    slug: 'bachelor-missions-global-christianity',
    title: 'Bachelor of Arts in Christian Missions and Global Christianity',
    aliases: ['Bachelor of Missions and Global Christianity'],
  },
  {
    slug: 'master-christian-theology',
    title: 'Master of Arts in Christian Theology',
    aliases: ['Master of Christian Theology'],
  },
  {
    slug: 'master-christian-ministry',
    title: 'Master of Arts in Christian Ministry',
    aliases: ['Master of Christian Ministry'],
  },
  {
    slug: 'master-christian-leadership',
    title: 'Master of Arts in Christian Leadership',
    aliases: ['Master of Christian Leadership'],
  },
  {
    slug: 'master-chaplaincy-spiritual-care',
    title: 'Master of Arts in Christian Chaplaincy and Spiritual Care',
    aliases: ['Master of Chaplaincy and Spiritual Care'],
  },
  {
    slug: 'master-pastoral-care-counselling-ministry',
    title: 'Master of Arts in Christian Pastoral Care and Counselling for Ministry',
    aliases: ['Master of Pastoral Care and Counselling for Ministry'],
  },
  {
    slug: 'master-missions-diaspora-ministry',
    title: 'Master of Arts in Christian Missions and Diaspora Ministry',
    aliases: ['Master of Missions and Diaspora Ministry'],
  },
  {
    slug: 'doctorate-christian-ministry',
    title: 'Doctor of Philosophy in Christian Ministry',
    aliases: ['Doctor of Christian Ministry'],
  },
  {
    slug: 'doctorate-practical-theology',
    title: 'Doctor of Philosophy in Christian Practical Theology',
    aliases: ['Doctor of Practical Theology'],
  },
  {
    slug: 'doctorate-chaplaincy-spiritual-care',
    title: 'Doctor of Philosophy in Christian Chaplaincy and Spiritual Care',
    aliases: ['Doctor of Chaplaincy and Spiritual Care'],
  },
  {
    slug: 'doctorate-christian-leadership',
    title: 'Doctor of Philosophy in Christian Leadership',
    aliases: ['Doctor of Christian Leadership'],
  },
];

const RELEGATED_PROGRAMMES = ['ba-theology-ministry', 'msc-business-administration'];

const DOCTORAL_PROGRAMME_COPY = {
  'doctorate-christian-ministry': {
    summary: 'Research doctorate for advanced scholarship in Christian ministry.',
    description: 'This PhD programme develops advanced research in Christian ministry. Students complete doctoral research, a defended dissertation and an original contribution to ministry scholarship.',
  },
  'doctorate-practical-theology': {
    summary: 'Research doctorate in Christian practical theology and ministry.',
    description: 'This PhD programme explores the intersection of theology and practice through rigorous research. Students complete a defended dissertation that makes an original contribution to Christian practical theology.',
  },
  'doctorate-chaplaincy-spiritual-care': {
    summary: 'Research doctorate in Christian chaplaincy and spiritual care.',
    description: 'This PhD programme develops advanced research in Christian chaplaincy and spiritual care. Students complete a defended dissertation and an original contribution to the field.',
  },
  'doctorate-christian-leadership': {
    summary: 'Research doctorate in Christian leadership and organisational transformation.',
    description: 'This PhD programme develops original research in Christian leadership, organisational transformation and mission innovation, culminating in a defended dissertation.',
  },
};

function replaceAliases(value, aliases, title) {
  if (typeof value !== 'string') return value;
  return aliases.reduce((result, alias) => result.split(alias).join(title), value);
}

async function updateCourseCopy(knex, programId, aliases, title) {
  const courses = await knex('courses').where({ program_id: programId });
  for (const course of courses) {
    const changes = {};
    for (const field of ['title', 'summary', 'description']) {
      const next = replaceAliases(course[field], aliases, title);
      if (next !== course[field]) changes[field] = next;
    }
    if (Object.keys(changes).length) {
      changes.updated_at = knex.fn.now();
      await knex('courses').where({ id: course.id }).update(changes);
    }
  }
}

async function updateDoctoralResearchStructure(knex) {
  const moduleUpdates = [
    {
      oldTitle: 'DMin Project Design',
      title: 'PhD Dissertation Design',
      summary: 'Designing the doctoral dissertation.',
      discipline: 'Christian ministry',
    },
    {
      oldTitle: 'DMin Chaplaincy Project',
      title: 'PhD Dissertation Design in Christian Chaplaincy',
      summary: 'Designing the doctoral dissertation.',
      discipline: 'Christian chaplaincy and spiritual care',
    },
  ];

  for (const item of moduleUpdates) {
    const modules = await knex('modules').where({ title: item.oldTitle });
    for (const module of modules) {
      await knex('modules').where({ id: module.id }).update({ title: item.title, summary: item.summary });
      await knex('lessons').where({ module_id: module.id, title: 'Project Proposal' }).update({
        title: 'Dissertation Proposal',
        content: `<p>Design a doctoral dissertation in ${item.discipline}: identify a research problem, review the literature, select a defensible methodology, and define the original contribution.</p>`,
      });
    }
  }
}

exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('programs', 'semester_credits'))) {
    await knex.schema.alterTable('programs', (table) => {
      table.integer('semester_credits').nullable();
    });
  }

  for (const item of PROGRAMMES) {
    const program = await knex('programs').where({ slug: item.slug }).first();
    if (!program) continue;

    const programmeCopy = DOCTORAL_PROGRAMME_COPY[item.slug] || {};
    await knex('programs').where({ id: program.id }).update({
      title: item.title,
      credential: item.title,
      ...programmeCopy,
      updated_at: knex.fn.now(),
    });
    await updateCourseCopy(knex, program.id, [item.title, ...item.aliases], item.title);

    if (program.semester_credits == null) {
      const total = await knex('courses').where({ program_id: program.id }).sum({ value: 'credits' }).first();
      const credits = Number(total && total.value);
      if (Number.isFinite(credits) && credits > 0) {
        await knex('programs').where({ id: program.id }).update({ semester_credits: credits });
      }
    }
  }

  for (const slug of RELEGATED_PROGRAMMES) {
    await knex('programs').where({ slug }).update({ published: false, featured: false, updated_at: knex.fn.now() });
  }

  await updateDoctoralResearchStructure(knex);

  await knex('alumni_profiles').where('program', 'like', 'MBA%').update({ published: false, updated_at: knex.fn.now() });

  // Keep public-facing accreditation and recognition statements accurate.
  await knex('faqs').where({ question: 'Are your qualifications recognised?' }).update({
    answer: 'Global Diaspora Christian University is currently unaccredited. Accreditation is not guaranteed. Students should confirm whether a GDCU qualification will be accepted by employers, other institutions, professional bodies or government authorities before enrolling.',
    updated_at: knex.fn.now(),
  });
  await knex('news_posts').where({ slug: 'qahe-accreditation-milestone' }).update({
    excerpt: 'GDCU continues its institutional quality-assurance and accreditation work, with its current status explained openly for prospective students.',
    body: 'Global Diaspora Christian University continues its accreditation journey and internal quality-assurance work. GDCU is currently unaccredited, and accreditation or recognition of a qualification is not guaranteed. Prospective students should review the current status and confirm whether a qualification will be accepted by employers, other institutions, professional bodies or government authorities before enrolling.',
    updated_at: knex.fn.now(),
  });
};

exports.down = async function (knex) {
  const originals = {
    'bachelor-biblical-studies': 'Bachelor of Biblical Studies',
    'bachelor-christian-ministry': 'Bachelor of Christian Ministry',
    'bachelor-christian-leadership': 'Bachelor of Christian Leadership',
    'bachelor-chaplaincy-pastoral-care': 'Bachelor of Chaplaincy and Pastoral Care',
    'bachelor-theology-ministry': 'Bachelor of Theology and Ministry',
    'bachelor-missions-global-christianity': 'Bachelor of Missions and Global Christianity',
    'master-christian-theology': 'Master of Christian Theology',
    'master-christian-ministry': 'Master of Christian Ministry',
    'master-christian-leadership': 'Master of Christian Leadership',
    'master-chaplaincy-spiritual-care': 'Master of Chaplaincy and Spiritual Care',
    'master-pastoral-care-counselling-ministry': 'Master of Pastoral Care and Counselling for Ministry',
    'master-missions-diaspora-ministry': 'Master of Missions and Diaspora Ministry',
    'doctorate-christian-ministry': 'Doctor of Christian Ministry',
    'doctorate-practical-theology': 'Doctor of Practical Theology',
    'doctorate-chaplaincy-spiritual-care': 'Doctor of Chaplaincy and Spiritual Care',
    'doctorate-christian-leadership': 'Doctor of Christian Leadership',
  };

  for (const item of PROGRAMMES) {
    const program = await knex('programs').where({ slug: item.slug }).first();
    if (!program) continue;
    const original = originals[item.slug];
    const oldDoctoralCopy = {
      'doctorate-christian-ministry': {
        summary: 'Professional doctorate for advanced ministry leadership and practice.',
        description: 'This doctoral programme supports experienced ministers in advanced research, reflective leadership and innovation in church and mission practice.',
      },
      'doctorate-practical-theology': {
        summary: 'Doctoral research into the practice of faith, church and ministry.',
        description: 'This doctoral research degree explores the intersection of theology and practice, equipping scholars to support the church through rigorous applied research.',
      },
      'doctorate-chaplaincy-spiritual-care': {
        summary: 'Advanced practice and research for chaplains and spiritual care leaders.',
        description: 'This doctorate develops expert chaplains who can lead spiritual care ministries in complex organisations and research the field of spiritual care.',
      },
      'doctorate-christian-leadership': {
        summary: 'Research-based leadership doctorate for church and nonprofit leaders.',
        description: 'This doctoral programme helps leaders develop original research in Christian leadership, organisational transformation and mission innovation.',
      },
    }[item.slug] || {};
    await knex('programs').where({ id: program.id }).update({ title: original, credential: original, ...oldDoctoralCopy, updated_at: knex.fn.now() });
    await updateCourseCopy(knex, program.id, [item.title], original);
  }

  for (const item of [
    { title: 'PhD Dissertation Design', oldTitle: 'DMin Project Design', discipline: 'ministry' },
    { title: 'PhD Dissertation Design in Christian Chaplaincy', oldTitle: 'DMin Chaplaincy Project', discipline: 'chaplaincy' },
  ]) {
    const modules = await knex('modules').where({ title: item.title });
    for (const module of modules) {
      await knex('modules').where({ id: module.id }).update({ title: item.oldTitle, summary: item.oldTitle === 'DMin Project Design' ? 'Designing the doctoral project.' : 'Doctoral project design.' });
      await knex('lessons').where({ module_id: module.id, title: 'Dissertation Proposal' }).update({
        title: 'Project Proposal',
        content: `<p>Design a doctoral project in ${item.discipline}: identify a practice problem, review literature, and plan intervention.</p>`,
      });
    }
  }

  await knex('programs').whereIn('slug', RELEGATED_PROGRAMMES).update({ published: true, updated_at: knex.fn.now() });
  if (await knex.schema.hasColumn('programs', 'semester_credits')) {
    await knex.schema.alterTable('programs', (table) => table.dropColumn('semester_credits'));
  }
};
