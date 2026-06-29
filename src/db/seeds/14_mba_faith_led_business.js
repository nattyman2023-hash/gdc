/**
 * Seed: MBA — Faith-Led Business programme (Masters, 6 modules).
 * Each module has ~3–4 lessons, a quiz, and the final module (6) requires a capstone essay.
 *
 * Idempotent: creates courses/modules/lessons only if they don't already exist
 * (checks by slug so it won't wipe existing LMS data).
 */
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // Check if the MBA course already exists
  const merged = await knex('courses').where({ slug: 'mba-faith-led-business' }).first();
  if (merged) { console.log('  ↪ MBA — Faith-Led Business already set up — skipping seed.'); return; }

  // Find the MBA program and an instructor
  const mbaProgram = await knex('programs').where({ slug: 'msc-business-administration' }).first();
  if (!mbaProgram) { console.log('  ⚠ MBA — Faith-Led Business programme not found — skipping seed.'); return; }

  const instructorEmail = 'dr.makori@gdcu.edu';
  let instructor = await knex('users').where({ email: instructorEmail }).first();
  if (!instructor) {
    const hash = await bcrypt.hash('Faculty!2026', 12);
    const [id] = await knex('users').insert({
      first_name: 'Elias', last_name: 'Makori', email: instructorEmail,
      password_hash: hash, role: 'faculty', status: 'active',
    });
    instructor = { id: Array.isArray(id) ? id[0] : id };
  }

  // ─── Helpers ───────────────────────────────────────────────
  const lessonBody = (intro) =>
    `<p>${intro}</p><p>Work through the material at your own pace, reflect on the key ideas, and engage with your cohort in the discussion forum. Mark the lesson complete to unlock the next one.</p>` +
    `<h3>Key ideas</h3><ul><li>Integrate faith and business as a seamless whole, not separate domains.</li><li>Apply biblical principles of stewardship, justice and service to real business contexts.</li><li>Develop a global, diaspora-informed perspective on enterprise and ethics.</li></ul>` +
    `<blockquote>"Commit to the Lord whatever you do, and he will establish your plans." — Proverbs 16:3</blockquote>`;

  async function createCourseIfMissing(slug, courseData, modulesData) {
    const exists = await knex('courses').where({ slug }).first();
    if (exists) return exists.id;

    const [cid] = await knex('courses').insert(courseData);
    const courseId = Array.isArray(cid) ? cid[0] : cid;

    for (let mi = 0; mi < modulesData.length; mi++) {
      const m = modulesData[mi];
      const [mid] = await knex('modules').insert({
        course_id: courseId,
        title: m.title,
        summary: m.summary || null,
        sort_order: mi + 1,
        essay_required: !!m.essay_required,
        essay_prompt: m.essay_prompt || null,
      });
      const moduleId = Array.isArray(mid) ? mid[0] : mid;

      for (let li = 0; li < m.lessons.length; li++) {
        const l = m.lessons[li];
        await knex('lessons').insert({
          module_id: moduleId,
          title: l.title,
          type: l.type || 'reading',
          content: l.content || lessonBody(l.title),
          video_url: l.video_url || null,
          duration_min: l.duration_min || 20,
          sort_order: li + 1,
        });
      }

      // Add a module-end quiz
      if (m.quiz) {
        const [qidRaw] = await knex('quizzes').insert({
          course_id: courseId,
          module_id: moduleId,
          title: `Quiz: ${m.title}`,
          description: m.quiz.description || `Check your understanding of ${m.title}.`,
          pass_mark: 60,
          time_limit_min: 15,
          max_attempts: 2,
          randomize_questions: false,
          feedback_mode: 'after_attempt',
          sort_order: mi + 1,
        });
        const quizId = Array.isArray(qidRaw) ? qidRaw[0] : qidRaw;

        for (const q of m.quiz.questions) {
          const [qqRaw] = await knex('quiz_questions').insert({
            quiz_id: quizId,
            prompt: q.prompt,
            type: q.type || 'single',
            explanation: q.explanation || null,
            sort_order: 0,
          });
          const qqId = Array.isArray(qqRaw) ? qqRaw[0] : qqRaw;
          for (const o of q.options) {
            await knex('quiz_options').insert({
              question_id: qqId,
              text: o.text,
              is_correct: !!o.correct,
              sort_order: 0,
            });
          }
        }
      }
    }
    return courseId;
  }

  // ===================================================================
  // MBA — Faith-Led Business (6 modules, Masters level)
  // ===================================================================
  await createCourseIfMissing('mba-faith-led-business', {
    slug: 'mba-faith-led-business',
    program_id: mbaProgram.id,
    instructor_id: instructor.id,
    code: 'MBA7101',
    title: 'MBA — Faith-Led Business',
    summary: 'Lead enterprises with integrity, combining rigorous business strategy with a Christian ethic of stewardship.',
    description: 'A practical MBA for entrepreneurs and managers who want to build profitable, ethical organisations. Covers strategy, finance, marketing, operations and ethical leadership, with a focus on the diaspora economy. Each module integrates biblical wisdom with contemporary business best practice.',
    credits: 180,
    icon: 'business_center',
    published: true,
    sort_order: 1,
    drip_feed_enabled: true,
    drip_feed_interval_hours: 4,
  }, [
    // Module 1
    {
      title: 'Module 1 — Faith & Work: A Biblical Theology of Business',
      summary: 'Laying the theological and philosophical foundation for faith-led enterprise.',
      lessons: [
        {
          title: 'The Call to Faithful Enterprise',
          content: lessonBody('Work is not a curse — it is part of God\'s original creation mandate. Explore how business, trade and enterprise are dignified callings in Scripture. From the Garden of Eden to the marketplace, God calls His people to create, steward and trade for the common good. This session reframes business as a form of worship and service.'),
          duration_min: 30,
        },
        {
          title: 'Stewardship, Profit & Purpose',
          content: lessonBody('Profit is not inherently ungodly. Scripture affirms the creation of value, fair exchange and wealth generation — but always within the bounds of justice, generosity and accountability. We examine the tension between maximising shareholder value and serving the common good, and how a Christian worldview resolves it through the principle of faithful stewardship.'),
          duration_min: 30,
        },
        {
          title: 'Business as Mission: The Diaspora Advantage',
          content: lessonBody('Diaspora communities are uniquely positioned to serve as bridges between economies, cultures and faith traditions. This lesson explores how global migration creates entrepreneurial opportunities for kingdom impact. Case studies of diaspora entrepreneurs who are transforming their communities through faith-driven businesses.'),
          duration_min: 30,
        },
        {
          title: 'Integrating Faith & Strategy',
          content: lessonBody('How do you actually integrate faith into strategic decisions? This practical session provides a framework for prayerful, principle-driven strategic thinking. We cover decision-making models that honour both Scripture and sound business logic, with worked examples from real business scenarios.'),
          duration_min: 35,
        },
      ],
      quiz: {
        description: 'Check your understanding of the biblical foundations for business.',
        questions: [
          {
            prompt: 'The concept of "faithful stewardship" in business means…',
            type: 'single',
            options: [
              { text: 'Maximising profit at all costs', correct: false },
              { text: 'Managing resources responsibly for God\'s purposes', correct: true },
              { text: 'Avoiding all financial risk', correct: false },
              { text: 'Donating all profits to charity', correct: false },
            ],
            explanation: 'Faithful stewardship means managing all resources — financial, human and environmental — in a manner that honours God and serves others.',
          },
          {
            prompt: 'According to Scripture, business and commerce are…',
            type: 'single',
            options: [
              { text: 'Inherently corrupt and worldly', correct: false },
              { text: 'Part of God\'s original creation mandate', correct: true },
              { text: 'Only for those who cannot be pastors', correct: false },
              { text: 'Neutral activities with no spiritual significance', correct: false },
            ],
            explanation: 'Genesis 1-2 establishes work, creativity and stewardship as part of God\'s good creation order.',
          },
          {
            prompt: 'The "diaspora advantage" in business refers to…',
            type: 'single',
            options: [
              { text: 'Lower tax rates abroad', correct: false },
              { text: 'The unique ability of diaspora communities to connect markets and cultures', correct: true },
              { text: 'Access to cheap labour', correct: false },
              { text: 'Easier banking regulations', correct: false },
            ],
            explanation: 'Diaspora entrepreneurs bring cross-cultural insight, transnational networks and a heart for both their heritage and adopted communities.',
          },
          {
            prompt: 'A faith-led business should pursue profit and purpose simultaneously.',
            type: 'truefalse',
            options: [
              { text: 'True', correct: true },
              { text: 'False', correct: false },
            ],
            explanation: 'Profit and purpose are not opposed. A well-run business generates sustainable profit while serving the common good.',
          },
        ],
      },
    },
    // Module 2
    {
      title: 'Module 2 — Strategic Management & Organisational Design',
      summary: 'Foundations of strategy, organisational structure and change management.',
      lessons: [
        {
          title: 'Vision, Mission & Strategic Direction',
          content: lessonBody('Every organisation needs a clear sense of purpose. This lesson covers how to craft a compelling vision and mission that reflects both sound business principles and kingdom values. We examine how companies like TOMS, Grameen Bank and others have aligned profit with purpose, and what the church can learn from them.'),
          duration_min: 30,
        },
        {
          title: 'Competitive Strategy in a Global Context',
          content: lessonBody('Porter\'s Five Forces, Blue Ocean Strategy and other frameworks — viewed through the lens of Christian ethics. How do we compete without compromising character? How do we pursue excellence without succumbing to greed? This session equips you to think strategically while maintaining integrity.'),
          duration_min: 35,
        },
        {
          title: 'Organisational Culture & Faith Integration',
          content: lessonBody('Culture eats strategy for breakfast. This lesson explores how to build an organisational culture that embodies Christian values — trust, honesty, service, excellence — without alienating non-Christian stakeholders. Practical guidance on hiring, onboarding, performance management and team building.'),
          duration_min: 30,
        },
        {
          title: 'Change Management & Innovation',
          content: lessonBody('Leading change is one of the hardest tasks in business. Drawing on Kotter\'s 8-Step Model and biblical examples of change leadership (Nehemiah, Paul), this session provides a practical roadmap for guiding organisations through transformation with wisdom and compassion.'),
          duration_min: 30,
        },
      ],
      quiz: {
        description: 'Assess your strategic management knowledge.',
        questions: [
          {
            prompt: 'A company\'s mission statement should answer which question?',
            type: 'single',
            options: [
              { text: 'How much profit will we make?', correct: false },
              { text: 'What is our purpose and why do we exist?', correct: true },
              { text: 'Who are our competitors?', correct: false },
              { text: 'How many employees do we need?', correct: false },
            ],
            explanation: 'A mission statement defines the organisation\'s core purpose and reason for existing.',
          },
          {
            prompt: 'Blue Ocean Strategy emphasises…',
            type: 'single',
            options: [
              { text: 'Competing in existing markets more aggressively', correct: false },
              { text: 'Creating new market space where competition is irrelevant', correct: true },
              { text: 'Reducing costs to the minimum', correct: false },
              { text: 'Focusing only on domestic markets', correct: false },
            ],
            explanation: 'Blue Ocean Strategy advocates creating uncontested market space rather than fighting over saturated markets.',
          },
          {
            prompt: 'According to Kotter, the first step in leading change is…',
            type: 'single',
            options: [
              { text: 'Creating a sense of urgency', correct: true },
              { text: 'Forming a powerful coalition', correct: false },
              { text: 'Communicating the vision', correct: false },
              { text: 'Empowering broad-based action', correct: false },
            ],
            explanation: 'Kotter\'s first step is establishing urgency — helping people see the need for change.',
          },
          {
            prompt: 'A faith-led organisational culture can only be built with a 100% Christian workforce.',
            type: 'truefalse',
            options: [
              { text: 'True', correct: false },
              { text: 'False', correct: true },
            ],
            explanation: 'Christian values can be embodied and modelled in any workplace, and diverse teams can thrive under shared ethical principles.',
          },
        ],
      },
    },
    // Module 3
    {
      title: 'Module 3 — Financial Management & Stewardship',
      summary: 'Financial acumen for leaders: accounting, finance, budgeting and ethical stewardship.',
      lessons: [
        {
          title: 'Understanding Financial Statements',
          content: lessonBody('Every leader must read the numbers. This lesson demystifies the balance sheet, income statement and cash flow statement. You don\'t need to be an accountant, but you need to understand the financial story your organisation is telling. We walk through real financial statements and highlight the key indicators of financial health.'),
          duration_min: 35,
        },
        {
          title: 'Budgeting & Financial Planning',
          content: lessonBody('The budget is a moral document — it reveals what you truly value. This lesson covers zero-based budgeting, forecasting, variance analysis and how to align your financial plans with your strategic priorities. Special attention is given to budgeting in not-for-profit and ministry contexts.'),
          duration_min: 30,
        },
        {
          title: 'Ethical Investment & Kingdom Capital',
          content: lessonBody('Where do you put your money? This session explores faith-consistent investing, ethical banking, microfinance and innovative financing models for diaspora entrepreneurs. We examine the growing field of impact investing and how Christian leaders can deploy capital for both financial return and social/spiritual impact.'),
          duration_min: 35,
        },
        {
          title: 'Risk Management & Financial Integrity',
          content: lessonBody('Managing financial risk is a stewardship responsibility. From fraud prevention to insurance, from reserve policies to internal controls — this practical session equips leaders to protect their organisations and maintain the highest standards of financial integrity and transparency.'),
          duration_min: 30,
        },
      ],
      quiz: {
        description: 'Test your financial management knowledge.',
        questions: [
          {
            prompt: 'The accounting equation is…',
            type: 'single',
            options: [
              { text: 'Revenue minus Expenses equals Profit', correct: false },
              { text: 'Assets equals Liabilities plus Equity', correct: true },
              { text: 'Income equals Expenditure', correct: false },
              { text: 'Cash equals Profit', correct: false },
            ],
            explanation: 'Assets = Liabilities + Equity is the fundamental accounting equation that underpins the balance sheet.',
          },
          {
            prompt: 'A budget is best described as…',
            type: 'single',
            options: [
              { text: 'A prediction of future sales', correct: false },
              { text: 'A moral document reflecting organisational priorities', correct: true },
              { text: 'A legally binding financial contract', correct: false },
              { text: 'A historical record of past spending', correct: false },
            ],
            explanation: 'Budgets reveal what an organisation truly values and prioritises — making them moral and spiritual documents, not just financial ones.',
          },
          {
            prompt: 'Impact investing seeks to generate…',
            type: 'single',
            options: [
              { text: 'Financial returns only', correct: false },
              { text: 'Social or environmental impact only', correct: false },
              { text: 'Both financial returns and measurable positive impact', correct: true },
              { text: 'Tax deductions for donors', correct: false },
            ],
            explanation: 'Impact investing aims to generate both financial return and measurable social/environmental benefit.',
          },
          {
            prompt: 'A cash flow statement is the same as a profit and loss statement.',
            type: 'truefalse',
            options: [
              { text: 'True', correct: false },
              { text: 'False', correct: true },
            ],
            explanation: 'Cash flow and profit are different metrics. A company can be profitable but have negative cash flow, or vice versa.',
          },
        ],
      },
    },
    // Module 4
    {
      title: 'Module 4 — Marketing, Brand & Ethical Communication',
      summary: 'Building brands that communicate truth, serve customers and honour God.',
      lessons: [
        {
          title: 'Marketing with Integrity',
          content: lessonBody('Marketing is not manipulation. This session builds a theology and ethics of marketing — how we communicate value, build trust and serve customers honestly. From truth in advertising to pricing ethics, we explore how to market without compromising Christian witness.'),
          duration_min: 30,
        },
        {
          title: 'Brand Strategy & Storytelling',
          content: lessonBody('Your brand is your reputation. This lesson covers the fundamentals of brand strategy — positioning, differentiation, storytelling — through the lens of authenticity and purpose. Case studies include faith-led brands that have successfully communicated their values without being preachy.'),
          duration_min: 30,
        },
        {
          title: 'Digital Marketing & Social Media Ethics',
          content: lessonBody('The digital marketplace presents unprecedented opportunities and ethical pitfalls. From data privacy to algorithmic bias, from influencer culture to online community building, this session equips you to navigate digital marketing with wisdom and integrity.'),
          duration_min: 30,
        },
        {
          title: 'Customer Service as Ministry',
          content: lessonBody('Every customer interaction is an opportunity to reflect Christ\'s love. This lesson explores how exceptional customer service can be a form of witness, building loyalty and opening doors for meaningful conversations. Practical frameworks for handling complaints, serving diverse customers and creating a service culture.'),
          duration_min: 25,
        },
      ],
      quiz: {
        description: 'Check your marketing ethics and strategy understanding.',
        questions: [
          {
            prompt: 'Ethical marketing is primarily about…',
            type: 'single',
            options: [
              { text: 'Selling as much as possible', correct: false },
              { text: 'Communicating truthfully and serving customers well', correct: true },
              { text: 'Using religious language in advertising', correct: false },
              { text: 'Avoiding all forms of promotion', correct: false },
            ],
            explanation: 'Ethical marketing centres on truthfulness, customer well-being and building trust — not just maximising sales.',
          },
          {
            prompt: 'Data privacy in digital marketing should be guided by…',
            type: 'single',
            options: [
              { text: 'Whatever the law allows', correct: false },
              { text: 'The principle of loving your neighbour as yourself', correct: true },
              { text: 'Maximum data collection for better targeting', correct: false },
              { text: 'Only collecting data from consenting Christians', correct: false },
            ],
            explanation: 'The Golden Rule — treating others as we would want to be treated — is a robust ethical framework for data privacy.',
          },
          {
            prompt: 'Customer complaints should be viewed as…',
            type: 'single',
            options: [
              { text: 'Annoying interruptions', correct: false },
              { text: 'Opportunities to serve and build trust', correct: true },
              { text: 'Legal risks to be minimised', correct: false },
              { text: 'Signs that the customer is wrong', correct: false },
            ],
            explanation: 'Complaints are opportunities to demonstrate humility, empathy and a commitment to excellence.',
          },
        ],
      },
    },
    // Module 5
    {
      title: 'Module 5 — Operations, Entrepreneurship & Social Enterprise',
      summary: 'Operational excellence, venture creation and faith-driven social entrepreneurship.',
      lessons: [
        {
          title: 'Operations & Supply Chain Ethics',
          content: lessonBody('How things get made and delivered matters to God. This lesson examines operations management — process design, quality control, logistics — through the lens of ethical supply chains, fair labour practices and environmental stewardship. Modern slavery in supply chains is a particular focus.'),
          duration_min: 30,
        },
        {
          title: 'Entrepreneurship: From Idea to Venture',
          content: lessonBody('Launching a new venture requires vision, resilience and practical know-how. This session covers business model generation, lean startup methodology, minimum viable products and fundraising. Special attention is given to the unique challenges and opportunities facing diaspora entrepreneurs.'),
          duration_min: 35,
        },
        {
          title: 'Social Enterprise & the Common Good',
          content: lessonBody('Social enterprises blend profit and purpose. This lesson explores different legal structures (CIC, B Corp, charity trading arms) and business models that prioritise social impact alongside financial sustainability. Case studies of successful faith-inspired social enterprises from around the world.'),
          duration_min: 30,
        },
        {
          title: 'Business Planning & Pitching',
          content: lessonBody('Every venture needs a plan. This practical session teaches you how to write a compelling business plan and pitch deck that communicates your vision, strategy and financial projections to investors, partners and stakeholders. We include a template and worked example.'),
          duration_min: 30,
        },
      ],
      quiz: {
        description: 'Test your knowledge of operations and entrepreneurship.',
        questions: [
          {
            prompt: 'A B Corporation (B Corp) certification indicates that a company…',
            type: 'single',
            options: [
              { text: 'Is a Christian-owned business', correct: false },
              { text: 'Meets high standards of social and environmental performance', correct: true },
              { text: 'Is a branch of a multinational corporation', correct: false },
              { text: 'Operates exclusively in developing countries', correct: false },
            ],
            explanation: 'B Corp certification measures a company\'s social and environmental impact, accountability and transparency.',
          },
          {
            prompt: 'The "lean startup" methodology emphasises…',
            type: 'single',
            options: [
              { text: 'Detailed 5-year business planning before launching', correct: false },
              { text: 'Build-Measure-Learn feedback loops and rapid iteration', correct: true },
              { text: 'Hiring as many employees as possible upfront', correct: false },
              { text: 'Focusing only on profit maximisation', correct: false },
            ],
            explanation: 'The lean startup approach prioritises quick experimentation, customer feedback and iterative product development.',
          },
          {
            prompt: 'Faith-led entrepreneurs should view competition as…',
            type: 'single',
            options: [
              { text: 'An enemy to be defeated', correct: false },
              { text: 'A spur to excellence and a chance to serve the market better', correct: true },
              { text: 'Something unspiritual and to be avoided', correct: false },
              { text: 'Irrelevant to business success', correct: false },
            ],
            explanation: 'Healthy competition drives innovation and better service. Christians can compete with excellence and integrity simultaneously.',
          },
          {
            prompt: 'Ethical supply chain management includes ensuring fair wages and safe conditions for workers.',
            type: 'truefalse',
            options: [
              { text: 'True', correct: true },
              { text: 'False', correct: false },
            ],
            explanation: 'Faith-led businesses must care about the people throughout their supply chain, not just direct employees.',
          },
        ],
      },
    },
    // Module 6 — Capstone
    {
      title: 'Module 6 — Ethical Leadership & Capstone Project',
      summary: 'Leadership formation, governance, and the integrating capstone project.',
      essay_required: true,
      essay_prompt: 'Develop a comprehensive business plan or strategic transformation proposal for a real or hypothetical enterprise. The proposal must demonstrate integration of faith-based business principles, strategic analysis, financial planning, ethical considerations and a clear missional vision. Include market analysis, operational plan and projected financials. (3000–4000 words)',
      lessons: [
        {
          title: 'Ethical Leadership in Practice',
          content: lessonBody('Leadership is tested in moments of pressure. This session uses real-world case studies of ethical dilemmas — bribery, discrimination, environmental compromises — to develop your ethical decision-making muscles. We introduce several ethical frameworks (Virtue Ethics, the Four-Way Test, the Matthew 7 Principle) and apply them to complex scenarios.'),
          duration_min: 35,
        },
        {
          title: 'Corporate Governance & Board Leadership',
          content: lessonBody('Good governance protects mission and ensures accountability. This lesson covers board structures, fiduciary duties, the role of non-executive directors and how to build governance frameworks that serve both commercial and missional objectives. Special attention to governance in family businesses and faith-based organisations.'),
          duration_min: 30,
        },
        {
          title: 'Leading for Impact: Measuring What Matters',
          content: lessonBody('What gets measured gets done. This session explores the Balanced Scorecard, Triple Bottom Line (People, Planet, Profit) and Kingdom Impact frameworks for measuring organisational success beyond financial metrics. How do you track spiritual and social impact alongside commercial performance?'),
          duration_min: 30,
        },
        {
          title: 'Capstone Integration: From Learning to Launch',
          content: lessonBody('The MBA journey culminates in your capstone project. This final session guides you through integrating everything you have learned — theology, strategy, finance, marketing, operations and leadership — into a coherent, actionable business plan. Reflect on your personal leadership journey and prepare to launch your faith-led enterprise.'),
          duration_min: 35,
        },
      ],
      quiz: {
        description: 'Final review of ethical leadership and capstone preparation.',
        questions: [
          {
            prompt: 'The Triple Bottom Line measures success across which three dimensions?',
            type: 'single',
            options: [
              { text: 'Profit, Productivity, People', correct: false },
              { text: 'People, Planet, Profit', correct: true },
              { text: 'Product, Price, Promotion', correct: false },
              { text: 'Prayer, Planning, Performance', correct: false },
            ],
            explanation: 'The Triple Bottom Line (3Ps) evaluates an organisation\'s social, environmental and financial performance.',
          },
          {
            prompt: 'A non-executive director\'s primary role is to…',
            type: 'single',
            options: [
              { text: 'Run the day-to-day operations', correct: false },
              { text: 'Provide independent oversight and challenge', correct: true },
              { text: 'Market the company to investors', correct: false },
              { text: 'Make all major hiring decisions', correct: false },
            ],
            explanation: 'Non-executive directors bring independent judgement and oversight to board governance.',
          },
          {
            prompt: 'Virtue ethics asks which question when facing a dilemma?',
            type: 'single',
            options: [
              { text: 'What would a person of good character do?', correct: true },
              { text: 'What will maximise profit?', correct: false },
              { text: 'What does the law say?', correct: false },
              { text: 'What will my competitors do?', correct: false },
            ],
            explanation: 'Virtue ethics focuses on the character of the decision-maker rather than rules or consequences alone.',
          },
          {
            prompt: 'The goal of this MBA programme is to create Christian business leaders who separate their faith from their professional decisions.',
            type: 'truefalse',
            options: [
              { text: 'True', correct: false },
              { text: 'False', correct: true },
            ],
            explanation: 'The programme\'s goal is the opposite — to integrate faith and business so that every decision reflects a Christian worldview.',
          },
        ],
      },
    },
  ]);

  console.log('\n  ✅ Seeded MBA — Faith-Led Business (6 modules)');
  console.log('     Module 1 — Faith & Work: A Biblical Theology of Business');
  console.log('     Module 2 — Strategic Management & Organisational Design');
  console.log('     Module 3 — Financial Management & Stewardship');
  console.log('     Module 4 — Marketing, Brand & Ethical Communication');
  console.log('     Module 5 — Operations, Entrepreneurship & Social Enterprise');
  console.log('     Module 6 — Ethical Leadership & Capstone Project');
};
