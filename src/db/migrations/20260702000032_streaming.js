/**
 * Streaming integrations for live classrooms & webinars.
 *
 * - `provider`          : how the session is delivered — 'zoom' | 'onestream' | 'external'
 * - `zoom_meeting_id`   : numeric Zoom meeting ID (set when created via the Zoom API)
 * - `zoom_start_url`    : host start URL (staff only — never shown to students)
 * - `zoom_passcode`     : meeting passcode to display alongside the join button
 * - `stream_embed_url`  : OneStream.live (or other) iframe embed URL for in-page viewing
 *
 * The existing `join_url` remains the student-facing join link for all providers.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('webinars', (t) => {
    t.string('provider').notNullable().defaultTo('external'); // zoom | onestream | external
    t.string('zoom_meeting_id').nullable();
    t.text('zoom_start_url').nullable();
    t.string('zoom_passcode').nullable();
    t.text('stream_embed_url').nullable();
  });

  // Live lessons can also point at a Zoom meeting / OneStream embed.
  await knex.schema.alterTable('lessons', (t) => {
    t.string('live_provider').nullable(); // zoom | onestream | external
    t.text('live_join_url').nullable();
    t.text('live_embed_url').nullable();
    t.string('live_passcode').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('webinars', (t) => {
    t.dropColumn('provider');
    t.dropColumn('zoom_meeting_id');
    t.dropColumn('zoom_start_url');
    t.dropColumn('zoom_passcode');
    t.dropColumn('stream_embed_url');
  });
  await knex.schema.alterTable('lessons', (t) => {
    t.dropColumn('live_provider');
    t.dropColumn('live_join_url');
    t.dropColumn('live_embed_url');
  });
};
