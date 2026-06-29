/**
 * Initial schema — Foundation + Public site phase.
 *
 * Tables created here back the public website and feed the future CRM:
 *   users                 — accounts (student / staff / admin) for later phases
 *   programs              — academic programs shown on the public site
 *   applications          — admissions applications (Apply Now)
 *   application_fees      — Stripe payments tied to applications
 *   leads                 — Request Info / enquiry capture (CRM intake)
 *   contact_messages      — general contact form submissions
 *   newsletter_subscribers
 *   news_posts            — News & Insights articles
 *   faqs                  — Help hub questions
 *   sessions              — express-session store (connect-session-knex)
 */
exports.up = async function (knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.enu('role', ['student', 'faculty', 'staff', 'admin']).notNullable().defaultTo('student');
    t.string('status').notNullable().defaultTo('active');
    t.timestamp('last_login_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('programs', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.string('level').notNullable(); // Certificate, Diploma, BA, MA, MSc, PhD
    t.string('school').notNullable(); // School of Global Theology, etc.
    t.string('credential').nullable();
    t.text('summary').notNullable();
    t.text('description').nullable();
    t.string('duration').nullable(); // "2 years (online)"
    t.string('study_mode').nullable(); // Online, Hybrid
    t.decimal('tuition', 10, 2).nullable();
    t.string('tuition_currency').defaultTo('GBP');
    t.string('image_url').nullable();
    t.string('icon').nullable(); // material symbol name
    t.boolean('featured').notNullable().defaultTo(false);
    t.boolean('published').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('applications', (t) => {
    t.increments('id').primary();
    t.string('reference').notNullable().unique(); // human-friendly ref e.g. GDCU-2026-0001
    t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('SET NULL').nullable();
    t.string('first_name').notNullable();
    t.string('last_name').notNullable();
    t.string('email').notNullable();
    t.string('phone').nullable();
    t.string('country').nullable();
    t.date('date_of_birth').nullable();
    t.string('prior_education').nullable();
    t.text('statement').nullable(); // statement of purpose / motivation
    t.string('intake').nullable(); // e.g. "September 2026"
    // pipeline status for CRM/admissions: new -> review -> interview -> offer -> accepted/declined
    t.enu('status', ['new', 'in_review', 'interview', 'offer', 'accepted', 'declined', 'withdrawn'])
      .notNullable()
      .defaultTo('new');
    t.enu('payment_status', ['unpaid', 'paid', 'waived']).notNullable().defaultTo('unpaid');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('application_fees', (t) => {
    t.increments('id').primary();
    t.integer('application_id').unsigned().references('id').inTable('applications').onDelete('CASCADE').notNullable();
    t.integer('amount').notNullable(); // smallest currency unit
    t.string('currency').notNullable().defaultTo('gbp');
    t.string('provider').notNullable().defaultTo('stripe');
    t.string('stripe_session_id').nullable();
    t.string('stripe_payment_intent').nullable();
    t.enu('status', ['pending', 'paid', 'failed', 'refunded']).notNullable().defaultTo('pending');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('leads', (t) => {
    t.increments('id').primary();
    t.string('first_name').notNullable();
    t.string('last_name').nullable();
    t.string('email').notNullable();
    t.string('phone').nullable();
    t.string('country').nullable();
    t.integer('program_id').unsigned().references('id').inTable('programs').onDelete('SET NULL').nullable();
    t.string('interest').nullable(); // free-text area of interest
    t.text('message').nullable();
    t.string('source').notNullable().defaultTo('website'); // request_info, contact, etc.
    // CRM pipeline
    t.enu('status', ['new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost'])
      .notNullable()
      .defaultTo('new');
    t.integer('assigned_to').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('contact_messages', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('email').notNullable();
    t.string('subject').nullable();
    t.text('message').notNullable();
    t.boolean('handled').notNullable().defaultTo(false);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('newsletter_subscribers', (t) => {
    t.increments('id').primary();
    t.string('email').notNullable().unique();
    t.boolean('confirmed').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('news_posts', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.string('category').nullable();
    t.text('excerpt').nullable();
    t.text('body').nullable();
    t.string('author').nullable();
    t.string('image_url').nullable();
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamp('published_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('faqs', (t) => {
    t.increments('id').primary();
    t.string('category').notNullable().defaultTo('General');
    t.string('question').notNullable();
    t.text('answer').notNullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.boolean('published').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

  // Session store table for connect-session-knex
  const hasSessions = await knex.schema.hasTable('sessions');
  if (!hasSessions) {
    await knex.schema.createTable('sessions', (t) => {
      t.string('sid').primary();
      t.json('sess').notNullable();
      t.timestamp('expired').notNullable().index();
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('faqs');
  await knex.schema.dropTableIfExists('news_posts');
  await knex.schema.dropTableIfExists('newsletter_subscribers');
  await knex.schema.dropTableIfExists('contact_messages');
  await knex.schema.dropTableIfExists('leads');
  await knex.schema.dropTableIfExists('application_fees');
  await knex.schema.dropTableIfExists('applications');
  await knex.schema.dropTableIfExists('programs');
  await knex.schema.dropTableIfExists('users');
};
