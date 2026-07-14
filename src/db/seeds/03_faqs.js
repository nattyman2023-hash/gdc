/**
 * Seed: FAQs for the Help Hub.
 */
exports.seed = async function (knex) {
  await knex('faqs').del();

  await knex('faqs').insert([
    {
      category: 'Admissions',
      question: 'What are the entry requirements?',
      answer:
        'Entry requirements vary by programme. Undergraduate study generally requires a secondary school qualification, while postgraduate programmes require a relevant first degree. Mature students with significant ministry or professional experience are welcome to apply through our recognition-of-prior-learning route.',
      sort_order: 1,
    },
    {
      category: 'Admissions',
      question: 'Is there an application fee?',
      answer:
        'A small, non-refundable application fee is payable when you submit your application. This can be paid securely online by card. Fee waivers are available for applicants facing financial hardship — contact admissions before applying.',
      sort_order: 2,
    },
    {
      category: 'Study',
      question: 'Is the university fully online?',
      answer:
        'Yes. All of our programmes are delivered online through our virtual learning environment, with live webinars, recorded lectures, discussion forums and one-to-one tutor support. This allows students across the global diaspora to study without relocating.',
      sort_order: 3,
    },
    {
      category: 'Study',
      question: 'How much time should I commit each week?',
      answer:
        'As a guide, full-time study requires around 35 hours per week and part-time study around 15–18 hours. Our flexible online format lets you fit study around work, ministry and family commitments.',
      sort_order: 4,
    },
    {
      category: 'Fees & Funding',
      question: 'Can I pay tuition in instalments?',
      answer:
        'Yes. Tuition can be paid in full or through an instalment plan spread across the academic year. Sponsorship and scholarship options are also available for eligible students.',
      sort_order: 5,
    },
    {
      category: 'Fees & Funding',
      question: 'Do you offer scholarships?',
      answer:
        'We offer a range of scholarships and bursaries, including diaspora sponsorship partnerships. Details are shared with applicants during the admissions process.',
      sort_order: 6,
    },
    {
      category: 'Accreditation',
      question: 'Are your qualifications recognised?',
      answer:
        'Global Diaspora Christian University is currently unaccredited. Accreditation is not guaranteed. Students should confirm whether a GDCU qualification will be accepted by employers, other institutions, professional bodies or government authorities before enrolling.',
      sort_order: 7,
    },
  ]);
};
