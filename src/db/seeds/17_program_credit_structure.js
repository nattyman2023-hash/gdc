/**
 * Seed: Regulatory credit-structure compliance.
 *
 * Corrects programme-level semester credits to match Florida Commission
 * minimums and populates per-module credit values + instruction hours so
 * every programme page can publish a defensible credit structure.
 *
 * Florida minimums:
 *   Bachelor's  120 semester credits (45 general education for a BA)
 *   Master's     30 semester credits beyond the bachelor's
 *   Doctorate    60 semester credits beyond the bachelor's
 *
 * One semester credit = 15 hours of instruction + preparation, or an
 * equivalent amount of properly planned and assessed online learning.
 *
 * Idempotent — safe to run repeatedly.
 */
exports.seed = async function (knex) {
  const now = knex.fn.now();

  // ─── 1. Programme-level credit totals ──────────────────────────
  // Bachelor's: 120 credits, 45 general education
  await knex('programs').where({ level: 'Undergraduate' }).update({
    semester_credits: 120,
    gen_ed_credits: 45,
    updated_at: now,
  });

  // Master's: 30 credits (above the 24 minimum, safely compliant)
  await knex('programs').where({ level: 'Masters' }).update({
    semester_credits: 30,
    gen_ed_credits: null,
    updated_at: now,
  });

  // Doctorate: 60 credits beyond the bachelor's
  await knex('programs').where({ level: 'Doctorate' }).update({
    semester_credits: 60,
    gen_ed_credits: null,
    updated_at: now,
  });

  // Diploma: 60 credits (1-year undergraduate diploma)
  await knex('programs').where({ level: 'Diploma' }).update({
    semester_credits: 60,
    gen_ed_credits: null,
    updated_at: now,
  });

  // Certificate: 15 credits (6-month certificate)
  await knex('programs').where({ level: 'Certificate' }).update({
    semester_credits: 15,
    gen_ed_credits: null,
    updated_at: now,
  });

  // ─── 2. Per-module credit values & instruction hours ───────────
  // Every module in a degree programme carries a credit value and an
  // equivalent instruction-hour figure (credits × 15).
  //
  // Bachelor's modules: 4 credits each (30 modules × 4 = 120 credits)
  // Master's modules:   3 credits each (10 modules × 3 = 30 credits)
  // Doctoral modules:   3 credits each (20 modules × 3 = 60 credits)
  // Diploma modules:    3 credits each (20 modules × 3 = 60 credits)
  // Certificate modules: 3 credits each (5 modules × 3 = 15 credits)

  // Build the level → credits map by joining modules → courses → programs.
  const moduleRows = await knex
    .select('modules.id as module_id', 'programs.level as level')
    .from('modules')
    .leftJoin('courses', 'modules.course_id', 'courses.id')
    .leftJoin('programs', 'courses.program_id', 'programs.id');

  const creditsByLevel = {
    Undergraduate: 4,   // 4 credits × 30 modules = 120
    Masters: 3,         // 3 credits × 10 modules  = 30
    Doctorate: 3,       // 3 credits × 20 modules  = 60
    Diploma: 3,         // 3 credits × 20 modules  = 60
    Certificate: 3,     // 3 credits × 5 modules   = 15
  };

  for (const row of moduleRows) {
    const credits = creditsByLevel[row.level] || 3;
    const instructionHours = credits * 15;
    await knex('modules').where({ id: row.module_id }).update({
      credits,
      instruction_hours: instructionHours,
    });
  }

  // ─── 3. Credit-hour policy setting ─────────────────────────────
  // Store the institutional credit-hour policy as a settings row so it
  // can be displayed on the dedicated policy page and edited by admins.
  const policyKey = 'credit_hour_policy';
  const existingPolicy = await knex('settings').where({ key: policyKey }).first();

  const policyText = `Global Diaspora Christian University measures academic work in US semester credit hours, consistent with the standard used by the Florida Commission for Independent Education and widely recognised accrediting bodies.

## Definition of a Semester Credit Hour

One semester credit hour represents at least 15 hours of appropriate instruction, plus reasonable required preparation outside instruction, or an equivalent amount of properly planned and assessed learning activity.

For a standard 3-credit course, this means approximately 45 hours of instructional activity and 90 hours of independent study, reading, assignment preparation and assessment — a total of around 135 hours of student effort.

For a standard 4-credit course (used in bachelor's programmes), this means approximately 60 hours of instructional activity and 120 hours of independent study — a total of around 180 hours of student effort.

## Application to Online Learning

GDCU delivers all programmes online. The following structured activities are counted as instructional equivalents when calculating credit hours:

1. **Video lectures and multimedia presentations** — recorded or live faculty-led instruction, counted at actual duration plus reasonable review time.
2. **Guided readings** — assigned textbook chapters, articles and primary sources with defined learning outcomes, counted at estimated reading time.
3. **Discussion forums and interactive participation** — structured online discussions, peer engagement and faculty-facilitated dialogue, counted at actual participation time.
4. **Tutorials and synchronous sessions** — live video sessions with faculty, counted at actual duration.
5. **Assignments and assessments** — essays, quizzes, projects, presentations and examinations, counted at estimated completion time.
6. **Faculty interaction** — feedback, office hours, email and messaging support, counted as part of the instructional relationship.
7. **Independent study and research** — self-directed reading, research and project work with defined outcomes, counted as preparation outside instruction.

## Programme Credit Totals

| Degree Level | Minimum Semester Credits |
|---|---|
| Bachelor's degree | 120 |
| Bachelor of Arts general education | 45 of the 120 credits |
| Master's degree | 30 beyond the bachelor's |
| Doctoral degree | 60 beyond the bachelor's |

## General Education (Bachelor of Arts)

At least 45 of the 120 credits required for a Bachelor of Arts must be genuine general education, drawn from:

- English composition and academic writing
- Humanities (history, philosophy, literature)
- Social sciences (psychology, sociology, economics, political science)
- Mathematics and quantitative reasoning
- Natural sciences
- Communication studies
- Languages

The remaining 75 credits comprise the Christian major, supporting subjects, electives and a capstone project.

## Documentation and Review

Every programme maintains an internal curriculum table listing each course code, course title, semester credit value and instruction/equivalent hours. This documentation is available for internal academic review and for any external regulatory requirements that may apply.

This policy is reviewed annually by the Academic Board and updated to reflect current best practice in online theological education.`;

  if (existingPolicy) {
    await knex('settings').where({ key: policyKey }).update({
      value: policyText,
      updated_at: now,
    });
  } else {
    await knex('settings').insert({
      key: policyKey,
      value: policyText,
      label: 'Credit-Hour Policy',
      group: 'academic',
      sensitive: false,
      updated_at: now,
    });
  }

  console.log('\n  ✅ Credit structure updated:');
  console.log('     Bachelor\'s: 120 credits (45 GenEd), 4 credits/module, 60 hrs/module');
  console.log('     Master\'s:   30 credits, 3 credits/module, 45 hrs/module');
  console.log('     Doctorate:  60 credits, 3 credits/module, 45 hrs/module');
  console.log('     Diploma:    60 credits, 3 credits/module, 45 hrs/module');
  console.log('     Certificate: 15 credits, 3 credits/module, 45 hrs/module');
  console.log('     Credit-hour policy stored in settings table');
};