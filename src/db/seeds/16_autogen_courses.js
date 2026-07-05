/**
 * Seed: Autogenerate basic courses for programs that lack courses.
 * Creates a simple 'Introductory' course with one module and three lessons.
 * Idempotent: skips programs that already have a course.
 */
exports.seed = async function (knex) {
  const programs = await knex('programs').select();
  for (const p of programs) {
    const existing = await knex('courses').where({ program_id: p.id }).first();
    if (existing) continue;

    const slug = `${p.slug}-foundations`;
    const title = `${p.title} — Foundations`;

    const [cid] = await knex('courses').insert({
      slug,
      program_id: p.id,
      instructor_id: null,
      code: null,
      title,
      summary: `A foundational course for the ${p.title} programme.`,
      description: `This course introduces key themes and learning outcomes for the ${p.title} programme.`,
      credits: 5,
      icon: 'school',
      published: true,
      sort_order: 99,
    });
    const courseId = Array.isArray(cid) ? cid[0] : cid;

    const [mid] = await knex('modules').insert({
      course_id: courseId,
      title: 'Module 1 — Introduction',
      summary: 'Introductory module',
      sort_order: 1,
    });
    const moduleId = Array.isArray(mid) ? mid[0] : mid;

    const lessons = [
      { title: 'Overview & Learning Outcomes', type: 'reading', content: 'Overview of the programme and learning outcomes.' },
      { title: 'Core Themes', type: 'reading', content: 'Key themes you will study in this programme.' },
      { title: 'Next Steps', type: 'reading', content: 'How to proceed with the full programme and study tips.' },
    ];

    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i];
      await knex('lessons').insert({
        module_id: moduleId,
        title: l.title,
        type: l.type,
        content: l.content,
        duration_min: 15,
        sort_order: i + 1,
      });
    }

    console.log(`  ✅ Created intro course for program: ${p.slug}`);
  }
};
