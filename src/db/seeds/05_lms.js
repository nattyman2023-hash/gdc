/**
 * Seed: LMS content — courses, modules, lessons, a quiz, announcements,
 * plus a demo student enrolled in a course with some progress.
 *
 * Idempotent: clears LMS tables then rebuilds. Runs after programs/users seeds.
 */
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Clear in FK-safe order
  await knex('certificates').del();
  await knex('quiz_answers').del();
  await knex('quiz_attempts').del();
  await knex('quiz_options').del();
  await knex('quiz_questions').del();
  await knex('quizzes').del();
  await knex('lesson_progress').del();
  await knex('enrollments').del();
  await knex('announcements').del();
  await knex('lessons').del();
  await knex('modules').del();
  await knex('courses').del();

  // ─── Instructor + demo student ─────────────────────────────
  const instructorEmail = 'dr.makori@gdcu.edu';
  let instructor = await knex('users').where({ email: instructorEmail }).first();
  if (!instructor) {
    const hash = await bcrypt.hash('Faculty!2026', 12);
    const [id] = await knex('users').insert({
      first_name: 'Elias', last_name: 'Makori', email: instructorEmail,
      password_hash: hash, role: 'faculty', status: 'active',
    });
    instructor = { id: Array.isArray(id) ? id[0] : id };
  }

  const studentEmail = process.env.SEED_STUDENT_EMAIL || 'student@gdcu.edu';
  let student = await knex('users').where({ email: studentEmail }).first();
  if (!student) {
    const hash = await bcrypt.hash(process.env.SEED_STUDENT_PASSWORD || 'Student!2026', 12);
    const [id] = await knex('users').insert({
      first_name: 'Marcus', last_name: 'Mwangi', email: studentEmail,
      password_hash: hash, role: 'student', status: 'active',
    });
    student = { id: Array.isArray(id) ? id[0] : id };
  }

  // Link courses to a couple of seeded programs (by slug).
  const leadershipProgram = await knex('programs').where({ slug: 'diploma-christian-leadership' }).first();
  const theologyProgram = await knex('programs').where({ slug: 'ba-theology-ministry' }).first();

  // ─── Helper to insert a course with modules + lessons ──────
  async function createCourse(course, modules) {
    const [cid] = await knex('courses').insert(course);
    const courseId = Array.isArray(cid) ? cid[0] : cid;
    for (let mi = 0; mi < modules.length; mi++) {
      const m = modules[mi];
      const [mid] = await knex('modules').insert({
        course_id: courseId, title: m.title, summary: m.summary || null, sort_order: mi + 1,
      });
      const moduleId = Array.isArray(mid) ? mid[0] : mid;
      for (let li = 0; li < m.lessons.length; li++) {
        const l = m.lessons[li];
        await knex('lessons').insert({
          module_id: moduleId,
          title: l.title,
          type: l.type || 'reading',
          content: l.content || null,
          video_url: l.video_url || null,
          live_provider: l.live_provider || null,
          live_join_url: l.live_join_url || null,
          live_embed_url: l.live_embed_url || null,
          live_passcode: l.live_passcode || null,
          duration_min: l.duration_min || 15,
          sort_order: li + 1,
        });
      }
    }
    return courseId;
  }

  const lessonBody = (intro) =>
    `<p>${intro}</p><p>This lesson combines a short reading with reflection questions. Work through the material at your own pace, then mark the lesson complete to track your progress.</p>` +
    `<h3>Key ideas</h3><ul><li>Ground every principle in Scripture and sound theology.</li><li>Apply learning to your own context and calling.</li><li>Engage your cohort in the discussion forum.</li></ul>` +
    `<blockquote>"Whatever you do, work at it with all your heart, as working for the Lord." — Colossians 3:23</blockquote>`;

  // Course 1 — Church Leadership Foundations
  const course1Id = await createCourse(
    {
      slug: 'church-leadership-foundations',
      program_id: leadershipProgram ? leadershipProgram.id : null,
      instructor_id: instructor.id,
      code: 'LEAD101',
      title: 'Foundations of Church Leadership',
      summary: 'Core principles of servant leadership for the local church.',
      description:
        'This course lays the biblical and practical foundations for leading a healthy, mission-focused local church — covering servant leadership, vision, discipleship and governance.',
      credits: 15,
      icon: 'diversity_3',
      published: true,
      sort_order: 1,
    },
    [
      {
        title: 'Module 1 — The Heart of a Leader',
        summary: 'Biblical foundations of servant leadership.',
        lessons: [
          { title: 'What the Bible says about leadership', content: lessonBody('Leadership in Scripture begins with character and calling, not position.'), duration_min: 20 },
          { title: 'Servant leadership models', content: lessonBody('Jesus redefined greatness as service. We examine practical models of servant leadership.'), duration_min: 25 },
          { title: 'Leading from who you are', type: 'video', content: lessonBody('Watch the recorded session on leading from identity in Christ and reflect on practical next steps.'), video_url: 'https://youtu.be/dQw4w9WgXcQ', duration_min: 60 },
        ],
      },
      {
        title: 'Module 2 — Leadership Ethics & Stewardship',
        summary: 'Integrity, accountability and stewardship.',
        lessons: [
          { title: 'Integrity and accountability', content: lessonBody('Trust is the currency of leadership. We explore building cultures of integrity.'), duration_min: 20 },
          { title: 'Financial stewardship in ministry', content: lessonBody('Faithful stewardship of resources protects the mission and the leader.'), duration_min: 20 },
        ],
      },
      {
        title: 'Module 3 — Cross-Cultural Communication',
        summary: 'Leading diverse, diaspora congregations.',
        lessons: [
          { title: 'Communicating across cultures', content: lessonBody('Diaspora ministry requires cultural intelligence and humility.'), duration_min: 25 },
          { title: 'Case study: A multicultural church plant', content: lessonBody('We analyse a real-world diaspora church plant and its leadership lessons.'), duration_min: 30 },
        ],
      },
    ]
  );

  // Course 2 — Biblical Hermeneutics
  const course2Id = await createCourse(
    {
      slug: 'biblical-hermeneutics',
      program_id: theologyProgram ? theologyProgram.id : null,
      instructor_id: instructor.id,
      code: 'THEO101',
      title: 'Biblical Hermeneutics II',
      summary: 'Principles and practice of interpreting Scripture faithfully.',
      description:
        'A study of the principles of biblical interpretation, equipping students to read, understand and apply Scripture responsibly across genres and contexts.',
      credits: 15,
      icon: 'menu_book',
      published: true,
      sort_order: 2,
    },
    [
      {
        title: 'Module 1 — Foundations of Interpretation',
        lessons: [
          { title: 'What is hermeneutics?', content: lessonBody('Hermeneutics is the art and science of interpretation.'), duration_min: 20 },
          { title: 'Context is king', content: lessonBody('Every text has a literary, historical and theological context.'), duration_min: 25 },
        ],
      },
      {
        title: 'Module 2 — Interpreting the Genres',
        lessons: [
          { title: 'Reading narrative', content: lessonBody('Biblical narrative teaches through story; we learn to read it well.'), duration_min: 25 },
          { title: 'Reading the epistles', content: lessonBody('Letters demand attention to argument and audience.'), duration_min: 25 },
          { title: 'Genre-specific interpretation reflection', type: 'video', content: lessonBody('Watch the recorded session on genre-specific interpretation and reflect on how theological meaning is shaped by each literary form.'), video_url: 'https://youtu.be/dQw4w9WgXcQ', duration_min: 60 },
          { title: 'Divine sovereignty and human will', content: lessonBody('A worked example interpreting a difficult theological theme.'), duration_min: 30 },
        ],
      },
    ]
  );

  // ─── Quiz for course 1 ─────────────────────────────────────
  const [quizIdRaw] = await knex('quizzes').insert({
    course_id: course1Id,
    title: 'Quiz 1: Theological Foundations of Leadership',
    description: 'Check your understanding of servant leadership foundations.',
    pass_mark: 60,
    time_limit_min: 15,
    sort_order: 1,
  });
  const quizId = Array.isArray(quizIdRaw) ? quizIdRaw[0] : quizIdRaw;

  async function addQuestion(prompt, type, options, explanation) {
    const [qidRaw] = await knex('quiz_questions').insert({ quiz_id: quizId, prompt, type, explanation: explanation || null, sort_order: 0 });
    const qid = Array.isArray(qidRaw) ? qidRaw[0] : qidRaw;
    for (let i = 0; i < options.length; i++) {
      await knex('quiz_options').insert({ question_id: qid, text: options[i].text, is_correct: !!options[i].correct, sort_order: i + 1 });
    }
  }

  await addQuestion(
    'According to the course, biblical leadership begins primarily with…',
    'single',
    [
      { text: 'Position and title', correct: false },
      { text: 'Character and calling', correct: true },
      { text: 'Charisma and oratory', correct: false },
      { text: 'Strategy and metrics', correct: false },
    ],
    'Scripture grounds leadership in character and calling before any role or title.'
  );
  await addQuestion(
    'Jesus redefined greatness in the kingdom as…',
    'single',
    [
      { text: 'Service to others', correct: true },
      { text: 'Authority over others', correct: false },
      { text: 'Wealth and influence', correct: false },
    ],
    'Servant leadership flows from Jesus’ teaching that the greatest must serve.'
  );
  await addQuestion(
    'True or False: Faithful financial stewardship protects both the mission and the leader.',
    'truefalse',
    [
      { text: 'True', correct: true },
      { text: 'False', correct: false },
    ],
    'Stewardship safeguards trust, the mission and the leader’s integrity.'
  );

  // ─── Announcements ─────────────────────────────────────────
  await knex('announcements').insert([
    { course_id: null, title: 'Welcome to the new academic term', body: 'We are delighted to welcome you. Please complete your orientation in the first week.', author: 'Registrar', },
    { course_id: course1Id, title: 'LEAD101 live session this Friday', body: 'Our Module 1 live webinar takes place Friday at 18:00 GMT. See the lesson link to join.', author: 'Dr. Elias Makori', },
  ]);

  // ─── Enroll the demo student in course 1 with partial progress ──
  const [enrIdRaw] = await knex('enrollments').insert({
    user_id: student.id, course_id: course1Id, status: 'active', progress_pct: 0,
  });
  const enrollmentId = Array.isArray(enrIdRaw) ? enrIdRaw[0] : enrIdRaw;

  // Mark the first two lessons complete
  const firstLessons = await knex('lessons')
    .join('modules', 'lessons.module_id', 'modules.id')
    .where('modules.course_id', course1Id)
    .orderBy(['modules.sort_order', 'lessons.sort_order'])
    .select('lessons.id')
    .limit(2);
  for (const l of firstLessons) {
    await knex('lesson_progress').insert({ enrollment_id: enrollmentId, lesson_id: l.id, completed: true, completed_at: knex.fn.now() });
  }
  const totalLessons = await knex('lessons')
    .join('modules', 'lessons.module_id', 'modules.id')
    .where('modules.course_id', course1Id)
    .count({ c: '*' }).first();
  const pct = Math.round((firstLessons.length / Number(totalLessons.c)) * 100);
  await knex('enrollments').where({ id: enrollmentId }).update({ progress_pct: pct });

  // Also enroll in course 2 (fresh)
  await knex('enrollments').insert({ user_id: student.id, course_id: course2Id, status: 'active', progress_pct: 0 });

  // eslint-disable-next-line no-console
  console.log(`\n  Seeded LMS. Demo student: ${studentEmail} / ${process.env.SEED_STUDENT_PASSWORD || 'Student!2026'}\n`);
};
