/**
 * PRODUCTION SEED — populates all 21 shared modules with lessons, quizzes,
 * assignments, and final exams for all 33+ programmes.
 * 
 * Run on Hostinger after migration:
 *   cd /home/u/.../htdocs
 *   node seed_production.js
 * 
 * CAUTION: This will DELETE existing lesson/quiz/assignment data.
 */
const knex = require('./src/config/db');

async function seed() {
  console.log('=== PRODUCTION SEED ===\n');

  // ─── WIPE ──────────────────────────────────────────────────
  console.log('Wiping existing content...');
  await knex('course_shared_modules').delete();
  await knex('lesson_materials').delete();
  await knex('lesson_progress').delete();
  await knex('lesson_comments').delete();
  await knex('lesson_notes').delete();
  await knex('quiz_answers').delete();
  await knex('quiz_attempts').delete();
  await knex('assignment_submissions').delete();
  await knex('certificates').delete();
  await knex('enrollments').delete();
  
  const qIds = await knex('quizzes').pluck('id');
  if (qIds.length) {
    const qqIds = await knex('quiz_questions').whereIn('quiz_id', qIds).pluck('id');
    if (qqIds.length) await knex('quiz_options').whereIn('question_id', qqIds).delete();
    await knex('quiz_questions').whereIn('quiz_id', qIds).delete();
  }
  await knex('quizzes').delete();
  await knex('assignments').delete();
  await knex('lessons').delete();
  await knex('modules').delete();
  await knex('shared_modules').delete();
  console.log('OK\n');

  // ─── MODULE DEFINITIONS ────────────────────────────────────
  const MODS = {
    'CORE-101': 'Introduction to Biblical Studies',
    'CORE-102': 'Christian Theology and Doctrine',
    'CORE-103': 'Church History and Tradition',
    'CORE-104': 'Hermeneutics and Scripture',
    'CORE-105': 'Foundations of Christian Ministry',
    'CORE-106': 'Spiritual Formation and Discipleship',
    'BIBL-201': 'Old Testament Survey',
    'BIBL-202': 'New Testament Survey',
    'BIBL-203': 'Biblical Theology',
    'MIN-201': 'Pastoral Theology and Care',
    'MIN-202': 'Preaching and Teaching',
    'MIN-203': 'Evangelism and Mission',
    'LEAD-201': 'Christian Leadership Principles',
    'LEAD-202': 'Church Administration',
    'LEAD-203': 'Strategic Ministry Planning',
    'THEO-301': 'Advanced Theological Studies',
    'THEO-302': 'Christian Ethics and Morality',
    'THEO-303': 'Apologetics and Worldview',
    'COUN-301': 'Pastoral Counselling',
    'CHAP-301': 'Chaplaincy and Spiritual Care',
    'MISS-301': 'Missions and Global Christianity',
  };

  const CORE_CODES = ['CORE-101','CORE-102','CORE-103','CORE-104','CORE-105','CORE-106'];

  const R1 = [
    'Scripture serves as the foundation for all Christian theology. This reading explores divine revelation through creation, Scripture, and Jesus Christ.',
    'God\'s story unfolds through covenant. This reading traces the major covenants of the Old Testament from Adam through Abraham, Moses, and David.',
    'Jesus Christ is the center of the Christian faith. This reading examines Gospel accounts of His life, death, and resurrection.',
    'The Holy Spirit\'s work is vital for the believer. This reading explores the Spirit\'s role in conviction, regeneration, sanctification, and empowerment.',
    'The church is the body of Christ. This reading examines biblical images of the church: body, temple, bride, family, and flock.',
    'Christian ministry is rooted in servanthood. This reading explores biblical and theological foundations of ministry modeled by Christ.',
    'Prayer and discipleship are essential disciplines. This reading examines biblical teaching on prayer, spiritual growth, and formation.',
    'The mission of God is Scripture\'s overarching narrative. This reading explores redemptive history from Genesis to Revelation.',
    'Christian leadership requires character, competence, and calling. This reading examines biblical qualifications for leadership.',
    'Sound doctrine matters for healthy ministry. This reading introduces the major doctrines of the Christian faith.',
  ];
  const R2 = [
    'This reading examines how the Bible came to be — its inspiration, canonization, and transmission through history.',
    'The Exodus is the defining salvation event of the Old Testament, prefiguring Christ\'s ultimate redemption.',
    'The atonement is the heart of the Gospel. This reading surveys Christus Victor, penal substitution, and moral influence models.',
    'Spiritual gifts and fruit of the Spirit are both essential for Christian life and ministry in the body of Christ.',
    'Church governance varies across traditions. This reading examines episcopal, presbyterian, and congregational models.',
    'Christian ethics require discernment. This reading introduces deontological, teleological, and virtue approaches.',
    'Worship is both personal and corporate. This reading examines biblical theology of worship from tabernacle to early church.',
    'Gospel and culture is a key missiological concern. This reading explores contextualization through Paul\'s example at the Areopagus.',
    'Conflict resolution is crucial for leaders. This reading examines Matthew 18 and Pauline principles for reconciliation.',
    'Eschatology shapes how Christians live. This reading surveys amillennial, premillennial, and postmillennial views.',
  ];

  // ─── CONTENT HELPERS ──────────────────────────────────────
  function rd(a, i) { return a[i % 10]; }
  function vid(c, b) { return `https://www.youtube.com/embed/${['dQw4w9WgXcQ','3bG8rE8JQqE','Mh6iJF9CJcA','IJ9Vn1qSJ7A','B8Io1sIeCJs'][(c.length+b)%5]}`; }
  function html(ttl, bi, bl) {
    const p = bi+1;
    return `${bi>0?'<p><em>📺 This continues from the previous video.</em></p>\n\n':''}
<h2>📖 Reading 1: Foundation Text (Part ${p})</h2>
<p>${rd(R1, bi*2)}</p>
<h2>📖 Reading 2: Supplementary Reading (Part ${p})</h2>
<p>${rd(R2, bi*2+1)}</p>
<h2>🎬 Video Lesson — Part ${p}/${bl}</h2>
<p>Watch the <strong>15-minute video</strong> on <em>${ttl}</em>.</p>
${bi<bl-1?`<p><em>✅ Section complete. Continue with Part ${p+1}.</em></p>`:'<p><em>✅ Module complete. Proceed to the quiz.</em></p>'}`;
  }

  // ─── COURSE-MODULE MAP ────────────────────────────────────
  const CAT = {
    'Certificate': {
      'Biblical Studies': ['BIBL-201','BIBL-202'],
      'Christian Ministry': ['MIN-201','MIN-202'],
      'Pastoral Care': ['MIN-201','COUN-301'],
      'Chaplaincy and Spiritual Care': ['MIN-201','CHAP-301'],
      'Christian Leadership': ['LEAD-201','LEAD-202'],
      'Missions and Diaspora Ministry': ['MIN-202','MISS-301'],
      'Church Administration': ['LEAD-202','LEAD-203'],
      'Prayer, Discipleship and Spiritual Formation': ['CORE-106','MIN-203'],
    },
    'Diploma': {
      'Biblical Studies': ['BIBL-201','BIBL-202','BIBL-203','THEO-301','THEO-302'],
      'Christian Ministry': ['MIN-201','MIN-202','MIN-203','THEO-301','COUN-301'],
      'Chaplaincy and Pastoral Care': ['MIN-201','CHAP-301','COUN-301','THEO-302'],
      'Christian Leadership': ['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303'],
      'Theology and Ministry': ['BIBL-201','MIN-201','THEO-301','THEO-302','THEO-303'],
      'Missions and Global Christianity': ['MIN-203','MISS-301','BIBL-202','THEO-303'],
      'Pastoral Counselling for Ministry': ['MIN-201','COUN-301','CHAP-301','THEO-302'],
    },
    'Bachelor': {
      'Biblical Studies': ['BIBL-201','BIBL-202','BIBL-203','THEO-301','THEO-302','THEO-303','COUN-301'],
      'Christian Ministry': ['MIN-201','MIN-202','MIN-203','LEAD-201','THEO-301','COUN-301','THEO-302','MISS-301'],
      'Christian Leadership': ['LEAD-201','LEAD-202','LEAD-203','MIN-201','THEO-301','THEO-303','COUN-301','MISS-301'],
      'Chaplaincy and Pastoral Care': ['MIN-201','CHAP-301','COUN-301','LEAD-201','THEO-302','THEO-301','COUN-301'],
      'Theology and Ministry': ['BIBL-201','BIBL-202','THEO-301','MIN-201','THEO-302','THEO-303','MISS-301','COUN-301'],
      'Missions and Global Christianity': ['MIN-203','MISS-301','BIBL-202','BIBL-203','THEO-303','THEO-302','COUN-301','MIN-202'],
    },
    'Master': {
      'Christian Theology': ['THEO-301','THEO-302','THEO-303','THEO-301','THEO-302','THEO-303'],
      'Christian Ministry': ['MIN-201','MIN-202','MIN-203','LEAD-201','COUN-301','MISS-301'],
      'Christian Leadership': ['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303','MIN-201'],
      'Chaplaincy and Spiritual Care': ['CHAP-301','COUN-301','MIN-201','THEO-302'],
      'Pastoral Care and Counselling for Ministry': ['COUN-301','CHAP-301','MIN-201','THEO-302','THEO-301'],
      'Missions and Diaspora Ministry': ['MISS-301','MIN-203','BIBL-202','THEO-303','THEO-302'],
    },
    'Doctor': {
      'Christian Ministry': ['THEO-301','THEO-302','THEO-303','COUN-301','MISS-301','LEAD-201'],
      'Practical Theology': ['THEO-301','MIN-201','THEO-302','THEO-303','COUN-301','CHAP-301'],
      'Chaplaincy and Spiritual Care': ['CHAP-301','COUN-301','MIN-201','THEO-302'],
      'Christian Leadership': ['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303','MIN-201'],
    },
  };

  // ─── STEP 1: SharedModule definitions ──────────────────────
  console.log('1. Creating shared module definitions...');
  const smMap = {};
  for (const [code, ttl] of Object.entries(MODS)) {
    const [id] = await knex('shared_modules').insert({
      code, title: ttl, description: ttl, summary: ttl,
      year_level: code.startsWith('CORE') ? 1 : 2,
      category: code.split('-')[0].toLowerCase(),
      featured_image: '/img/generated/gdcu-online-learning.webp', published: true,
    });
    smMap[code] = id;
  }
  console.log(`   ${Object.keys(MODS).length} definitions ✓`);

  // ─── STEP 2: Modules + Lessons + Quizzes ──────────────────
  console.log('2. Creating module content...');
  const FIRST_COURSE_ID = 22; // any existing course for FK
  for (const [code, ttl] of Object.entries(MODS)) {
    const sid = smMap[code];
    const [mid] = await knex('modules').insert({
      course_id: FIRST_COURSE_ID, shared_module_id: sid, title: ttl,
      summary: ttl, sort_order: 0, year_level: code.startsWith('CORE') ? 1 : 2,
      featured_image: '/img/generated/gdcu-online-learning.webp',
    });

    const BLOCKS = 3;
    for (let bi = 0; bi < BLOCKS; bi++) {
      const bt = `${ttl} — Part ${bi+1}/${BLOCKS}`;
      const [lid] = await knex('lessons').insert({
        module_id: mid, title: bt, content: html(ttl, bi, BLOCKS),
        video_url: vid(code, bi), type: 'essay', duration_min: 15,
        sort_order: bi+1, block_no: bi+1, block_title: bt,
      });
      await knex('lesson_materials').insert([
        { lesson_id: lid, label: `Reading 1: Foundation Text (Part ${bi+1})`, url: '#', type: 'link' },
        { lesson_id: lid, label: `Reading 2: Supplementary Reading (Part ${bi+1})`, url: '#', type: 'link' },
      ]);
    }

    // Module quiz
    const [qid] = await knex('quizzes').insert({
      module_id: mid, course_id: FIRST_COURSE_ID, title: `Quiz: ${ttl}`,
      description: `Test understanding of ${ttl}.`, pass_mark: 60, time_limit_min: 10,
      sort_order: 1, after_block: BLOCKS, covers_blocks: BLOCKS,
    });
    for (let qi = 0; qi < 5; qi++) {
      const [qq] = await knex('quiz_questions').insert({
        quiz_id: qid, prompt: `Q${qi+1}: According to ${ttl}, which answer best reflects the key principle?`,
        sort_order: qi+1,
      });
      await knex('quiz_options').insert([
        { question_id: qq, text: 'The correct answer based on the module content.', is_correct: true },
        { question_id: qq, text: 'A common misunderstanding addressed in the module.', is_correct: false },
        { question_id: qq, text: 'An approach that contradicts the module teaching.', is_correct: false },
        { question_id: qq, text: 'An unrelated concept from another module.', is_correct: false },
      ]);
    }
  }
  console.log('   All 21 modules created ✓');

  // ─── STEP 3: Assign to courses ────────────────────────────
  console.log('3. Assigning modules to programmes...');
  const courses = await knex('courses').select('*').orderBy('id');
  
  for (const c of courses) {
    if (c.id === FIRST_COURSE_ID) continue;
    const p = await knex('programs').where({ id: c.program_id }).first();
    if (!p) continue;
    
    let cat = '', name = '';
    const t = p.title;
    if (t.startsWith('Certificate in')) { cat='Certificate'; name=t.replace('Certificate in ',''); }
    else if (t.startsWith('Diploma in')) { cat='Diploma'; name=t.replace('Diploma in ',''); }
    else if (t.startsWith('Bachelor of') || t==='BA Theology & Ministry') { cat='Bachelor'; name=t.startsWith('Bachelor of ')?t.replace('Bachelor of ',''):'Theology and Ministry'; }
    else if (t.startsWith('Master of')) { cat='Master'; name=t.replace('Master of ',''); }
    else if (t.startsWith('Doctor of')) { cat='Doctor'; name=t.replace('Doctor of ',''); }
    else continue;

    const extra = (CAT[cat] || {})[name];
    if (!extra) { console.log(`   SKIP (no map): ${t}`); continue; }

    // Deduplicate
    const allCodes = [...CORE_CODES, ...extra];
    const seen = new Set();
    const codes = [];
    for (const code of allCodes) { if (!seen.has(code)) { seen.add(code); codes.push(code); } }

    const yrs = cat==='Certificate'?1 : cat==='Diploma'?2 : cat==='Bachelor'?4 : 2;
    const cred = cat==='Certificate'?30 : cat==='Diploma'?60 : cat==='Bachelor'?120 : 60;

    await knex('courses').where({ id: c.id }).update({
      credits: cred, year_level: yrs, category: cat.toLowerCase(), published: true,
      summary: `A ${yrs}-year programme in ${p.title.replace(' — Introductory Course','')}.`,
      featured_image: '/img/generated/gdcu-online-learning.webp',
    });

    let so = 0;
    for (const code of codes) {
      const sid = smMap[code];
      if (!sid) continue;
      await knex.raw('INSERT OR IGNORE INTO course_shared_modules (course_id, shared_module_id, sort_order) VALUES (?,?,?)', [c.id, sid, so++]);

      const mod = await knex('modules').where({ shared_module_id: sid }).first();
      if (!mod) continue;
      const srcQ = await knex('quizzes').where({ module_id: mod.id, course_id: FIRST_COURSE_ID }).first();
      if (!srcQ) continue;

      // Clone quiz for this course
      const [nq] = await knex('quizzes').insert({
        course_id: c.id, module_id: mod.id, title: `Quiz: ${mod.title}`,
        description: `Test understanding of ${mod.title}.`,
        pass_mark: 60, time_limit_min: 10, sort_order: so, after_block: 3, covers_blocks: 3,
      });
      const qs = await knex('quiz_questions').where({ quiz_id: srcQ.id });
      for (const q of qs) {
        const [nqq] = await knex('quiz_questions').insert({ quiz_id: nq, prompt: q.prompt, sort_order: q.sort_order });
        const opts = await knex('quiz_options').where({ question_id: q.id });
        for (const o of opts) await knex('quiz_options').insert({ question_id: nqq, text: o.text, is_correct: o.is_correct, sort_order: o.sort_order });
      }
    }

    // Assignments
    const INSTR = [
      'Write a 500-word reflection on how the foundations covered apply to your personal ministry context.',
      'Analyze a case study from your context using the principles covered in this module.',
      'Write a 750-word research essay exploring a key theme with at least three scholarly sources.',
      'Develop a ministry plan applying the module concepts to a specific context with goals and evaluation.',
      'Write a critical review of a key text related to this module, summarizing arguments and evaluating strengths.',
      'Prepare a theological reflection paper connecting content with scripture, tradition, and experience.',
    ];
    for (let ai = 0; ai < Math.min(codes.length, 6); ai++) {
      await knex('assignments').insert({
        course_id: c.id, title: `Assignment ${ai+1}: Module Reflection`,
        instructions: INSTR[ai % 6], max_points: 100,
        due_date: new Date(Date.now() + 14*86400000*(ai+1)), published: true, sort_order: ai+1,
      });
    }

    // Final exam
    const [eid] = await knex('quizzes').insert({
      course_id: c.id, title: `Final Exam: ${p.title.replace(' — Introductory Course','')}`,
      description: 'Comprehensive final exam. Pass mark: 70% required for certificate.',
      pass_mark: 70, time_limit_min: 60, is_final_exam: true, sort_order: 99,
    });
    for (let qi = 0; qi < 10; qi++) {
      const [qq] = await knex('quiz_questions').insert({
        quiz_id: eid, prompt: `Final Q${qi+1}: Drawing from the complete programme, which best reflects the comprehensive teaching?`,
        sort_order: qi+1,
      });
      await knex('quiz_options').insert([
        { question_id: qq, text: 'The correct comprehensive answer.', is_correct: true },
        { question_id: qq, text: 'A partial answer missing key dimensions.', is_correct: false },
        { question_id: qq, text: 'An approach contradicted by course material.', is_correct: false },
        { question_id: qq, text: 'A common error the course addresses.', is_correct: false },
      ]);
    }
  }

  // Clean up template course artifacts
  await knex('quizzes').where({ course_id: FIRST_COURSE_ID }).delete();
  await knex('assignments').where({ course_id: FIRST_COURSE_ID }).delete();

  // ─── SUMMARY ───────────────────────────────────────────────
  const [mc] = await knex('modules').count('* as c');
  const [lc] = await knex('lessons').count('* as c');
  const [qc] = await knex('quizzes').count('* as c');
  const [ac] = await knex('assignments').count('* as c');
  const [fc] = await knex('quizzes').where({ is_final_exam: true }).count('* as c');
  const [cc] = await knex('course_shared_modules').count('* as c');
  
  console.log(`\n=== SEED COMPLETE ===`);
  console.log(`  Shared modules: 21`);
  console.log(`  Modules: ${mc.c}`);
  console.log(`  Lessons: ${lc.c} (15-min blocks, 3 per module)`);
  console.log(`  Quizzes: ${qc.c} (${fc.c} final exams)`);
  console.log(`  Assignments: ${ac.c}`);
  console.log(`  Course-Module links: ${cc.c}`);

  knex.destroy();
}

seed().catch(e => { console.error(e); process.exit(1); });
