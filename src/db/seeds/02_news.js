/**
 * Seed: News & Insights articles.
 */
exports.seed = async function (knex) {
  await knex('news_posts').del();

  const day = (d) => new Date(2026, 4, d).toISOString().slice(0, 19).replace('T', ' ');

  await knex('news_posts').insert([
    {
      slug: 'gdcu-welcomes-record-diaspora-intake',
      title: 'GDCU Welcomes Record Diaspora Student Intake for 2026',
      category: 'University News',
      excerpt:
        'Students from more than 50 countries have joined Global Diaspora Christian University this year, marking our largest and most international cohort to date.',
      body:
        'Global Diaspora Christian University is delighted to announce a record intake for the 2026 academic year, with students enrolling from over 50 nations across six continents.\n\nThis growth reflects the University\'s mission to educate, equip and empower the global diaspora for divine purpose. New scholarship partnerships have made study more accessible than ever for students in East Africa, West Africa, South Asia and the wider diaspora.\n\n"Every student who joins us carries a calling," said the Vice-Chancellor. "Our task is to equip them academically and spiritually to impact their communities and the world."',
      author: 'Office of the Vice-Chancellor',
      image_url: '/img/generated/gdcu-news-intake-male-home-v2.webp',
      published: true,
      published_at: day(28),
    },
    {
      slug: 'new-msc-global-leadership-launch',
      title: 'New MSc in Global Leadership Now Open for Applications',
      category: 'Academic Programs',
      excerpt:
        'Our new flagship Masters programme combines servant leadership, strategy and cross-cultural mission for the leaders the world needs.',
      body:
        'Applications are now open for the MSc Global Leadership, a part-time online programme designed for experienced professionals and ministry leaders.\n\nThe curriculum integrates organisational strategy, ethics and missional thinking, culminating in a capstone leadership project applied to each student\'s own context. The first cohort begins in September 2026.',
      author: 'School of Global Leadership',
      image_url: '/img/generated/gdcu-news-program-female-home-v2.webp',
      published: true,
      published_at: day(20),
    },
    {
      slug: 'qahe-accreditation-milestone',
      title: 'University Reaches Key Accreditation Milestone',
      category: 'Accreditation',
      excerpt:
        'GDCU advances its institutional accreditation, strengthening recognition of our qualifications worldwide.',
      body:
        'Global Diaspora Christian University has reached an important milestone in its accreditation journey, reinforcing the global recognition and quality assurance of its programmes. Verification details are published on our Accreditation page.',
      author: 'Office of Quality Assurance',
      image_url: '/img/generated/gdcu-news-accreditation-park-v2.webp',
      published: true,
      published_at: day(12),
    },
    {
      slug: 'diaspora-research-grants-2026',
      title: 'Diaspora Research Grants Open for 2026 Applications',
      category: 'Research',
      excerpt:
        'Faculty and doctoral researchers are invited to apply for grants supporting research into diaspora theology, migration and mission.',
      body:
        'The University\'s research office has opened its 2026 round of Diaspora Research Grants. Funding supports projects in theology, migration studies, community development and the global majority church.',
      author: 'Research & Innovation Office',
      image_url: '/img/generated/gdcu-program-theology-living-room-v2.webp',
      published: true,
      published_at: day(5),
    },
  ]);
};
