/**
 * Seed: knowledge base articles.
 */
exports.seed = async function (knex) {
  await knex('kb_articles').del();
  await knex('kb_articles').insert([
    { slug: 'how-to-access-virtual-classroom', title: 'How to access your virtual classroom', category: 'Getting Started', excerpt: 'Log in, open your course and join live or recorded lessons.', body: 'Sign in at the student portal, open Course Catalogue or your dashboard, choose your course and select a lesson. Live sessions show a “Join” button; recordings can be watched any time. Mark lessons complete to track progress.', published: true, sort_order: 1, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'paying-tuition-in-instalments', title: 'Paying tuition in instalments', category: 'Fees & Funding', excerpt: 'Set up and pay tuition instalments from your Billing page.', body: 'Go to Billing & Payments in your student portal to see your invoices. You can pay each instalment securely online. If you need a revised plan, contact the finance office.', published: true, sort_order: 2, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'resetting-your-password', title: 'Resetting your password', category: 'Account', excerpt: 'How to regain access to your account.', body: 'Contact the student helpdesk via the Support page or email and an administrator will reset your password and send you a temporary one to change on next login.', published: true, sort_order: 3, created_at: knex.fn.now(), updated_at: knex.fn.now() },
    { slug: 'claiming-your-certificate', title: 'Claiming your certificate', category: 'Graduation', excerpt: 'Complete a course to claim and print your certificate.', body: 'Once you complete all lessons in a course, your enrolment is marked complete. Visit My Certificates to claim and open a printable certificate. Your transcript also updates automatically.', published: true, sort_order: 4, created_at: knex.fn.now(), updated_at: knex.fn.now() },
  ]);
  // eslint-disable-next-line no-console
  console.log('\n  Seeded knowledge base articles\n');
};
