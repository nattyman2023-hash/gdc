/**
 * GDCU Assistant — a retrieval-grounded chatbot.
 *
 * It answers ONLY from the university's own content (programmes, FAQs, fees,
 * academic calendar, open days and a few key facts). It cites where answers
 * come from and defers to the admissions team when it doesn't know.
 *
 * SCAFFOLD: stays dormant until ANTHROPIC_API_KEY is set. Until then the widget
 * still works but replies with a friendly "not available yet" message + links.
 * When you're ready: set ANTHROPIC_API_KEY (and optionally CHATBOT_MODEL), then
 * restart. No code change needed.
 */
const knex = require('../config/db');
const { formatDateTime } = require('./helpers');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
// Capable + cost-effective default; override with CHATBOT_MODEL (e.g. claude-opus-4-8 or claude-haiku-4-5-20251001).
const MODEL = process.env.CHATBOT_MODEL || 'claude-sonnet-4-6';
const isConfigured = Boolean(API_KEY);

const SYSTEM = `You are the friendly admissions assistant for Global Diaspora Christian University (GDCU), a Christ-centred online university serving the global diaspora since 2019.
Rules:
- Answer ONLY using the CONTEXT provided in the user message. Do not invent programmes, prices, dates or policies.
- If the answer is not in the CONTEXT, say you're not certain and invite them to contact admissions (or use the enquiry form). Never guess.
- Be warm, concise and encouraging. Use plain language.
- IMPORTANT honesty: GDCU is NOT yet accredited — it is actively pursuing accreditation. Never claim it is already accredited.
- When relevant, mention the affordable, borderless nature of the programmes.
- End with a short, helpful next step when appropriate (e.g. "You can register for an open day" or "Our team can confirm details").`;

/** Assemble the knowledge base as titled chunks with a source URL. */
async function buildKnowledge() {
  const chunks = [];
  chunks.push({ title: 'About GDCU', url: '/about', text: 'Global Diaspora Christian University is a Christ-centred online university serving the global diaspora since 2019. Education is borderless (open to students in any nation) and intentionally affordable. Programmes are delivered entirely online.' });
  chunks.push({ title: 'Accreditation status', url: '/accreditation', text: 'GDCU is NOT yet accredited. It is actively going through the formal accreditation process, backed by rigorous internal quality assurance. We are transparent about this so applicants can make an informed choice.' });
  chunks.push({ title: 'How online learning works', url: '/how-it-works', text: 'Students apply, get access to their courses and schedule in the student portal, work through weekly content and live sessions, are assessed via quizzes/assignments/projects with tutor support, and graduate on meeting the requirements.' });
  chunks.push({ title: 'Apply / enquire', url: '/admissions/apply', text: 'Prospective students can apply via the Apply Now page, request information through the enquiry form, or register for an open day. The admissions team replies within about one working day.' });

  const programs = await knex('programs').where({ published: true }).orderBy('sort_order');
  for (const p of programs) {
    const fee = p.tuition ? `${p.tuition_currency || 'GBP'} ${p.tuition}` : 'fee on request';
    chunks.push({
      title: `Programme: ${p.title}`, url: `/programs/${p.slug}`,
      text: `${p.title} (${p.level || 'programme'}${p.credential ? ', ' + p.credential : ''}). ${p.summary || ''} Duration: ${p.duration || 'flexible'}. Study mode: ${p.study_mode || 'online'}. Tuition: ${fee}.`,
    });
  }

  const faqs = await knex('faqs').where({ published: true }).orderBy('sort_order');
  for (const f of faqs) chunks.push({ title: `FAQ: ${f.question}`, url: '/faq', text: f.answer });

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const opendays = await knex('open_days').where({ published: true }).where('starts_at', '>=', now).orderBy('starts_at').limit(5);
  for (const o of opendays) chunks.push({ title: `Open day: ${o.title}`, url: `/open-days/${o.slug}`, text: `${o.title} on ${formatDateTime(o.starts_at)}. ${o.is_online ? 'Online event.' : (o.location || '')} Free registration on the open days page.` });

  const cal = await knex('calendar_events').where({ published: true }).whereIn('audience', ['all', 'public']).where('starts_at', '>=', now).orderBy('starts_at').limit(12);
  for (const e of cal) chunks.push({ title: `Key date: ${e.title}`, url: '/academic-calendar', text: `${e.title} — ${formatDateTime(e.starts_at)}${e.ends_at ? ' to ' + formatDateTime(e.ends_at) : ''}. ${e.description || ''}` });

  return chunks;
}

/** Lightweight keyword retrieval: rank chunks by overlap with the question. */
function retrieve(question, chunks, n = 12) {
  const terms = String(question).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const scored = chunks.map((c) => {
    const hay = `${c.title} ${c.text}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score += 1;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Always include the 4 core facts (first 4 chunks) so identity/accreditation are present.
  const core = chunks.slice(0, 4);
  const top = scored.filter((s) => s.score > 0).slice(0, n).map((s) => s.c);
  const merged = [];
  const seen = new Set();
  for (const c of [...core, ...top]) { if (!seen.has(c.title)) { seen.add(c.title); merged.push(c); } }
  return merged.slice(0, n + 4);
}

/** Answer a question. Returns { configured, answer, sources:[{title,url}] }. */
async function answer(question) {
  const q = String(question || '').trim();
  if (!q) return { configured: isConfigured, answer: 'Ask me anything about studying at GDCU!', sources: [] };

  if (!isConfigured) {
    return {
      configured: false,
      answer: "Our smart assistant isn't switched on yet, but I can still point you in the right direction! Explore our programmes, register for an open day, or send our admissions team a quick enquiry and a real person will reply within one working day.",
      sources: [{ title: 'Programmes', url: '/programs' }, { title: 'Open days', url: '/open-days' }, { title: 'Contact us', url: '/contact' }],
    };
  }

  const chunks = await buildKnowledge();
  const relevant = retrieve(q, chunks);
  const context = relevant.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}\n(source: ${c.url})`).join('\n\n');
  const userMsg = `CONTEXT:\n${context}\n\nQUESTION: ${q}\n\nAnswer using only the context above.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "Sorry, I couldn't generate an answer just now.";
    // Surface the sources that were most relevant.
    const sources = relevant.slice(0, 3).map((c) => ({ title: c.title, url: c.url }));
    return { configured: true, answer: text, sources };
  } catch (err) {
    return { configured: true, answer: "Sorry — I'm having trouble answering right now. Please try again, or contact our admissions team.", sources: [{ title: 'Contact us', url: '/contact' }], error: err.message };
  }
}

module.exports = { isConfigured, MODEL, answer, buildKnowledge };
