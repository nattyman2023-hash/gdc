/**
 * Seed: BA Theology & Ministry — full 3-year degree programme.
 * Year 1: 10 modules, Year 2: 10 modules, Year 3: 10 modules.
 * Each module has ~3 lessons, a quiz, and the last module of each year requires an essay.
 *
 * Idempotent: creates courses/modules/lessons only if they don't already exist
 * (checks by slug so it won't wipe existing LMS data).
 */
const bcrypt = require('bcryptjs');

exports.seed = async function (knex) {
  // The BA was consolidated into a single "BA Theology & Ministry" course with the
  // years as internal modules. If that merged course exists, do NOT recreate the
  // old standalone year-courses (they would clutter the catalogue as duplicates).
  const merged = await knex('courses').where({ slug: 'ba-theology-ministry' }).first();
  if (merged) { console.log('  ↪ BA already set up as one degree course — skipping legacy year-course seed.'); return; }

  // Find the BA Theology program and an instructor
  const theologyProgram = await knex('programs').where({ slug: 'ba-theology-ministry' }).first();
  if (!theologyProgram) { console.log('  ⚠ BA Theology programme not found — skipping BA seed.'); return; }

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
    `<h3>Key ideas</h3><ul><li>Ground every principle in Scripture and sound theology.</li><li>Apply learning to your own ministry context and calling.</li><li>Engage critically with historical and contemporary perspectives.</li></ul>`;

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
  // YEAR 1 — Foundations
  // ===================================================================
  await createCourseIfMissing('ba-theology-year-1', {
    slug: 'ba-theology-year-1',
    program_id: theologyProgram.id,
    instructor_id: instructor.id,
    code: 'THEO1101',
    title: 'BA Theology & Ministry — Year 1: Foundations',
    summary: 'Biblical foundations, spiritual formation, and introduction to theological study.',
    description: 'Year 1 lays the groundwork: biblical overview, hermeneutics basics, spiritual disciplines, church history survey, introduction to systematic theology, pastoral care foundations, academic writing for theology, world Christianity, ethics, and mission foundations.',
    credits: 120,
    icon: 'school',
    published: true,
    sort_order: 1,
    drip_feed_enabled: true,
    drip_feed_interval_hours: 4,
  }, [
    // Module 1
    { title: 'Module 1 — Introduction to the Bible', summary: 'Overview of the biblical canon, its structure, and major themes.',
      lessons: [
        { title: 'The Story of Scripture', content: lessonBody('The Bible tells one unified story of creation, fall, redemption and new creation.'), duration_min: 25 },
        { title: 'How the Canon Was Formed', content: lessonBody('Explore how the 66 books were recognised as authoritative Scripture.'), duration_min: 25 },
        { title: 'Major Themes: Covenant, Kingdom, Redemption', content: lessonBody('Trace the key covenants and the unfolding kingdom of God.'), duration_min: 30 },
      ],
      quiz: { description: 'Check your grasp of the biblical canon and major themes.',
        questions: [
          { prompt: 'The Bible is best described as…', type: 'single', options: [
            { text: 'A single book written by one author', correct: false },
            { text: 'A unified library of 66 books telling one story', correct: true },
            { text: 'A collection of unrelated religious texts', correct: false },
          ], explanation: 'The Bible is a unified library of 66 books written by many authors over centuries.' },
          { prompt: 'The four major covenants include Abrahamic, Mosaic, Davidic and…', type: 'single', options: [
            { text: 'The New Covenant', correct: true }, { text: 'The Philistine Covenant', correct: false }, { text: 'The Egyptian Covenant', correct: false },
          ]},
          { prompt: 'The Old Testament canon was firmly established by the early church.', type: 'truefalse', options: [
            { text: 'True', correct: false }, { text: 'False', correct: true },
          ], explanation: 'The OT canon was largely settled by Jewish communities before the early church.' },
        ]},
    },
    // Module 2
    { title: 'Module 2 — Spiritual Formation & Discipleship', summary: 'Personal spiritual growth, prayer, and devotional practices.',
      lessons: [
        { title: 'The Call to Discipleship', content: lessonBody('Following Jesus is the foundation of all Christian life and ministry.'), duration_min: 20 },
        { title: 'Prayer, Fasting & the Spiritual Disciplines', content: lessonBody('Classic disciplines that shape the interior life of the minister.'), duration_min: 25 },
        { title: 'Rule of Life: Crafting a Sustainable Rhythm', content: lessonBody('Develop a personal rule of life that sustains long-term ministry.'), duration_min: 30 },
      ],
      quiz: { description: 'Reflect on spiritual formation and the disciplines.',
        questions: [
          { prompt: 'What is the primary goal of the spiritual disciplines?', type: 'single', options: [
            { text: 'Earning God\'s favour', correct: false }, { text: 'Positioning ourselves to receive grace and grow', correct: true }, { text: 'Impressing others with piety', correct: false },
          ]},
          { prompt: 'A "Rule of Life" refers to…', type: 'single', options: [
            { text: 'A legalistic code of conduct', correct: false }, { text: 'An intentional pattern of spiritual practices', correct: true }, { text: 'A monastic vow of silence', correct: false },
          ]},
        ]},
    },
    // Module 3
    { title: 'Module 3 — Hermeneutics I: Principles of Interpretation', summary: 'Foundational principles for reading Scripture faithfully.',
      lessons: [
        { title: 'What is Hermeneutics?', content: lessonBody('Hermeneutics is the art and science of biblical interpretation.'), duration_min: 20 },
        { title: 'Context is King: Literary, Historical & Theological', content: lessonBody('Every text has a context that must be honoured.'), duration_min: 25 },
        { title: 'The Role of the Holy Spirit in Interpretation', content: lessonBody('The Spirit illuminates Scripture as we study with humility.'), duration_min: 20 },
      ],
      quiz: { description: 'Test your understanding of hermeneutical principles.',
        questions: [
          { prompt: 'Hermeneutics is best defined as…', type: 'single', options: [
            { text: 'The art and science of biblical interpretation', correct: true }, { text: 'The study of heresies', correct: false }, { text: 'A type of preaching', correct: false },
          ]},
          { prompt: 'The three contexts to consider when reading Scripture are…', type: 'single', options: [
            { text: 'Political, economic, social', correct: false }, { text: 'Literary, historical, theological', correct: true }, { text: 'Personal, familial, communal', correct: false },
          ]},
        ]},
    },
    // Module 4
    { title: 'Module 4 — Church History I: Early Church to Reformation', summary: 'Survey of the first 1500 years of Christian history.',
      lessons: [
        { title: 'The Early Church: Persecution to Christendom', content: lessonBody('From the catacombs to Constantine, the church grew against all odds.'), duration_min: 25 },
        { title: 'Augustine, Creeds & Councils', content: lessonBody('How the great creeds shaped orthodox Christian belief.'), duration_min: 25 },
        { title: 'The Reformation: Luther, Calvin & the Radicals', content: lessonBody('The 16th-century recovery of Scripture and justification by faith.'), duration_min: 30 },
      ],
      quiz: { description: 'Review key figures and events of early church history.',
        questions: [
          { prompt: 'The Edict of Milan (AD 313)…', type: 'single', options: [
            { text: 'Made Christianity the state religion', correct: false }, { text: 'Granted religious toleration to Christians', correct: true }, { text: 'Banned Christian worship', correct: false },
          ]},
          { prompt: 'Augustine of Hippo wrote which famous work?', type: 'single', options: [
            { text: 'Summa Theologica', correct: false }, { text: 'Confessions', correct: true }, { text: 'Institutes of the Christian Religion', correct: false },
          ]},
        ]},
    },
    // Module 5
    { title: 'Module 5 — Introduction to Systematic Theology', summary: 'Core Christian doctrines: God, Christ, Holy Spirit, salvation.',
      lessons: [
        { title: 'The Doctrine of God: Trinity & Attributes', content: lessonBody('The one true God exists eternally as Father, Son and Holy Spirit.'), duration_min: 25 },
        { title: 'Christology: The Person and Work of Jesus', content: lessonBody('Who Jesus is and what He accomplished through incarnation, death and resurrection.'), duration_min: 30 },
        { title: 'Soteriology: The Doctrine of Salvation', content: lessonBody('Justification, sanctification, adoption and glorification in Christ.'), duration_min: 25 },
      ],
      quiz: { description: 'Test your knowledge of core Christian doctrines.',
        questions: [
          { prompt: 'The doctrine of the Trinity affirms…', type: 'single', options: [
            { text: 'Three gods working together', correct: false }, { text: 'One God in three persons', correct: true }, { text: 'One person appearing three ways', correct: false },
          ]},
          { prompt: 'Justification is best defined as…', type: 'single', options: [
            { text: 'Being declared righteous by God through faith', correct: true }, { text: 'Becoming morally perfect', correct: false }, { text: 'Earning salvation through good works', correct: false },
          ]},
        ]},
    },
    // Module 6
    { title: 'Module 6 — Introduction to Pastoral Care', summary: 'Foundational skills for caring for individuals and families.',
      lessons: [
        { title: 'A Theology of Care', content: lessonBody('God is the ultimate Shepherd; pastoral care flows from His character.'), duration_min: 20 },
        { title: 'Listening & Empathy Skills', content: lessonBody('The most powerful care tool is a listening ear and an empathetic heart.'), duration_min: 25 },
        { title: 'Crisis Intervention Basics', content: lessonBody('How to respond wisely and compassionately in moments of crisis.'), duration_min: 25 },
      ],
      quiz: { description: 'Assess your pastoral care foundations.',
        questions: [
          { prompt: 'Pastoral care is primarily an expression of…', type: 'single', options: [
            { text: 'Professional counselling', correct: false }, { text: 'God\'s shepherding love through His people', correct: true }, { text: 'Church discipline', correct: false },
          ]},
          { prompt: 'Active listening involves reflecting back what you hear.', type: 'truefalse', options: [
            { text: 'True', correct: true }, { text: 'False', correct: false },
          ]},
        ]},
    },
    // Module 7
    { title: 'Module 7 — Academic Writing & Research for Theology', summary: 'Skills for theological study, essay writing and research.',
      lessons: [
        { title: 'Reading Theologically', content: lessonBody('Learn to read primary and secondary sources with critical engagement.'), duration_min: 20 },
        { title: 'Structuring a Theological Essay', content: lessonBody('From thesis statement to conclusion: writing clear, argued essays.'), duration_min: 25 },
        { title: 'Referencing & Avoiding Plagiarism', content: lessonBody('Proper citation honours sources and maintains academic integrity.'), duration_min: 20 },
      ],
      quiz: { description: 'Check your academic writing skills.',
        questions: [
          { prompt: 'A thesis statement should…', type: 'single', options: [
            { text: 'Be vague and general', correct: false }, { text: 'State a clear, arguable claim', correct: true }, { text: 'Repeat the essay question', correct: false },
          ]},
        ]},
    },
    // Module 8
    { title: 'Module 8 — World Christianity & the Global Church', summary: 'Survey of Christianity as a global, multicultural faith.',
      lessons: [
        { title: 'The Shift to the Global South', content: lessonBody('Christianity\'s centre of gravity has moved from Europe to Africa, Asia and Latin America.'), duration_min: 25 },
        { title: 'African Christianity: Ancient & Modern', content: lessonBody('From Augustine to the Azusa Street revival, Africa\'s role in Christian history.'), duration_min: 25 },
        { title: 'Diaspora & Mission', content: lessonBody('Migration is reshaping global Christianity and creating new mission frontiers.'), duration_min: 25 },
      ],
      quiz: { description: 'Reflect on world Christianity.',
        questions: [
          { prompt: 'Today, the majority of Christians live in…', type: 'single', options: [
            { text: 'Europe and North America', correct: false }, { text: 'Africa, Asia and Latin America', correct: true }, { text: 'The Middle East', correct: false },
          ]},
        ]},
    },
    // Module 9
    { title: 'Module 9 — Christian Ethics', summary: 'Introduction to moral theology and ethical decision-making.',
      lessons: [
        { title: 'Sources of Christian Ethics', content: lessonBody('Scripture, tradition, reason and experience in ethical reflection.'), duration_min: 20 },
        { title: 'Sanctity of Life Issues', content: lessonBody('A biblical framework for engaging bioethical questions.'), duration_min: 25 },
        { title: 'Justice, Poverty & the Kingdom', content: lessonBody('God\'s heart for justice and the church\'s call to respond.'), duration_min: 25 },
      ],
      quiz: { description: 'Test your ethical reasoning.',
        questions: [
          { prompt: 'The Wesleyan Quadrilateral for ethics includes…', type: 'single', options: [
            { text: 'Scripture, tradition, reason, experience', correct: true }, { text: 'Politics, economics, culture, law', correct: false }, { text: 'Faith, hope, love, prayer', correct: false },
          ]},
        ]},
    },
    // Module 10 (Year 1 Capstone — requires essay)
    { title: 'Module 10 — Foundations of Mission & Evangelism', summary: 'Biblical basis for mission and practical evangelism.',
      essay_required: true,
      essay_prompt: 'Reflect on the biblical basis for mission and describe how you would contextualise the gospel in your own community. (1500–2000 words)',
      lessons: [
        { title: 'Missio Dei: The Mission of God', content: lessonBody('Mission flows from the very heart of God, not just the church\'s programmes.'), duration_min: 25 },
        { title: 'Contextualising the Gospel', content: lessonBody('How to communicate the unchanging gospel in changing cultural contexts.'), duration_min: 30 },
        { title: 'Year 1 Integration & Reflection', content: lessonBody('Synthesise the learning from Year 1 and prepare for Year 2.'), duration_min: 30 },
      ],
      quiz: { description: 'End-of-year review of mission foundations.',
        questions: [
          { prompt: 'Missio Dei means…', type: 'single', options: [
            { text: 'The mission of the church', correct: false }, { text: 'The mission of God', correct: true }, { text: 'The mission of the apostles', correct: false },
          ]},
          { prompt: 'Contextualisation involves changing the gospel message to fit culture.', type: 'truefalse', options: [
            { text: 'True', correct: false }, { text: 'False', correct: true },
          ], explanation: 'Contextualisation communicates the unchanging gospel in culturally relevant ways without altering its content.' },
        ]},
    },
  ]);

  // ===================================================================
  // YEAR 2 — Deepening
  // ===================================================================
  await createCourseIfMissing('ba-theology-year-2', {
    slug: 'ba-theology-year-2',
    program_id: theologyProgram.id,
    instructor_id: instructor.id,
    code: 'THEO2101',
    title: 'BA Theology & Ministry — Year 2: Deepening',
    summary: 'Advanced biblical studies, theology, preaching, and pastoral ministry.',
    description: 'Year 2 deepens your engagement with Old and New Testament studies, advanced hermeneutics, preaching, liturgy, pastoral counselling, systematic theology (Christology & Pneumatology), church history (Reformation to present), missiology, youth ministry, and church administration.',
    credits: 120,
    icon: 'menu_book',
    published: true,
    sort_order: 2,
    drip_feed_enabled: true,
    drip_feed_interval_hours: 4,
  }, [
    { title: 'Module 1 — Old Testament Studies: Pentateuch', summary: 'In-depth study of Genesis to Deuteronomy.',
      lessons: [
        { title: 'Genesis: Creation, Fall & Covenant', content: lessonBody('The foundational narratives of creation, human rebellion and divine promise.'), duration_min: 30 },
        { title: 'Exodus: Liberation & Law', content: lessonBody('God liberates His people and establishes covenant relationship at Sinai.'), duration_min: 30 },
        { title: 'Leviticus to Deuteronomy: Holiness & Renewal', content: lessonBody('Laws of holiness, wilderness wandering, and covenant renewal.'), duration_min: 25 },
      ],
      quiz: { description: 'Check your understanding of the Pentateuch.',
        questions: [
          { prompt: 'The Pentateuch refers to…', type: 'single', options: [
            { text: 'The first five books of the Old Testament', correct: true }, { text: 'The first five books of the New Testament', correct: false }, { text: 'The Psalms', correct: false },
          ]},
        ]},
    },
    { title: 'Module 2 — New Testament Studies: Gospels & Acts', summary: 'The life of Jesus and the birth of the church.',
      lessons: [
        { title: 'The Synoptic Gospels: Matthew, Mark & Luke', content: lessonBody('Three portraits of Jesus, each with a distinct audience and emphasis.'), duration_min: 30 },
        { title: 'The Gospel of John', content: lessonBody('John\'s unique theological portrait of Jesus as the incarnate Word.'), duration_min: 25 },
        { title: 'Acts: The Spirit-Empowered Church', content: lessonBody('The birth, growth and mission of the early church across the Roman world.'), duration_min: 25 },
      ],
      quiz: { description: 'Review the Gospels and Acts.',
        questions: [
          { prompt: 'The Synoptic Gospels are…', type: 'single', options: [
            { text: 'Matthew, Mark, Luke', correct: true }, { text: 'Matthew, Mark, Luke, John', correct: false }, { text: 'Mark, Luke, John', correct: false },
          ]},
        ]},
    },
    { title: 'Module 3 — Hermeneutics II: Advanced Interpretation', summary: 'Genre-specific hermeneutics and contemporary approaches.',
      lessons: [
        { title: 'Reading Apocalyptic Literature', content: lessonBody('How to interpret Daniel, Revelation and apocalyptic passages faithfully.'), duration_min: 25 },
        { title: 'Reading Wisdom Literature', content: lessonBody('Proverbs, Job and Ecclesiastes require distinct interpretive approaches.'), duration_min: 25 },
        { title: 'Post-Colonial & Diaspora Hermeneutics', content: lessonBody('Reading Scripture from the margins: post-colonial and diaspora perspectives.'), duration_min: 30 },
      ],
      quiz: { description: 'Test your genre-specific interpretive skills.',
        questions: [
          { prompt: 'Apocalyptic literature is best understood as…', type: 'single', options: [
            { text: 'Literal predictions of future events', correct: false }, { text: 'Symbolic resistance literature offering hope', correct: true }, { text: 'Mythological fiction', correct: false },
          ]},
        ]},
    },
    { title: 'Module 4 — Homiletics: The Art of Preaching', summary: 'Preparing and delivering biblical sermons.',
      lessons: [
        { title: 'The Theology of Preaching', content: lessonBody('Why we preach: proclamation as an act of worship and formation.'), duration_min: 20 },
        { title: 'From Text to Sermon', content: lessonBody('A step-by-step method for moving from exegesis to sermon outline.'), duration_min: 30 },
        { title: 'Preaching in Different Contexts', content: lessonBody('Adapting your preaching for diverse congregations and occasions.'), duration_min: 25 },
      ],
      quiz: { description: 'Assess your homiletics foundations.',
        questions: [
          { prompt: 'Exegesis means…', type: 'single', options: [
            { text: 'Reading meaning into the text', correct: false }, { text: 'Drawing meaning out of the text', correct: true }, { text: 'Memorising the text', correct: false },
          ]},
        ]},
    },
    { title: 'Module 5 — Liturgy & Worship', summary: 'Theology and practice of Christian worship.',
      lessons: [
        { title: 'A Biblical Theology of Worship', content: lessonBody('Worship is the response of God\'s people to God\'s revelation.'), duration_min: 25 },
        { title: 'Liturgical Traditions Across Cultures', content: lessonBody('From high church to charismatic: the breadth of Christian worship.'), duration_min: 25 },
        { title: 'Designing a Worship Service', content: lessonBody('Practical principles for crafting services that honour God and engage people.'), duration_min: 25 },
      ],
      quiz: { description: 'Reflect on worship theology.',
        questions: [
          { prompt: 'True worship is…', type: 'single', options: [
            { text: 'Limited to Sunday services', correct: false }, { text: 'A whole-life response to God', correct: true }, { text: 'Primarily about music style', correct: false },
          ]},
        ]},
    },
    { title: 'Module 6 — Pastoral Counselling', summary: 'Deeper skills for pastoral counselling situations.',
      lessons: [
        { title: 'Counselling Theory for Pastors', content: lessonBody('Key counselling approaches adapted for pastoral ministry.'), duration_min: 25 },
        { title: 'Marriage & Family Counselling', content: lessonBody('Supporting couples and families through conflict, change and growth.'), duration_min: 25 },
        { title: 'Trauma-Informed Pastoral Care', content: lessonBody('Understanding trauma and providing safe, compassionate care.'), duration_min: 30 },
      ],
      quiz: { description: 'Test your counselling knowledge.',
        questions: [
          { prompt: 'A trauma-informed approach prioritises…', type: 'single', options: [
            { text: 'Quick solutions', correct: false }, { text: 'Safety, choice and empowerment', correct: true }, { text: 'Confronting sin immediately', correct: false },
          ]},
        ]},
    },
    { title: 'Module 7 — Systematic Theology II: Christology & Pneumatology', summary: 'Deep dive into the doctrines of Christ and the Holy Spirit.',
      lessons: [
        { title: 'The Hypostatic Union', content: lessonBody('Jesus Christ is fully God and fully man — and why it matters.'), duration_min: 30 },
        { title: 'The Holy Spirit in the Old & New Testaments', content: lessonBody('The Spirit\'s work from creation to Pentecost and beyond.'), duration_min: 25 },
        { title: 'Spiritual Gifts & the Charismatic Question', content: lessonBody('A balanced theology of spiritual gifts for today\'s church.'), duration_min: 30 },
      ],
      quiz: { description: 'Review Christology and Pneumatology.',
        questions: [
          { prompt: 'The Council of Chalcedon (AD 451) affirmed that Christ is…', type: 'single', options: [
            { text: 'Fully divine only', correct: false }, { text: 'Fully divine and fully human in one person', correct: true }, { text: 'A created being', correct: false },
          ]},
        ]},
    },
    { title: 'Module 8 — Church History II: Reformation to Present', summary: 'From the Reformation to the modern global church.',
      lessons: [
        { title: 'The Radical Reformation & Anabaptists', content: lessonBody('The "third wing" of the Reformation and its enduring legacy.'), duration_min: 25 },
        { title: 'Revivalism & the Great Awakenings', content: lessonBody('How revival movements reshaped Christianity in the 18th–19th centuries.'), duration_min: 25 },
        { title: 'Pentecostalism & the Charismatic Movement', content: lessonBody('The fastest-growing Christian movement of the 20th–21st centuries.'), duration_min: 30 },
      ],
      quiz: { description: 'Review modern church history.',
        questions: [
          { prompt: 'The Azusa Street Revival (1906) is associated with…', type: 'single', options: [
            { text: 'The birth of Pentecostalism', correct: true }, { text: 'The Protestant Reformation', correct: false }, { text: 'The Great Schism', correct: false },
          ]},
        ]},
    },
    { title: 'Module 9 — Youth & Family Ministry', summary: 'Ministering to young people and families in contemporary contexts.',
      lessons: [
        { title: 'Theology of Youth Ministry', content: lessonBody('Young people are not the church of tomorrow — they are the church of today.'), duration_min: 20 },
        { title: 'Programmes, Mentoring & Discipleship', content: lessonBody('Effective models for nurturing faith in adolescents.'), duration_min: 25 },
        { title: 'Engaging Digital Natives', content: lessonBody('Ministry to a generation that has never known a world without the internet.'), duration_min: 25 },
      ],
      quiz: { description: 'Reflect on youth and family ministry.',
        questions: [
          { prompt: 'Youth ministry should be…', type: 'single', options: [
            { text: 'Separate from the wider church', correct: false }, { text: 'Integrated into the intergenerational church', correct: true }, { text: 'Focused only on entertainment', correct: false },
          ]},
        ]},
    },
    { title: 'Module 10 — Church Administration & Governance', summary: 'Practical leadership and management of church life.',
      essay_required: true,
      essay_prompt: 'Develop a strategic ministry plan for a specific church or ministry context, integrating theological reflection with practical planning. (2000–2500 words)',
      lessons: [
        { title: 'Biblical Models of Church Governance', content: lessonBody('Episcopal, Presbyterian and Congregational models examined.'), duration_min: 25 },
        { title: 'Strategic Planning for Ministry', content: lessonBody('How to cast vision, set goals and lead change in a church setting.'), duration_min: 30 },
        { title: 'Year 2 Integration & Reflection', content: lessonBody('Synthesise Year 2 learning and prepare for the final year.'), duration_min: 30 },
      ],
      quiz: { description: 'Review church leadership and governance.',
        questions: [
          { prompt: 'The three main historic models of church governance are…', type: 'single', options: [
            { text: 'Episcopal, Presbyterian, Congregational', correct: true }, { text: 'Democratic, Autocratic, Oligarchic', correct: false }, { text: 'Catholic, Orthodox, Protestant', correct: false },
          ]},
        ]},
    },
  ]);

  // ===================================================================
  // YEAR 3 — Integration & Praxis
  // ===================================================================
  await createCourseIfMissing('ba-theology-year-3', {
    slug: 'ba-theology-year-3',
    program_id: theologyProgram.id,
    instructor_id: instructor.id,
    code: 'THEO3101',
    title: 'BA Theology & Ministry — Year 3: Integration & Praxis',
    summary: 'Advanced theology, leadership, contextual ministry, and capstone project.',
    description: 'Year 3 integrates your learning through advanced systematic theology, Pauline studies, prophetic literature, apologetics, diaspora missiology, leadership, church planting, social justice, interfaith engagement and a final capstone ministry project.',
    credits: 120,
    icon: 'workspace_premium',
    published: true,
    sort_order: 3,
    drip_feed_enabled: true,
    drip_feed_interval_hours: 4,
  }, [
    { title: 'Module 1 — Pauline Studies', summary: 'In-depth study of Paul\'s letters and theology.',
      lessons: [
        { title: 'Paul\'s Life & Conversion', content: lessonBody('From persecutor to apostle: the story that shaped Paul\'s theology.'), duration_min: 25 },
        { title: 'Romans: The Gospel Unveiled', content: lessonBody('Paul\'s magnum opus — the most comprehensive statement of the gospel.'), duration_min: 30 },
        { title: 'The Prison Epistles', content: lessonBody('Ephesians, Philippians, Colossians and Philemon: theology from a prison cell.'), duration_min: 25 },
      ],
      quiz: { description: 'Test your knowledge of Pauline theology.',
        questions: [
          { prompt: 'Paul\'s letter to the Romans is primarily about…', type: 'single', options: [
            { text: 'Church order and discipline', correct: false }, { text: 'The righteousness of God revealed in the gospel', correct: true }, { text: 'Eschatological timelines', correct: false },
          ]},
        ]},
    },
    { title: 'Module 2 — Prophetic Literature', summary: 'The message and relevance of the Old Testament prophets.',
      lessons: [
        { title: 'Isaiah: The Fifth Gospel', content: lessonBody('Isaiah\'s vision of God, judgement and the suffering servant.'), duration_min: 30 },
        { title: 'Jeremiah & the New Covenant', content: lessonBody('A prophet\'s anguish and the promise of a new covenant.'), duration_min: 25 },
        { title: 'The Minor Prophets: Major Messages', content: lessonBody('The Twelve speak justice, mercy and hope into contemporary contexts.'), duration_min: 30 },
      ],
      quiz: { description: 'Review the prophetic books.',
        questions: [
          { prompt: 'Isaiah is sometimes called "the Fifth Gospel" because…', type: 'single', options: [
            { text: 'It has exactly the same structure as the Gospels', correct: false }, { text: 'It contains profound messianic prophecies fulfilled in Jesus', correct: true }, { text: 'It was written after the Gospels', correct: false },
          ]},
        ]},
    },
    { title: 'Module 3 — Systematic Theology III: Eschatology & Ecclesiology', summary: 'Doctrines of the last things and the church.',
      lessons: [
        { title: 'The Kingdom: Already but Not Yet', content: lessonBody('Understanding the present and future dimensions of God\'s reign.'), duration_min: 25 },
        { title: 'The Church: One, Holy, Catholic & Apostolic', content: lessonBody('What the Nicene marks mean for today\'s global church.'), duration_min: 25 },
        { title: 'Heaven, Hell & New Creation', content: lessonBody('Biblical hope for the renewal of all things.'), duration_min: 30 },
      ],
      quiz: { description: 'Test your eschatology and ecclesiology.',
        questions: [
          { prompt: '"Already but not yet" refers to…', type: 'single', options: [
            { text: 'The Kingdom of God present now but fully realised in the future', correct: true }, { text: 'Salvation being complete but not yet started', correct: false }, { text: 'The church existing but not yet built', correct: false },
          ]},
        ]},
    },
    { title: 'Module 4 — Apologetics', summary: 'Defending and commending the Christian faith.',
      lessons: [
        { title: 'The Task of Apologetics', content: lessonBody('Giving a reasoned defence of the hope we have — with gentleness and respect.'), duration_min: 20 },
        { title: 'Arguments for God\'s Existence', content: lessonBody('Cosmological, teleological, moral and ontological arguments examined.'), duration_min: 30 },
        { title: 'The Problem of Evil & Suffering', content: lessonBody('The hardest question — and Christian responses through the centuries.'), duration_min: 30 },
      ],
      quiz: { description: 'Assess your apologetics understanding.',
        questions: [
          { prompt: '1 Peter 3:15 calls Christians to give an apologia, which means…', type: 'single', options: [
            { text: 'An apology for being wrong', correct: false }, { text: 'A reasoned defence or explanation', correct: true }, { text: 'An aggressive argument', correct: false },
          ]},
        ]},
    },
    { title: 'Module 5 — Diaspora Missiology', summary: 'Mission among and through diaspora communities.',
      lessons: [
        { title: 'Migration in the Bible', content: lessonBody('From Abraham to the early church, God works through migration.'), duration_min: 25 },
        { title: 'Diaspora as Mission Strategy', content: lessonBody('How scattered peoples become agents of the gospel in new lands.'), duration_min: 25 },
        { title: 'Reverse Mission: From the Margins to the Centre', content: lessonBody('How the global South is re-evangelising the post-Christian West.'), duration_min: 30 },
      ],
      quiz: { description: 'Reflect on diaspora missiology.',
        questions: [
          { prompt: '"Diaspora" in the Bible refers to…', type: 'single', options: [
            { text: 'A type of worship music', correct: false }, { text: 'The scattering of peoples away from their homeland', correct: true }, { text: 'A specific church denomination', correct: false },
          ]},
        ]},
    },
    { title: 'Module 6 — Leadership & Organisational Development', summary: 'Advanced leadership for church and ministry organisations.',
      lessons: [
        { title: 'Servant Leadership Revisited', content: lessonBody('Jesus\' model of leadership applied to complex organisational contexts.'), duration_min: 25 },
        { title: 'Leading Through Change & Conflict', content: lessonBody('Navigating resistance, managing conflict and leading transformation.'), duration_min: 30 },
        { title: 'Developing Teams & Succession', content: lessonBody('Raising up leaders and ensuring healthy transitions.'), duration_min: 25 },
      ],
      quiz: { description: 'Test your leadership knowledge.',
        questions: [
          { prompt: 'The best succession plan is…', type: 'single', options: [
            { text: 'A secret list kept by the senior pastor', correct: false }, { text: 'Continuous leadership development and mentoring', correct: true }, { text: 'Hiring from outside the organisation', correct: false },
          ]},
        ]},
    },
    { title: 'Module 7 — Church Planting & Fresh Expressions', summary: 'Starting new faith communities in diverse contexts.',
      lessons: [
        { title: 'New Testament Models of Church Planting', content: lessonBody('Paul, Peter and the early church planted communities across the empire.'), duration_min: 25 },
        { title: 'Fresh Expressions & Pioneering', content: lessonBody('New forms of church for a changing culture.'), duration_min: 25 },
        { title: 'Developing a Church Plant Proposal', content: lessonBody('Practical steps from vision to launch.'), duration_min: 30 },
      ],
      quiz: { description: 'Review church planting principles.',
        questions: [
          { prompt: 'A "Fresh Expression" is…', type: 'single', options: [
            { text: 'A new worship song', correct: false }, { text: 'A new form of church for those not reached by existing churches', correct: true }, { text: 'A renovation of a church building', correct: false },
          ]},
        ]},
    },
    { title: 'Module 8 — Social Justice & Public Theology', summary: 'The church\'s engagement with issues of justice.',
      lessons: [
        { title: 'The Biblical Basis for Justice', content: lessonBody('Justice is central to the character of God and the message of the prophets.'), duration_min: 25 },
        { title: 'Racial Justice & Reconciliation', content: lessonBody('The gospel calls the church to be a reconciled and reconciling community.'), duration_min: 30 },
        { title: 'The Church & Public Policy', content: lessonBody('How Christians can engage politics without being captured by partisanship.'), duration_min: 25 },
      ],
      quiz: { description: 'Reflect on justice and public theology.',
        questions: [
          { prompt: 'Micah 6:8 summarises God\'s requirement as…', type: 'single', options: [
            { text: 'To do justice, love mercy and walk humbly with God', correct: true }, { text: 'To build the biggest church', correct: false }, { text: 'To separate from the world', correct: false },
          ]},
        ]},
    },
    { title: 'Module 9 — Interfaith Engagement', summary: 'Understanding and engaging with other faith traditions.',
      lessons: [
        { title: 'A Theology of Religions', content: lessonBody('Exclusivism, inclusivism and pluralism — navigating the debate.'), duration_min: 25 },
        { title: 'Understanding Islam', content: lessonBody('Key beliefs, practices and how to build respectful relationships.'), duration_min: 30 },
        { title: 'Engaging African Traditional Religion', content: lessonBody('Understanding ATR and its ongoing influence in African Christianity.'), duration_min: 30 },
      ],
      quiz: { description: 'Test your interfaith understanding.',
        questions: [
          { prompt: 'The five pillars of Islam include…', type: 'single', options: [
            { text: 'Shahada, Salat, Zakat, Sawm, Hajj', correct: true }, { text: 'Baptism, Communion, Confession, Confirmation, Marriage', correct: false }, { text: 'Reading, Writing, Arithmetic, Science, Art', correct: false },
          ]},
        ]},
    },
    { title: 'Module 10 — Capstone Ministry Project', summary: 'Final integration project demonstrating readiness for ministry.',
      essay_required: true,
      essay_prompt: 'Design and present a comprehensive ministry initiative for a real or hypothetical context. The project must demonstrate integration of biblical studies, theology, pastoral care, leadership and contextual awareness. (3000–4000 words)',
      lessons: [
        { title: 'Research Methods for Ministry', content: lessonBody('How to research your context and design evidence-based ministry.'), duration_min: 25 },
        { title: 'Project Design & Proposal Writing', content: lessonBody('From vision statement to budget: crafting a compelling ministry proposal.'), duration_min: 30 },
        { title: 'Graduation & Launch: From Student to Minister', content: lessonBody('Reflecting on the journey and preparing for a lifetime of faithful service.'), duration_min: 30 },
      ],
      quiz: { description: 'Final programme review.',
        questions: [
          { prompt: 'The primary purpose of theological education is…', type: 'single', options: [
            { text: 'Academic achievement', correct: false }, { text: 'Formation for faithful and effective ministry', correct: true }, { text: 'Professional advancement', correct: false },
          ]},
          { prompt: 'GDCU\'s approach to theological education emphasises contextual, diaspora-informed learning.', type: 'truefalse', options: [
            { text: 'True', correct: true }, { text: 'False', correct: false },
          ]},
        ]},
    },
  ]);

  console.log('\n  ✅ Seeded BA Theology & Ministry full degree (3 years × 10 modules)');
  console.log('     Year 1 — Foundations (10 modules)');
  console.log('     Year 2 — Deepening (10 modules)');
  console.log('     Year 3 — Integration & Praxis (10 modules)');
};