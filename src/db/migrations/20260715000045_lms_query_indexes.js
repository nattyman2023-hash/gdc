/**
 * Add the composite indexes used by the portal dashboards, assessments,
 * assignments, and discussion forums.
 */
exports.up = async function (knex) {
  const indexes = [
    ['quiz_attempts', ['user_id', 'quiz_id', 'submitted_at'], 'idx_quiz_attempts_user_quiz_open'],
    ['lesson_progress', ['enrollment_id', 'completed'], 'idx_lesson_progress_enrollment_completed'],
    ['assignment_submissions', ['assignment_id', 'user_id', 'status'], 'idx_assignment_submissions_assignment_user_status'],
    ['forum_topics', ['forum_id', 'updated_at'], 'idx_forum_topics_forum_updated'],
    ['forum_replies', ['topic_id', 'created_at'], 'idx_forum_replies_topic_created'],
    ['forum_topic_views', ['user_id', 'topic_id'], 'idx_forum_topic_views_user_topic'],
    ['enrollments', ['user_id', 'course_id', 'status'], 'idx_enrollments_user_course_status'],
    ['course_forums', ['course_id', 'published'], 'idx_course_forums_course_published'],
  ];

  for (const [table, columns, name] of indexes) {
    if (await knex.schema.hasTable(table)) {
      await knex.schema.alterTable(table, (t) => t.index(columns, name));
    }
  }
};

exports.down = async function (knex) {
  const indexes = [
    ['quiz_attempts', 'idx_quiz_attempts_user_quiz_open'],
    ['lesson_progress', 'idx_lesson_progress_enrollment_completed'],
    ['assignment_submissions', 'idx_assignment_submissions_assignment_user_status'],
    ['forum_topics', 'idx_forum_topics_forum_updated'],
    ['forum_replies', 'idx_forum_replies_topic_created'],
    ['forum_topic_views', 'idx_forum_topic_views_user_topic'],
    ['enrollments', 'idx_enrollments_user_course_status'],
    ['course_forums', 'idx_course_forums_course_published'],
  ];

  for (const [table, name] of indexes) {
    if (await knex.schema.hasTable(table)) {
      await knex.schema.alterTable(table, (t) => t.dropIndex(name));
    }
  }
};
