/**
 * Phase 18 — expand the admissions application into a full university application.
 * All new columns are nullable so existing rows and the lead-conversion flow keep working.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('applications', (t) => {
    // Personal
    t.string('title').nullable();
    t.string('middle_name').nullable();
    t.string('preferred_name').nullable();
    t.string('gender').nullable();
    t.string('nationality').nullable();
    // Contact / address
    t.string('address_line1').nullable();
    t.string('address_line2').nullable();
    t.string('city').nullable();
    t.string('region').nullable();
    t.string('postal_code').nullable();
    // Education history
    t.string('prev_institution').nullable();
    t.string('prev_qualification').nullable();
    t.string('prev_grade').nullable();
    t.string('prev_year').nullable();
    t.string('english_proficiency').nullable();
    // Experience / background
    t.string('employment_status').nullable();
    t.string('occupation').nullable();
    t.string('employer').nullable();
    t.text('church_involvement').nullable();
    // References
    t.string('ref1_name').nullable();
    t.string('ref1_email').nullable();
    t.string('ref1_relationship').nullable();
    t.string('ref2_name').nullable();
    t.string('ref2_email').nullable();
    t.string('ref2_relationship').nullable();
    // Misc
    t.string('how_heard').nullable();
    t.boolean('sponsorship_interest').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('applications', (t) => {
    t.dropColumn('title'); t.dropColumn('middle_name'); t.dropColumn('preferred_name');
    t.dropColumn('gender'); t.dropColumn('nationality');
    t.dropColumn('address_line1'); t.dropColumn('address_line2'); t.dropColumn('city');
    t.dropColumn('region'); t.dropColumn('postal_code');
    t.dropColumn('prev_institution'); t.dropColumn('prev_qualification'); t.dropColumn('prev_grade');
    t.dropColumn('prev_year'); t.dropColumn('english_proficiency');
    t.dropColumn('employment_status'); t.dropColumn('occupation'); t.dropColumn('employer');
    t.dropColumn('church_involvement');
    t.dropColumn('ref1_name'); t.dropColumn('ref1_email'); t.dropColumn('ref1_relationship');
    t.dropColumn('ref2_name'); t.dropColumn('ref2_email'); t.dropColumn('ref2_relationship');
    t.dropColumn('how_heard'); t.dropColumn('sponsorship_interest');
  });
};
