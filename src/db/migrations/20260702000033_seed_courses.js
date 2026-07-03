/**
 * Migration + Seed: Creates shared module content (modules, lessons, quizzes)
 * and assigns them to all existing courses.
 * 
 * Runs on every deploy via knex migrate:latest.
 * Idempotent — skips if shared_modules already populated.
 */
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
const CORE = ['CORE-101','CORE-102','CORE-103','CORE-104','CORE-105','CORE-106'];
const R1 = ['Scripture serves as the foundation for all Christian theology. This reading explores divine revelation through creation, Scripture, and Jesus Christ.','God\'s story unfolds through covenant. This reading traces the major covenants of the Old Testament from Adam through Abraham, Moses, and David.','Jesus Christ is the center of the Christian faith. This reading examines Gospel accounts of His life, death, and resurrection.','The Holy Spirit\'s work is vital for the believer. This reading explores the Spirit\'s role in conviction, regeneration, sanctification, and empowerment.','The church is the body of Christ. This reading examines biblical images of the church: body, temple, bride, family, and flock.','Christian ministry is rooted in servanthood. This reading explores biblical and theological foundations of ministry modeled by Christ.','Prayer and discipleship are essential disciplines. This reading examines biblical teaching on prayer, spiritual growth, and formation.','The mission of God is Scripture\'s overarching narrative. This reading explores redemptive history from Genesis to Revelation.','Christian leadership requires character, competence, and calling. This reading examines biblical qualifications for leadership.','Sound doctrine matters for healthy ministry. This reading introduces the major doctrines of the Christian faith.'];
const R2 = ['This reading examines how the Bible came to be — its inspiration, canonization, and transmission through history.','The Exodus is the defining salvation event of the Old Testament, prefiguring Christ\'s ultimate redemption.','The atonement is the heart of the Gospel. This reading surveys Christus Victor, penal substitution, and moral influence models.','Spiritual gifts and fruit of the Spirit are both essential for Christian life and ministry in the body of Christ.','Church governance varies across traditions. This reading examines episcopal, presbyterian, and congregational models.','Christian ethics require discernment. This reading introduces deontological, teleological, and virtue approaches.','Worship is both personal and corporate. This reading examines biblical theology of worship from tabernacle to early church.','Gospel and culture is a key missiological concern. This reading explores contextualization through Paul\'s example at the Areopagus.','Conflict resolution is crucial for leaders. This reading examines Matthew 18 and Pauline principles for reconciliation.','Eschatology shapes how Christians live. This reading surveys amillennial, premillennial, and postmillennial views.'];
const CAT = { 'Certificate':{'Biblical Studies':['BIBL-201','BIBL-202'],'Christian Ministry':['MIN-201','MIN-202'],'Pastoral Care':['MIN-201','COUN-301'],'Chaplaincy and Spiritual Care':['MIN-201','CHAP-301'],'Christian Leadership':['LEAD-201','LEAD-202'],'Missions and Diaspora Ministry':['MIN-202','MISS-301'],'Church Administration':['LEAD-202','LEAD-203'],'Prayer, Discipleship and Spiritual Formation':['CORE-106','MIN-203']}, 'Diploma':{'Biblical Studies':['BIBL-201','BIBL-202','BIBL-203','THEO-301','THEO-302'],'Christian Ministry':['MIN-201','MIN-202','MIN-203','THEO-301','COUN-301'],'Chaplaincy and Pastoral Care':['MIN-201','CHAP-301','COUN-301','THEO-302'],'Christian Leadership':['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303'],'Theology and Ministry':['BIBL-201','MIN-201','THEO-301','THEO-302','THEO-303'],'Missions and Global Christianity':['MIN-203','MISS-301','BIBL-202','THEO-303'],'Pastoral Counselling for Ministry':['MIN-201','COUN-301','CHAP-301','THEO-302']}, 'Bachelor':{'Biblical Studies':['BIBL-201','BIBL-202','BIBL-203','THEO-301','THEO-302','THEO-303','COUN-301'],'Christian Ministry':['MIN-201','MIN-202','MIN-203','LEAD-201','THEO-301','COUN-301','THEO-302','MISS-301'],'Christian Leadership':['LEAD-201','LEAD-202','LEAD-203','MIN-201','THEO-301','THEO-303','COUN-301','MISS-301'],'Chaplaincy and Pastoral Care':['MIN-201','CHAP-301','COUN-301','LEAD-201','THEO-302','THEO-301','COUN-301'],'Theology and Ministry':['BIBL-201','BIBL-202','THEO-301','MIN-201','THEO-302','THEO-303','MISS-301','COUN-301'],'Missions and Global Christianity':['MIN-203','MISS-301','BIBL-202','BIBL-203','THEO-303','THEO-302','COUN-301','MIN-202']}, 'Master':{'Christian Theology':['THEO-301','THEO-302','THEO-303'],'Christian Ministry':['MIN-201','MIN-202','MIN-203','LEAD-201','COUN-301','MISS-301'],'Christian Leadership':['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303','MIN-201'],'Chaplaincy and Spiritual Care':['CHAP-301','COUN-301','MIN-201','THEO-302'],'Pastoral Care and Counselling for Ministry':['COUN-301','CHAP-301','MIN-201','THEO-302','THEO-301'],'Missions and Diaspora Ministry':['MISS-301','MIN-203','BIBL-202','THEO-303','THEO-302']}, 'Doctor':{'Christian Ministry':['THEO-301','THEO-302','THEO-303','COUN-301','MISS-301','LEAD-201'],'Practical Theology':['THEO-301','MIN-201','THEO-302','THEO-303','COUN-301','CHAP-301'],'Chaplaincy and Spiritual Care':['CHAP-301','COUN-301','MIN-201','THEO-302'],'Christian Leadership':['LEAD-201','LEAD-202','LEAD-203','THEO-301','THEO-303','MIN-201']}};
const INSTR = ['Write a 500-word reflection on how the foundations apply to your ministry context.','Analyze a case study using the module principles.','Write a 750-word research essay with scholarly sources.','Develop a ministry plan applying module concepts.','Write a critical review of a key text.','Prepare a theological reflection paper.'];

function rd(a,i){return a[i%10];}
function vd(c,b){var ids=['dQw4w9WgXcQ','3bG8rE8JQqE','Mh6iJF9CJcA','IJ9Vn1qSJ7A','B8Io1sIeCJs'];return 'https://www.youtube.com/embed/'+ids[(c.length+b)%5];}
function ct(ttl,bi,bl){var p=bi+1;return (bi>0?'<p><em>📺 This continues from the previous video.</em></p>\n\n':'')+'<h2>📖 Reading 1: Foundation Text (Part '+p+')</h2><p>'+rd(R1,bi*2)+'</p><h2>📖 Reading 2: Supplementary Reading (Part '+p+')</h2><p>'+rd(R2,bi*2+1)+'</p><h2>🎬 Video Lesson — Part '+p+'/'+bl+'</h2><p>Watch the <strong>15-minute video</strong> on <em>'+ttl+'</em>.</p>'+(bi<bl-1?'<p><em>✅ Section complete. Continue with Part '+(p+1)+'.</em></p>':'<p><em>✅ Module complete. Proceed to the quiz.</em></p>');}

exports.up = async function (knex) {
  // ── SKIP if already seeded ────────────────────────────────
  const existing = await knex('shared_modules').count('* as c').first();
  if (existing && Number(existing.c) > 0) {
    console.log('  shared_modules already populated — skipping seed.');
    return;
  }
  console.log('  Seeding course content...');

  // 1. Create shared module definitions
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

  // 2. Create module content (lessons + quizzes)
  // Requires an existing course to anchor the template modules. On a fresh
  // database (no courses/programs seeded yet) there is nothing to attach to —
  // bail out cleanly rather than crash on `.id` of undefined.
  const firstCourse = await knex('courses').orderBy('id').first();
  if (!firstCourse) {
    console.log('  No courses found — skipping course-content seed.');
    return;
  }
  const firstId = firstCourse.id;
  for (const [code, ttl] of Object.entries(MODS)) {
    const [mid] = await knex('modules').insert({
      course_id: firstId, shared_module_id: smMap[code], title: ttl, summary: ttl,
      sort_order: 0, year_level: code.startsWith('CORE') ? 1 : 2,
      featured_image: '/img/generated/gdcu-online-learning.webp',
    });
    for (let bi = 0; bi < 3; bi++) {
      const bt = ttl+' — Part '+(bi+1)+'/3';
      const [lid] = await knex('lessons').insert({
        module_id: mid, title: bt, content: ct(ttl, bi, 3),
        video_url: vd(code, bi), type: 'essay', duration_min: 15,
        sort_order: bi+1, block_no: bi+1, block_title: bt,
      });
      await knex('lesson_materials').insert([
        { lesson_id: lid, label: 'Reading 1: Foundation Text (Part '+(bi+1)+')', url: '#', type: 'link' },
        { lesson_id: lid, label: 'Reading 2: Supplementary Reading (Part '+(bi+1)+')', url: '#', type: 'link' },
      ]);
    }
    const [qid] = await knex('quizzes').insert({
      module_id: mid, course_id: firstId, title: 'Quiz: '+ttl,
      description: 'Test understanding of '+ttl+'.', pass_mark: 60, time_limit_min: 10,
      sort_order: 1, after_block: 3, covers_blocks: 3,
    });
    for (let qi = 0; qi < 5; qi++) {
      const [qq] = await knex('quiz_questions').insert({ quiz_id: qid, prompt: 'Q'+(qi+1)+': Which best reflects the key principle?', sort_order: qi+1 });
      await knex('quiz_options').insert([
        { question_id: qq, text: 'The correct answer.', is_correct: true },
        { question_id: qq, text: 'A common misunderstanding.', is_correct: false },
        { question_id: qq, text: 'An approach that contradicts the module.', is_correct: false },
        { question_id: qq, text: 'An unrelated concept.', is_correct: false },
      ]);
    }
  }

  // 3. Assign to all courses + create course quizzes/assignments/finals
  const courses = await knex('courses').select('*').orderBy('id');
  for (const c of courses) {
    if (c.id === firstId) continue;
    const p = await knex('programs').where({ id: c.program_id }).first();
    if (!p) continue;
    let cat = '', name = '';
    const t = p.title;
    if (t.startsWith('Certificate in ')) { cat='Certificate'; name=t.replace('Certificate in ',''); }
    else if (t.startsWith('Diploma in ')) { cat='Diploma'; name=t.replace('Diploma in ',''); }
    else if (t.startsWith('Bachelor of ') || t==='BA Theology & Ministry') { cat='Bachelor'; name=t.startsWith('Bachelor of ')?t.replace('Bachelor of ',''):'Theology and Ministry'; }
    else if (t.startsWith('Master of ')) { cat='Master'; name=t.replace('Master of ',''); }
    else if (t.startsWith('Doctor of ')) { cat='Doctor'; name=t.replace('Doctor of ',''); }
    else continue;

    const extra = (CAT[cat]||{})[name];
    if (!extra) continue;
    const allCodes = [...CORE, ...extra], seen = new Set(), codes = [];
    for (const code of allCodes) { if (!seen.has(code)) { seen.add(code); codes.push(code); } }
    const yrs = cat==='Certificate'?1:cat==='Diploma'?2:cat==='Bachelor'?4:2;
    const cred = cat==='Certificate'?30:cat==='Diploma'?60:cat==='Bachelor'?120:60;

    await knex('courses').where({id:c.id}).update({
      credits:cred, year_level:yrs, category:cat.toLowerCase(), published:true,
      summary: 'A '+yrs+'-year programme in '+p.title.replace(' — Introductory Course','')+'.',
      featured_image:'/img/generated/gdcu-online-learning.webp',
    });

    let so = 0;
    for (const code of codes) {
      const sid = smMap[code];
      if (!sid) continue;
      await knex('course_shared_modules').insert({ course_id: c.id, shared_module_id: sid, sort_order: so++ });
      const mod = await knex('modules').where({shared_module_id:sid}).first();
      if (!mod) continue;
      const srcQ = await knex('quizzes').where({module_id:mod.id,course_id:firstId}).first();
      if (!srcQ) continue;
      const [nq] = await knex('quizzes').insert({course_id:c.id,module_id:mod.id,title:'Quiz: '+mod.title,description:'Test understanding.',pass_mark:60,time_limit_min:10,sort_order:so,after_block:3,covers_blocks:3});
      const qs = await knex('quiz_questions').where({quiz_id:srcQ.id});
      for (const q of qs) {
        const [nqq] = await knex('quiz_questions').insert({quiz_id:nq,prompt:q.prompt,sort_order:q.sort_order});
        const opts = await knex('quiz_options').where({question_id:q.id});
        for (const o of opts) await knex('quiz_options').insert({question_id:nqq,text:o.text,is_correct:o.is_correct,sort_order:o.sort_order});
      }
    }

    for (let ai=0; ai<Math.min(codes.length,6); ai++) {
      await knex('assignments').insert({
        course_id:c.id, title:'Assignment '+(ai+1)+': Module Reflection',
        instructions:INSTR[ai%6], max_points:100,
        due_date:new Date(Date.now()+14*86400000*(ai+1)), published:true, sort_order:ai+1,
      });
    }

    const [eid] = await knex('quizzes').insert({
      course_id:c.id, title:'Final Exam: '+p.title.replace(' — Introductory Course',''),
      description:'Comprehensive final exam. Pass mark: 70%.',
      pass_mark:70, time_limit_min:60, is_final_exam:true, sort_order:99,
    });
    for (let qi=0; qi<10; qi++) {
      const [qq] = await knex('quiz_questions').insert({quiz_id:eid, prompt:'Final Q'+(qi+1)+': Which best reflects the comprehensive teaching?', sort_order:qi+1});
      await knex('quiz_options').insert([{question_id:qq,text:'Correct answer.',is_correct:true},{question_id:qq,text:'Partial answer.',is_correct:false},{question_id:qq,text:'Incorrect approach.',is_correct:false},{question_id:qq,text:'Common error.',is_correct:false}]);
    }
  }

  // Clean up template course quizzes/assignments
  await knex('quizzes').where({course_id:firstId}).delete();
  await knex('assignments').where({course_id:firstId}).delete();

  const [mc] = await knex('modules').count('* as c');
  console.log('  ✓ Seed complete: '+mc.c+' modules created.');
};

exports.down = async function (knex) {
  // Seed is not reversible (would delete course content)
  console.log('  Seed rollback skipped — content preserved.');
};
