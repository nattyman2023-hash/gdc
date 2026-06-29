/**
 * Small reusable helpers shared across routes and views.
 */

/** Format a number as currency for display. */
function formatMoney(amount, currency = 'GBP') {
  if (amount === null || amount === undefined || amount === '') return 'Contact us';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

/** Format an amount given in the smallest currency unit (e.g. Stripe cents/pence). */
function formatMinor(amount, currency = 'GBP') {
  if (amount === null || amount === undefined) return '—';
  return formatMoney(Number(amount) / 100, currency);
}

/** Format a date for display, tolerant of strings/Date objects/null. */
function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Format a date + time for display, e.g. "21 June 2026, 18:00". */
function formatDateTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Generate a human-friendly application reference, e.g. GDCU-2026-4F7A2. */
function makeReference(prefix = 'GDCU') {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${year}-${rand}`;
}

/** Truncate text to a length, adding an ellipsis. */
function truncate(text, len = 160) {
  if (!text) return '';
  const s = String(text);
  return s.length > len ? s.slice(0, len).trimEnd() + '…' : s;
}

const siteImages = {
  hero: '/img/generated/gdcu-student-courtyard-learning.png',
  onlineLesson: '/img/generated/gdcu-student-video-lesson-home.png',
  teacher: '/img/generated/gdcu-teacher-living-room-v2.png',
  admissions: '/img/generated/gdcu-student-admissions-video.png',
  newsIntake: '/img/generated/gdcu-news-intake-male-home-v2.png',
  newsProgram: '/img/generated/gdcu-news-program-female-home-v2.png',
  newsAccreditation: '/img/generated/gdcu-news-accreditation-park-v2.png',
  programLeadership: '/img/generated/gdcu-program-leadership-park-v2.png',
  programTheology: '/img/generated/gdcu-program-theology-living-room-v2.png',
  programBusiness: '/img/generated/gdcu-program-mba-home-v2.png',
};

const programImagesBySlug = {
  'msc-global-leadership': siteImages.programLeadership,
  'ma-postcolonial-theology': siteImages.programTheology,
  'ba-theology-ministry': siteImages.onlineLesson,
  'diploma-church-leadership': siteImages.teacher,
  'diploma-community-leadership': siteImages.hero,
  'msc-business-administration': siteImages.programBusiness,
  'certificate-diaspora-mission': siteImages.admissions,
  'phd-theology': siteImages.newsAccreditation,
};

function pickImageByText(text, images) {
  const source = text || 'gdcu';
  const score = Array.from(source).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
  return images[score % images.length];
}

/** Pick generated fallback imagery for content without an uploaded image. */
function fallbackImageFor(kind, item = {}) {
  const text = [
    item.category,
    item.title,
    item.slug,
    item.school,
    item.level,
  ].filter(Boolean).join(' ').toLowerCase();

  if (kind === 'news') {
    if (text.includes('accredit') || text.includes('quality')) return siteImages.newsAccreditation;
    if (text.includes('program') || text.includes('leadership') || text.includes('academic')) return siteImages.newsProgram;
    if (text.includes('research') || text.includes('grant')) return siteImages.programTheology;
    return siteImages.newsIntake;
  }

  if (kind === 'event' || kind === 'community') return siteImages.teacher;
  if (kind === 'admissions') return siteImages.admissions;
  if (kind === 'program') {
    if (item.slug && programImagesBySlug[item.slug]) return programImagesBySlug[item.slug];
    if (text.includes('business') || text.includes('enterprise') || text.includes('mba')) return siteImages.programBusiness;
    if (text.includes('theology') || text.includes('ministry') || text.includes('pastoral') || text.includes('church') || text.includes('phd')) return siteImages.programTheology;
    if (text.includes('leadership')) return siteImages.programLeadership;
    return pickImageByText(text, [siteImages.onlineLesson, siteImages.programLeadership, siteImages.programTheology, siteImages.programBusiness]);
  }
  if (kind === 'research') return siteImages.programTheology;
  return siteImages.hero;
}

/** Use a content-managed image when present, otherwise a generated fallback. */
function imageFor(kind, item = {}) {
  return item.image_url || fallbackImageFor(kind, item);
}

/** Pagination maths. Returns { page, perPage, pages, offset, total }. */
function pageInfo(total, page, perPage = 25) {
  const t = Number(total) || 0;
  const pp = Number(perPage) || 25;
  const pages = Math.max(1, Math.ceil(t / pp));
  const p = Math.min(pages, Math.max(1, Number(page) || 1));
  return { page: p, perPage: pp, pages, offset: (p - 1) * pp, total: t };
}

/**
 * Turn a video URL (YouTube, Vimeo, or a direct file) into responsive embed
 * HTML. Returns null when the URL isn't recognised so callers can show a link.
 */
function videoEmbed(url) {
  if (!url) return null;
  const u = String(url).trim();
  // Optional clip window: start=/t= and end= (seconds) → play just that segment.
  const num = (name) => { const m = u.match(new RegExp('[?&#]' + name + '=(\\d+)')); return m ? m[1] : null; };
  const start = num('start') || num('t');
  const end = num('end');
  const frame = (src) => `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="${src}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) {
    const q = ['rel=0', 'modestbranding=1'];
    if (start) q.push('start=' + start);
    if (end) q.push('end=' + end);
    return frame(`https://www.youtube-nocookie.com/embed/${m[1]}?${q.join('&')}`);
  }
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return frame(`https://player.vimeo.com/video/${m[1]}${start ? '#t=' + start + 's' : ''}`);
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return `<video controls preload="metadata" style="width:100%;border-radius:8px"><source src="${u}"></video>`;
  return null;
}

/** Convert a string into a URL-safe slug. */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = {
  formatMoney,
  formatMinor,
  formatDate,
  formatDateTime,
  makeReference,
  truncate,
  fallbackImageFor,
  imageFor,
  videoEmbed,
  slugify,
  pageInfo,
};
