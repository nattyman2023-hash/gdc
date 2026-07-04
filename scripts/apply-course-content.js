/**
 * Apply authored course content (scratchpad/content/mod-*.json) to the local DB.
 *
 * The shared-module system means:
 *  - LESSONS are shared: each shared module has ONE template module row whose
 *    3 lessons are displayed for every course that links the module. Update once.
 *  - QUIZZES are per-course COPIES (quizzes.module_id -> template module id, but
 *    quizzes.course_id -> the specific course). Update every copy.
 *  - FINAL EXAMS are per-course (is_final_exam=1). We rebuild them from real
 *    module questions belonging to that course.
 *  - ASSIGNMENTS are per-course; we map each course's assignments onto the
 *    authored assignment for the modules it actually covers.
 *
 * Idempotent: re-running replaces content with the latest JSON.
 *
 * Usage: node scripts/apply-course-content.js [path-to-content-dir]
 */
const fs = require('fs');
const path = require('path');
const knex = require('knex')(require('../knexfile').development);

const CONTENT_DIR = process.argv[2]
  || 'C:/Users/Natty/AppData/Local/Temp/claude/c--Users-Natty-Desktop-Anti-Grav-GDCU/39ea1cff-b2f1-4364-8629-e2b8b528060a/scratchpad/content';

function validate(mod, file) {
  const errs = [];
  if (!mod.code) errs.push('missing code');
  if (!Array.isArray(mod.lessons) || mod.lessons.length !== 3) errs.push(`expected 3 lessons, got ${mod.lessons && mod.lessons.length}`);
  (mod.lessons || []).forEach((l, i) => {
    if (!l.content || l.content.length < 200) errs.push(`lesson ${i + 1} content too short`);
    if (/<script|<iframe|youtube|<img/i.test(l.content || '')) errs.push(`lesson ${i + 1} contains forbidden tag`);
  });
  const qs = (mod.quiz && mod.quiz.questions) || [];
  if (qs.length !== 5) errs.push(`expected 5 quiz questions, got ${qs.length}`);
  qs.forEach((q, i) => {
    if (!q.prompt) errs.push(`q${i + 1} no prompt`);
    const opts = q.options || [];
    if (opts.length !== 4) errs.push(`q${i + 1} expected 4 options, got ${opts.length}`);
    if (opts.filter((o) => o.correct).length !== 1) errs.push(`q${i + 1} must have exactly 1 correct`);
  });
  if (!mod.assignment || !mod.assignment.instructions) errs.push('missing assignment');
  if (errs.length) throw new Error(`${file}: ${errs.join('; ')}`);
}

async function main() {
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => /^mod-.*\.json$/.test(f)).sort();
  console.log(`Found ${files.length} content files in ${CONTENT_DIR}`);

  const mods = [];
  for (const f of files) {
    let json;
    try { json = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')); }
    catch (e) { console.error(`✗ ${f}: invalid JSON — ${e.message}`); continue; }
    try { validate(json, f); } catch (e) { console.error(`✗ ${e.message}`); continue; }
    mods.push(json);
  }
  console.log(`${mods.length} valid modules to apply.\n`);
  if (!mods.length) { await knex.destroy(); return; }

  // code -> { smId, moduleId, assignment }
  const byCode = {};

  await knex.transaction(async (trx) => {
    // ── 1 & 2. Lessons (shared) + module quiz copies ─────────────
    for (const mod of mods) {
      const sm = await trx('shared_modules').where({ code: mod.code }).first();
      if (!sm) { console.error(`✗ ${mod.code}: no shared_module row`); continue; }
      const tmpl = await trx('modules').where({ shared_module_id: sm.id }).first();
      if (!tmpl) { console.error(`✗ ${mod.code}: no template module`); continue; }
      byCode[mod.code] = { smId: sm.id, moduleId: tmpl.id, assignment: mod.assignment };

      // Lessons — match the 3 blocks by sort_order 1..3.
      const lessons = await trx('lessons').where({ module_id: tmpl.id }).orderBy('sort_order');
      for (let i = 0; i < Math.min(3, lessons.length); i++) {
        const src = mod.lessons[i];
        const t = `Part ${src.part || i + 1}: ${src.title}`;
        await trx('lessons').where({ id: lessons[i].id }).update({
          title: t,
          block_title: t,
          content: src.content,
          video_url: null,
          type: 'essay',
        });
        // Drop placeholder ('#') materials — content is now inline.
        await trx('lesson_materials').where({ lesson_id: lessons[i].id, url: '#' }).delete();
      }

      // Module quizzes: every per-course copy referencing this module (not finals).
      const quizzes = await trx('quizzes')
        .where({ module_id: tmpl.id })
        .andWhere((b) => b.whereNull('is_final_exam').orWhere('is_final_exam', false).orWhere('is_final_exam', 0));
      for (const qz of quizzes) {
        const qqs = await trx('quiz_questions').where({ quiz_id: qz.id });
        const qqIds = qqs.map((q) => q.id);
        if (qqIds.length) await trx('quiz_options').whereIn('question_id', qqIds).delete();
        await trx('quiz_questions').where({ quiz_id: qz.id }).delete();
        let so = 0;
        for (const q of mod.quiz.questions) {
          const [qid] = await trx('quiz_questions').insert({ quiz_id: qz.id, prompt: q.prompt, sort_order: ++so });
          let oso = 0;
          for (const o of q.options) {
            await trx('quiz_options').insert({ question_id: qid, text: o.text, is_correct: !!o.correct, sort_order: ++oso });
          }
        }
      }
      console.log(`  ✓ ${mod.code}: lessons + ${quizzes.length} quiz copies updated`);
    }

    // ── 3. Assignments — map each course's assignments to its modules ──
    const courses = await trx('courses').select('id');
    let asgUpdated = 0;
    for (const c of courses) {
      const asgs = await trx('assignments').where({ course_id: c.id }).orderBy('sort_order');
      if (!asgs.length) continue;
      // The shared modules this course covers, in order.
      const smIds = await trx('course_shared_modules').where({ course_id: c.id }).orderBy('sort_order').pluck('shared_module_id');
      const codeBySm = {};
      for (const [code, v] of Object.entries(byCode)) codeBySm[v.smId] = code;
      // Carry the owning module's id along with its authored assignment so each
      // assignment can be linked to (and displayed under) the right module.
      const moduleAsgs = smIds.map((id) => byCode[codeBySm[id]]).filter(Boolean)
        .map((v) => ({ title: v.assignment.title, instructions: v.assignment.instructions, moduleId: v.moduleId }));
      if (!moduleAsgs.length) continue;
      for (let i = 0; i < asgs.length; i++) {
        const a = moduleAsgs[i % moduleAsgs.length];
        await trx('assignments').where({ id: asgs[i].id }).update({ title: a.title, instructions: a.instructions, module_id: a.moduleId });
        asgUpdated++;
      }
    }
    console.log(`  ✓ ${asgUpdated} assignments rewritten across ${courses.length} courses`);

    // ── 4. Final exams — rebuild from this course's real module questions ──
    const finals = await trx('quizzes').where({ is_final_exam: true });
    let finalsBuilt = 0;
    for (const fx of finals) {
      // Real module questions available to this course.
      const modQuizzes = await trx('quizzes')
        .where({ course_id: fx.course_id })
        .andWhere((b) => b.whereNull('is_final_exam').orWhere('is_final_exam', false).orWhere('is_final_exam', 0))
        .whereNotNull('module_id');
      const pool = [];
      for (const mq of modQuizzes) {
        const qqs = await trx('quiz_questions').where({ quiz_id: mq.id }).orderBy('sort_order');
        for (const q of qqs) pool.push(q);
      }
      if (pool.length < 5) continue; // nothing meaningful to build from
      // Deterministic spread: pick every Nth question up to 10.
      const want = Math.min(10, pool.length);
      const step = Math.max(1, Math.floor(pool.length / want));
      const picks = [];
      for (let i = 0; i < pool.length && picks.length < want; i += step) picks.push(pool[i]);

      // Clear old final questions/options.
      const oldQ = await trx('quiz_questions').where({ quiz_id: fx.id }).pluck('id');
      if (oldQ.length) await trx('quiz_options').whereIn('question_id', oldQ).delete();
      await trx('quiz_questions').where({ quiz_id: fx.id }).delete();

      let so = 0;
      for (const q of picks) {
        const [nqid] = await trx('quiz_questions').insert({ quiz_id: fx.id, prompt: q.prompt, sort_order: ++so });
        const opts = await trx('quiz_options').where({ question_id: q.id }).orderBy('sort_order');
        let oso = 0;
        for (const o of opts) {
          await trx('quiz_options').insert({ question_id: nqid, text: o.text, is_correct: o.is_correct, sort_order: ++oso });
        }
      }
      finalsBuilt++;
    }
    console.log(`  ✓ ${finalsBuilt} final exams rebuilt from real module questions`);
  });

  console.log('\nDone.');
  await knex.destroy();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
