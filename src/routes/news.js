/**
 * News & Insights: listing + article detail.
 */
const express = require('express');
const knex = require('../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const posts = await knex('news_posts')
      .where({ published: true })
      .orderBy('published_at', 'desc');
    res.render('public/news', { pageTitle: 'News & Insights | GDCU', posts });
  } catch (err) {
    next(err);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const post = await knex('news_posts').where({ slug: req.params.slug, published: true }).first();
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'Article not found' });
    const more = await knex('news_posts')
      .where({ published: true })
      .whereNot('id', post.id)
      .orderBy('published_at', 'desc')
      .limit(3);
    res.render('public/news-detail', {
      pageTitle: `${post.title} | GDCU News`,
      metaDescription: post.excerpt,
      post,
      more,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
