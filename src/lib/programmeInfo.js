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

/** Returns { entryRequirements, careers } for a programme. */
function programmeExtras(program) {
  return {
    entryRequirements: entryRequirementsByLevel[program.level] || entryRequirementsByLevel.Certificate,
    careers: pickCareers(program),
  };
}

module.exports = { programmeExtras };
