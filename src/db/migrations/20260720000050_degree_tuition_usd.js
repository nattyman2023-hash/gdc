/**
 * Publish degree-level tuition in USD:
 *   undergraduate degrees: $2,200
 *   master's degrees:      $2,000
 *   doctoral degrees:      $3,000
 *
 * Existing invoices are deliberately left unchanged because they are
 * historical financial records. New programme tuition invoices use the
 * programme values updated here.
 */
const PRICES = [
  { level: 'Undergraduate', tuition: 2200 },
  { level: 'Masters', tuition: 2000 },
  { level: 'Doctorate', tuition: 3000 },
];

const ORIGINAL_PRICES = {
  'master-christian-theology': 7200,
  'master-christian-ministry': 7200,
  'master-christian-leadership': 7200,
  'master-chaplaincy-spiritual-care': 7400,
  'master-pastoral-care-counselling-ministry': 7400,
  'master-missions-diaspora-ministry': 7400,
  'msc-business-administration': 7600,
};

exports.up = async function (knex) {
  for (const item of PRICES) {
    await knex('programs').where({ level: item.level }).update({
      tuition: item.tuition,
      tuition_currency: 'USD',
      updated_at: knex.fn.now(),
    });
  }
};

exports.down = async function (knex) {
  const programs = await knex('programs').whereIn('level', PRICES.map((item) => item.level));
  for (const program of programs) {
    const tuition = ORIGINAL_PRICES[program.slug]
      || (program.level === 'Undergraduate' ? 5400 : program.level === 'Doctorate' ? 8200 : 7200);
    await knex('programs').where({ id: program.id }).update({
      tuition,
      tuition_currency: 'GBP',
      updated_at: knex.fn.now(),
    });
  }
};

