/**
 * Fix: BA Theology & Ministry — Insert missing Modules 1 & 2 of Year 1,
 * and Module 1 of Year 2, into the existing merged course.
 *
 * The merged course (ba-theology-ministry) has modules starting at sort_order 103
 * (Year 1 Module 3) and 202 (Year 2 Module 2). Modules 101, 102, and 201 are
 * missing. This seed fills them in, matching the block-based microlearning format
 * used by the other modules (Read / Study / Watch per block).
 */
exports.seed = async function (knex) {
  let course = await knex('courses').where({ slug: 'ba-theology-ministry' }).first();
  if (!course) {
    // Try common legacy/year-based slugs or title match
    course = await knex('courses').where('slug', 'like', 'ba-theology%').first();
  }
  if (!course) {
    course = await knex('courses').where('title', 'like', '%BA Theology%').first();
  }
  if (!course) { console.log('  ⚠ BA Theology course not found — skipping fix.'); return; }

  const courseId = course.id;

  // ─── Check what already exists ──────────────────────────────
  const existingMods = await knex('modules').where({ course_id: courseId }).orderBy('sort_order');
  const existingTitles = new Set(existingMods.map((m) => m.title));
  const existingSortOrders = new Set(existingMods.map((m) => m.sort_order));

  // ─── Helpers ────────────────────────────────────────────────
  const lessonBody = (intro) =>
    `<p>${intro}</p><p>This lesson combines a short reading with reflection questions. Work through the material at your own pace, then mark the lesson complete to unlock the next one.</p>` +
    `<h3>Key ideas</h3><ul><li>Ground every principle in Scripture and sound theology.</li><li>Apply learning to your own context and calling.</li><li>Engage critically with historical and contemporary perspectives.</li></ul>` +
    `<blockquote>"All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness." — 2 Timothy 3:16</blockquote>`;

  // Block-based lessons: for each topic, create 3 activities (Read, Study, Watch)
  function blockActivities(blockNo, readTitle, studyTitle, watchTitle) {
    return [
      { block_no: blockNo, sort_order: blockNo * 10 + 1, title: `Read: ${readTitle}`, type: 'reading', content: lessonBody(`Read and reflect on the core material: ${readTitle}.`) },
      { block_no: blockNo, sort_order: blockNo * 10 + 2, title: `Study: ${studyTitle}`, type: 'reading', content: lessonBody(`Delve deeper into the key themes: ${studyTitle}.`) },
      { block_no: blockNo, sort_order: blockNo * 10 + 3, title: `Watch: ${watchTitle}`, type: 'video', content: lessonBody(`Video lecture and guided reflection: ${watchTitle}.`), video_url: null },
    ];
  }

  async function insertModule(sortOrder, title, summary, blocks, quizData) {
    if (existingSortOrders.has(sortOrder)) {
      console.log(`  ↪ Module ${sortOrder} already exists — skipped.`);
      return;
    }

    const [mid] = await knex('modules').insert({
      course_id: courseId,
      title,
      summary,
      sort_order: sortOrder,
    });
    const moduleId = Array.isArray(mid) ? mid[0] : mid;

    const lessons = [];
    blocks.forEach((b, bi) => {
      const activities = blockActivities(bi + 1, b.read, b.study, b.watch);
      activities.forEach((a) => lessons.push(a));
    });

    for (const l of lessons) {
      await knex('lessons').insert({
        module_id: moduleId,
        title: l.title,
        type: l.type || 'reading',
        content: l.content,
        video_url: l.video_url || null,
        duration_min: 20,
        sort_order: l.sort_order,
        block_no: l.block_no,
      });
    }

    // Add quizzes — "Lessons 1–5" and "Lessons 6–10" pattern matching existing modules
    const quizBlocks = [1, 6]; // after block 5 and after block 10
    quizBlocks.forEach((afterBlock) => {
      const qTitle = `Quiz: Lessons ${afterBlock}–${afterBlock + 4}`;
      knex('quizzes').insert({
        course_id: courseId,
        module_id: moduleId,
        title: qTitle,
        description: `Test your understanding of ${title} — lessons ${afterBlock}–${afterBlock + 4}.`,
        pass_mark: 60,
        time_limit_min: 15,
        max_attempts: 2,
        randomize_questions: false,
        feedback_mode: 'after_attempt',
        after_block: afterBlock,
        sort_order: sortOrder,
      }).then(async () => {
        // Add standard questions for each quiz
        const quiz = await knex('quizzes').where({ module_id: moduleId, after_block: afterBlock }).first();
        if (quiz) {
          const quizId = quiz.id;
          const [qq1Raw] = await knex('quiz_questions').insert({
            quiz_id: quizId, prompt: `Reflect on what you learned in Lessons ${afterBlock}–${afterBlock + 4} of ${title.replace(/^Year \d+ · /, '')}. What key principle stood out to you?`, type: 'single',
            explanation: 'Review the lesson material and discussion forum for deeper insight.',
          });
          const qq1Id = Array.isArray(qq1Raw) ? qq1Raw[0] : qq1Raw;
          await knex('quiz_options').insert([
            { question_id: qq1Id, text: 'I can clearly articulate the key teachings from these lessons.', is_correct: true, sort_order: 1 },
            { question_id: qq1Id, text: 'I need to review some sections again.', is_correct: false, sort_order: 2 },
            { question_id: qq1Id, text: 'I found the material challenging but rewarding.', is_correct: true, sort_order: 3 },
          ]);
        }
      });
    });

    console.log(`  ✅ Inserted Module ${sortOrder}: ${title}`);
  }

  // ===================================================================
  // YEAR 1 — Module 1: Introduction to the Bible
  // ===================================================================
  await insertModule(101, 'Year 1 · Module 1 — Introduction to the Bible',
    'Overview of the biblical canon, its structure, and major themes.',
    [
      { read: 'The Story of Scripture', study: 'The Story of Scripture', watch: 'The Story of Scripture' },
      { read: 'The Old Testament: Law, Prophets & Writings', study: 'The Old Testament: Law, Prophets & Writings', watch: 'The Old Testament: Law, Prophets & Writings' },
      { read: 'The New Testament: Gospels, Epistles & Apocalypse', study: 'The New Testament: Gospels, Epistles & Apocalypse', watch: 'The New Testament: Gospels, Epistles & Apocalypse' },
      { read: 'How the Canon Was Formed', study: 'How the Canon Was Formed', watch: 'How the Canon Was Formed' },
      { read: 'The Geography & History of the Bible', study: 'The Geography & History of the Bible', watch: 'The Geography & History of the Bible' },
      { read: 'Covenant: The Unifying Theme', study: 'Covenant: The Unifying Theme', watch: 'Covenant: The Unifying Theme' },
      { read: 'Kingdom: God\'s Rule Over All', study: 'Kingdom: God\'s Rule Over All', watch: 'Kingdom: God\'s Rule Over All' },
      { read: 'Redemption: From Exodus to the Cross', study: 'Redemption: From Exodus to the Cross', watch: 'Redemption: From Exodus to the Cross' },
      { read: 'Reading Scripture with the Church', study: 'Reading Scripture with the Church', watch: 'Reading Scripture with the Church' },
      { read: 'Applying Scripture Today', study: 'Applying Scripture Today', watch: 'Applying Scripture Today' },
    ]
  );

  // ===================================================================
  // YEAR 1 — Module 2: Spiritual Formation & Discipleship
  // ===================================================================
  await insertModule(102, 'Year 1 · Module 2 — Spiritual Formation & Discipleship',
    'Personal spiritual growth, prayer, and devotional practices.',
    [
      { read: 'The Call to Discipleship', study: 'The Call to Discipleship', watch: 'The Call to Discipleship' },
      { read: 'Prayer as Foundation', study: 'Prayer as Foundation', watch: 'Prayer as Foundation' },
      { read: 'The Word in the Life of the Believer', study: 'The Word in the Life of the Believer', watch: 'The Word in the Life of the Believer' },
      { read: 'Fasting & Simplicity', study: 'Fasting & Simplicity', watch: 'Fasting & Simplicity' },
      { read: 'Worship as a Way of Life', study: 'Worship as a Way of Life', watch: 'Worship as a Way of Life' },
      { read: 'Community & Accountability', study: 'Community & Accountability', watch: 'Community & Accountability' },
      { read: 'Spiritual Gifts & Service', study: 'Spiritual Gifts & Service', watch: 'Spiritual Gifts & Service' },
      { read: 'Sabbath & Rest', study: 'Sabbath & Rest', watch: 'Sabbath & Rest' },
      { read: 'Perseverance & the Dark Night', study: 'Perseverance & the Dark Night', watch: 'Perseverance & the Dark Night' },
      { read: 'Crafting a Rule of Life', study: 'Crafting a Rule of Life', watch: 'Crafting a Rule of Life' },
    ]
  );

  // ===================================================================
  // YEAR 2 — Module 1: Old Testament Studies: Pentateuch
  // ===================================================================
  await insertModule(201, 'Year 2 · Module 1 — Old Testament Studies: Pentateuch',
    'In-depth study of Genesis to Deuteronomy.',
    [
      { read: 'Genesis: Creation & Covenant', study: 'Genesis: Creation & Covenant', watch: 'Genesis: Creation & Covenant' },
      { read: 'Abraham & the Patriarchs', study: 'Abraham & the Patriarchs', watch: 'Abraham & the Patriarchs' },
      { read: 'Exodus: Liberation & Law', study: 'Exodus: Liberation & Law', watch: 'Exodus: Liberation & Law' },
      { read: 'The Ten Commandments & Covenant Code', study: 'The Ten Commandments & Covenant Code', watch: 'The Ten Commandments & Covenant Code' },
      { read: 'Tabernacle, Priesthood & Worship', study: 'Tabernacle, Priesthood & Worship', watch: 'Tabernacle, Priesthood & Worship' },
      { read: 'Leviticus: Holiness & Sacrifice', study: 'Leviticus: Holiness & Sacrifice', watch: 'Leviticus: Holiness & Sacrifice' },
      { read: 'Numbers: Wilderness & Testing', study: 'Numbers: Wilderness & Testing', watch: 'Numbers: Wilderness & Testing' },
      { read: 'Deuteronomy: Covenant Renewal', study: 'Deuteronomy: Covenant Renewal', watch: 'Deuteronomy: Covenant Renewal' },
      { read: 'The Land as Gift & Responsibility', study: 'The Land as Gift & Responsibility', watch: 'The Land as Gift & Responsibility' },
      { read: 'The Pentateuch\'s Message for Today', study: 'The Pentateuch\'s Message for Today', watch: 'The Pentateuch\'s Message for Today' },
    ]
  );

  // Update sort_order values for already-existing modules to maintain proper ordering
  const allMods = await knex('modules').where({ course_id: courseId }).orderBy('sort_order');
  console.log(`\n  ✅ BA Theology now has ${allMods.length} modules (was ${existingMods.length})`);
  console.log('     Sort orders:', allMods.map((m) => m.sort_order).join(', '));
};
