/**
 * Supplementary programme content shown on programme detail pages: entry
 * requirements (by level) and career prospects (by theme). Kept here rather
 * than in the database so it's easy to edit and needs no schema change.
 *
 * ⚠️ REVIEW these against GDCU's actual admissions policy before relying on
 * them publicly — they are sensible, conventional defaults, not official text.
 */

const entryRequirementsByLevel = {
  Undergraduate: [
    'Completion of secondary / high-school education, or an equivalent qualification.',
    'Alternatively, relevant ministry, leadership or work experience — assessed case by case.',
    'A short personal statement outlining your calling and goals.',
    'Working proficiency in English (the language of instruction).',
  ],
  Masters: [
    "A recognised bachelor's degree (or equivalent) in a related field.",
    'Substantial ministry, leadership or professional experience may be considered in lieu of a first degree.',
    'A personal statement and, where requested, a reference.',
    'Proficiency in English (the language of instruction).',
  ],
  Doctorate: [
    "A relevant master's degree (or equivalent).",
    'An outline research proposal aligned with our faculty’s areas of expertise.',
    'Academic references and a sample of written work.',
    'Proficiency in English (the language of instruction).',
  ],
  Diploma: [
    'Open to motivated learners — no formal academic prerequisites.',
    'A genuine interest in the subject and a commitment to study online.',
    'Working proficiency in English.',
  ],
  Certificate: [
    'Open to all — no formal prerequisites.',
    'Ideal for beginners and those exploring a subject before further study.',
    'Working proficiency in English.',
  ],
};

const careersByTheme = {
  theology: [
    'Pastoral ministry & church leadership',
    'Chaplaincy — hospital, prison or education',
    'Missions & cross-cultural work',
    'Theological teaching & training',
    'Christian writing, media & discipleship',
  ],
  leadership: [
    'Church & ministry leadership',
    'Faith-based nonprofit & NGO management',
    'Organisational & team leadership',
    'Community development & programme management',
    'Coaching, mentoring & consultancy',
  ],
  business: [
    'Management & operations leadership',
    'Entrepreneurship & enterprise development',
    'Nonprofit & social-enterprise leadership',
    'Project & programme management',
    'Consultancy & advisory roles',
  ],
  default: [
    'Ministry & church leadership',
    'Faith-based organisations & charities',
    'Education, training & mentoring',
    'Community & mission work',
    'Further postgraduate study',
  ],
};

function pickCareers(program) {
  const t = `${program.title || ''} ${program.school || ''} ${program.slug || ''}`.toLowerCase();
  if (/(business|mba|enterprise|administration|finance)/.test(t)) return careersByTheme.business;
  if (/(leadership|management|community)/.test(t)) return careersByTheme.leadership;
  if (/(theolog|ministry|biblical|hermeneutic|pastoral|mission|church|scripture)/.test(t)) return careersByTheme.theology;
  return careersByTheme.default;
}

/**
 * Credit-structure breakdowns by degree level, matching Florida Commission
 * minimums. Each entry lists the components that sum to the programme's
 * total semester credits.
 */
const creditStructureByLevel = {
  Undergraduate: [
    { component: 'General Education', credits: 45, note: 'English composition, humanities, history, social sciences, mathematics, natural sciences, communication, languages' },
    { component: 'Christian Major', credits: 45, note: 'Core theological and ministry courses' },
    { component: 'Supporting Subjects', credits: 18, note: 'Related discipline and method courses' },
    { component: 'Electives & Capstone', credits: 12, note: 'Elective courses and final capstone project' },
  ],
  Masters: [
    { component: 'Core Courses', credits: 18, note: 'Foundational graduate courses in the discipline' },
    { component: 'Advanced Courses', credits: 9, note: 'Specialised study and electives' },
    { component: 'Capstone / Research Project', credits: 3, note: 'Integrating project or thesis' },
  ],
  Doctorate: [
    { component: 'Advanced Christian discipline courses', credits: 24, note: 'Doctoral-level discipline study' },
    { component: 'Research methods', credits: 9, note: 'Quantitative, qualitative and theological research methods' },
    { component: 'Specialist electives', credits: 9, note: 'Electives aligned with the dissertation topic' },
    { component: 'Comprehensive examination / research proposal', credits: 3, note: 'Comprehensive exam and defended proposal' },
    { component: 'Dissertation research and writing', credits: 15, note: 'Original doctoral dissertation' },
  ],
  Diploma: [
    { component: 'Core Modules', credits: 45, note: 'Foundational modules in the discipline' },
    { component: 'Elective Modules', credits: 15, note: 'Elective modules and a final project' },
  ],
  Certificate: [
    { component: 'Core Modules', credits: 15, note: 'Five modules at 3 credits each' },
  ],
};

/**
 * Returns the credit-structure breakdown for a programme, or null if the
 * level has no defined structure.
 */
function creditStructure(program) {
  return creditStructureByLevel[program.level] || null;
}

/**
 * Returns a short human-readable summary of the programme's credit
 * requirement, suitable for the hero/sidebar of a programme page.
 */
function creditSummary(program) {
  const total = program.semester_credits;
  if (!total) return '';
  switch (program.level) {
    case 'Undergraduate':
      return `Total programme requirement: ${total} US semester credit hours. Normal duration: four academic years full-time or equivalent part-time. Delivery: Online. General education: ${program.gen_ed_credits || 45} semester credits. Major and related requirements: ${(total - (program.gen_ed_credits || 45))} semester credits.`;
    case 'Masters':
      return `Total programme requirement: ${total} US semester credit hours beyond an earned bachelor's degree. Normal duration: two academic years part-time online.`;
    case 'Doctorate':
      return `Total programme requirement: ${total} US semester credit hours beyond the bachelor's degree, including doctoral research and dissertation requirements. Normal duration: three to four years part-time online.`;
    case 'Diploma':
      return `Total programme requirement: ${total} US semester credit hours. Normal duration: one academic year online.`;
    case 'Certificate':
      return `Total programme requirement: ${total} US semester credit hours. Normal duration: six months online.`;
    default:
      return `Total programme requirement: ${total} US semester credit hours.`;
  }
}

/** Returns { entryRequirements, careers, creditStructure, creditSummary } for a programme. */
function programmeExtras(program) {
  return {
    entryRequirements: entryRequirementsByLevel[program.level] || entryRequirementsByLevel.Certificate,
    careers: pickCareers(program),
    creditStructure: creditStructure(program),
    creditSummary: creditSummary(program),
  };
}

module.exports = { programmeExtras, creditStructure, creditSummary };
