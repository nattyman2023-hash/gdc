/**
 * Generate sitemap.xml for SEO.
 * Run: node scripts/generate-sitemap.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const knex = require('../src/config/db');

const BASE_URL = process.env.APP_URL || 'https://gdcu.edu';

async function generate() {
  const urls = [];

  // Static pages
  const staticPages = [
    { loc: '/', priority: 1.0, changefreq: 'weekly' },
    { loc: '/about', priority: 0.8, changefreq: 'monthly' },
    { loc: '/programs', priority: 0.9, changefreq: 'weekly' },
    { loc: '/admissions', priority: 0.9, changefreq: 'monthly' },
    { loc: '/apply', priority: 0.9, changefreq: 'monthly' },
    { loc: '/news', priority: 0.7, changefreq: 'daily' },
    { loc: '/events', priority: 0.6, changefreq: 'weekly' },
    { loc: '/contact', priority: 0.6, changefreq: 'monthly' },
    { loc: '/faq', priority: 0.5, changefreq: 'monthly' },
    { loc: '/accreditation', priority: 0.7, changefreq: 'monthly' },
    { loc: '/student-life', priority: 0.5, changefreq: 'monthly' },
    { loc: '/alumni', priority: 0.5, changefreq: 'monthly' },
    { loc: '/scholarships', priority: 0.7, changefreq: 'monthly' },
    { loc: '/careers', priority: 0.5, changefreq: 'weekly' },
    { loc: '/knowledge-base', priority: 0.4, changefreq: 'weekly' },
    { loc: '/academic-calendar', priority: 0.6, changefreq: 'monthly' },
    { loc: '/how-it-works', priority: 0.8, changefreq: 'monthly' },
    { loc: '/research-grants', priority: 0.5, changefreq: 'monthly' },
  ];
  urls.push(...staticPages);

  // Dynamic: Programs
  try {
    const programs = await knex('programs').where({ published: true }).select('slug', 'updated_at');
    for (const p of programs) {
      urls.push({
        loc: `/programs/${p.slug}`,
        priority: 0.8,
        changefreq: 'weekly',
        lastmod: p.updated_at,
      });
    }
  } catch (e) { /* table may not exist */ }

  // Dynamic: News articles
  try {
    const news = await knex('news').where({ published: true }).select('slug', 'published_at', 'updated_at');
    for (const n of news) {
      urls.push({
        loc: `/news/${n.slug}`,
        priority: 0.6,
        changefreq: 'monthly',
        lastmod: n.updated_at || n.published_at,
      });
    }
  } catch (e) { /* table may not exist */ }

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of urls) {
    xml += '  <url>\n';
    xml += `    <loc>${BASE_URL}${u.loc}</loc>\n`;
    if (u.lastmod) xml += `    <lastmod>${new Date(u.lastmod).toISOString()}</lastmod>\n`;
    xml += `    <changefreq>${u.changefreq}</changefreq>\n`;
    xml += `    <priority>${u.priority}</priority>\n`;
    xml += '  </url>\n';
  }
  xml += '</urlset>\n';

  fs.writeFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), xml);
  console.log(`✓ Sitemap generated with ${urls.length} URLs`);
  process.exit(0);
}

generate().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
