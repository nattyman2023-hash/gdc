/**
 * Give every programme a unique image (previously ~7 images were reused
 * across all 33 programmes). Updates existing rows by slug so it applies
 * cleanly regardless of when/how the programme catalogue was seeded.
 */
const IMAGE_BY_SLUG = {
  'certificate-biblical-studies': 'gdcu-research-library.webp',
  'certificate-christian-ministry': 'gdcu-student-cafe-study.webp',
  'certificate-pastoral-care': 'gdcu-student-library-research.webp',
  'certificate-chaplaincy-spiritual-care': 'gdcu-student-outdoor-mentor.webp',
  'certificate-christian-leadership': 'gdcu-teacher-online-classroom.webp',
  'certificate-missions-diaspora-ministry': 'gdcu-east-africa-hero.webp',
  'certificate-church-administration': 'gdcu-community.webp',
  'certificate-prayer-discipleship-spiritual-formation': 'gdcu-teacher-living-room-v2.webp',
  'diploma-biblical-studies': 'gdcu-news-program-living-room-v2.webp',
  'diploma-christian-ministry': 'gdcu-student-workshop-lesson.webp',
  'diploma-chaplaincy-pastoral-care': 'gdcu-news-accreditation-lifestyle.webp',
  'diploma-christian-leadership': 'gdcu-news-intake-male-home-v2.webp',
  'diploma-theology-ministry': 'gdcu-online-learning.webp',
  'diploma-missions-global-christianity': 'gdcu-east-africa-online-learning.webp',
  'diploma-pastoral-counselling-ministry': 'gdcu-admissions-advisor.webp',
  'master-christian-theology': 'gdcu-program-theology-living-room-v2.webp',
  'master-christian-ministry': 'gdcu-news-program-female-home-v2.webp',
  'master-christian-leadership': 'gdcu-program-leadership-park-v2.webp',
  'master-chaplaincy-spiritual-care': 'gdcu-news-research-lifestyle.webp',
  'master-pastoral-care-counselling-ministry': 'gdcu-student-courtyard-learning.webp',
  'master-missions-diaspora-ministry': 'gdcu-news-intake-lifestyle.webp',
  'bachelor-biblical-studies': 'gdcu-student-video-lesson-home.webp',
  'bachelor-christian-ministry': 'gdcu-news-program-lifestyle.webp',
  'bachelor-christian-leadership': 'gdcu-news-accreditation-east-africa.webp',
  'bachelor-chaplaincy-pastoral-care': 'gdcu-news-intake-east-africa.webp',
  'bachelor-theology-ministry': 'gdcu-news-research-east-africa.webp',
  'bachelor-missions-global-christianity': 'gdcu-news-program-east-africa.webp',
  'doctorate-christian-ministry': 'gdcu-newsroom.webp',
  'doctorate-practical-theology': 'gdcu-news-accreditation-park-v2.webp',
  'doctorate-chaplaincy-spiritual-care': 'gdcu-east-africa-community.webp',
  'doctorate-christian-leadership': 'gdcu-program-mba-home-v2.webp',
  'ba-theology-ministry': 'gdcu-student-admissions-video.webp',
  'msc-business-administration': 'gdcu-east-africa-admissions.webp',
};

exports.up = async function (knex) {
  for (const [slug, file] of Object.entries(IMAGE_BY_SLUG)) {
    await knex('programs').where({ slug }).update({ image_url: `/img/generated/${file}`, updated_at: knex.fn.now() });
  }
};

exports.down = async function () {
  // Original values were themselves duplicated across programmes and not
  // worth restoring; this migration is a one-way content update.
};
