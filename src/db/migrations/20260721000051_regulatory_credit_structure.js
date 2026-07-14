/**
 * Regulatory credit-structure compliance.
 *
 * Adds the columns needed to publish a Florida-compliant credit structure
 * on every programme page:
 *
 *   programs.gen_ed_credits   — general-education credits for bachelor's degrees
 *   modules.credits           — semester-credit value of an individual module
 *   modules.instruction_hours — equivalent instructional/learning hours
 *
 * These columns are nullable so existing rows keep working until the
 * credit-structure seed populates them.
 */
exports.up = async function (knex) {
  // programs.gen_ed_credits
  if (!(await knex.schema.hasColumn('programs', 'gen_ed_credits'))) {
    await knex.schema.alterTable('programs', (t) => {
      t.integer('gen_ed_credits').nullable();
    });
  }

  // modules.credits
  if (!(await knex.schema.hasColumn('modules', 'credits'))) {
    await knex.schema.alterTable('modules', (t) => {
      t.integer('credits').nullable();
    });
  }

  // modules.instruction_hours
  if (!(await knex.schema.hasColumn('modules', 'instruction_hours'))) {
    await knex.schema.alterTable('modules', (t) => {
      t.integer('instruction_hours').nullable();
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn('modules', 'instruction_hours')) {
    await knex.schema.alterTable('modules', (t) => t.dropColumn('instruction_hours'));
  }
  if (await knex.schema.hasColumn('modules', 'credits')) {
    await knex.schema.alterTable('modules', (t) => t.dropColumn('credits'));
  }
  if (await knex.schema.hasColumn('programs', 'gen_ed_credits')) {
    await knex.schema.alterTable('programs', (t) => t.dropColumn('gen_ed_credits'));
  }
};