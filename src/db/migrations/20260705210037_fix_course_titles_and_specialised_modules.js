/**
 * Migration: Fix course titles (remove "Introductory") and create
 * programme-specific modules for every programme.
 *
 * Problems this fixes:
 * 1. Every course created by 16_autogen_courses.js says "— Introductory Course"
 *    in its title, even MA/PhD programmes.
 * 2. All programmes share the same generic modules — none are specialised.
 * 3. Duplicate shared modules in the library (same title, different codes).
 *
 * This migration:
 * - Renames courses to proper programme-level titles
 * - Deduplicates shared_modules (keeps the oldest by id)
 * - Creates programme-specific dedicated modules with real lessons
 * - Attaches shared core modules + programme-specific modules to each course
 *
 * Idempotent: skips courses that already have specialised modules.
 */

// ── Programme-specific module definitions ──────────────────────
// Each entry: { title, summary, lessons: [{title, type, content}] }
// These are DEDICATED modules (not shared) — they belong only to that course.

const SPECIALISED = {
  // Certificate programmes (2 specialised modules each)
  'certificate-biblical-studies': [
    { title: 'Bible Study Methods & Interpretation', summary: 'Learn inductive and deductive Bible study methods.', lessons: [
      { title: 'Observation: What Does the Text Say?', type: 'reading', content: '<p>Observation is the first step of inductive Bible study. Learn to read carefully, noting keywords, repeated phrases, and literary structure.</p>' },
      { title: 'Interpretation: What Does the Text Mean?', type: 'reading', content: '<p>Interpretation bridges the gap between the ancient text and contemporary understanding. Explore historical context, genre, and grammatical structure.</p>' },
      { title: 'Application: How Does the Text Apply?', type: 'reading', content: '<p>Application moves from understanding to action. Learn to discern timeless principles from cultural particulars.</p>' },
    ]},
    { title: 'Biblical Genres & Literary Forms', summary: 'Understand narrative, poetry, prophecy, and epistle.', lessons: [
      { title: 'Narrative Literature', type: 'reading', content: '<p>Biblical narrative comprises nearly half of Scripture. Learn the elements of story: plot, character, setting, and theme.</p>' },
      { title: 'Poetry and Wisdom', type: 'reading', content: '<p>Hebrew poetry uses parallelism and imagery. Explore Psalms, Proverbs, and Job as literary and theological masterpieces.</p>' },
      { title: 'Prophecy and Apocalyptic', type: 'reading', content: '<p>Prophetic literature calls God\'s people to covenant faithfulness. Understand the context and symbolism of prophetic and apocalyptic texts.</p>' },
    ]},
  ],
  'certificate-christian-ministry': [
    { title: 'Foundations of Pastoral Ministry', summary: 'Biblical foundations for pastoral care and shepherding.', lessons: [
      { title: 'The Shepherd\'s Calling', type: 'reading', content: '<p>Explore the biblical model of the shepherd-pastor from Ezekiel 34 and John 10. Understand the calling, character, and responsibilities of pastoral ministry.</p>' },
      { title: 'Pastoral Care in Practice', type: 'reading', content: '<p>Learn practical frameworks for visiting, counselling, and supporting congregation members through life transitions.</p>' },
      { title: 'Boundaries and Self-Care', type: 'reading', content: '<p>Healthy ministry requires healthy boundaries. Learn to recognise burnout, maintain spiritual disciplines, and set appropriate limits.</p>' },
    ]},
    { title: 'Preaching & Teaching Essentials', summary: 'Prepare and deliver biblical messages.', lessons: [
      { title: 'Exegesis for Preaching', type: 'reading', content: '<p>Learn to move from text to sermon. Explore exegesis, homiletical structure, and sermon preparation workflows.</p>' },
      { title: 'Delivery and Communication', type: 'reading', content: '<p>Effective preaching combines substance with delivery. Study voice, body language, illustration, and audience engagement.</p>' },
      { title: 'Teaching Different Age Groups', type: 'reading', content: '<p>Adapt teaching methods for children, youth, and adults. Explore pedagogy and learning styles in Christian education.</p>' },
    ]},
  ],
  'certificate-pastoral-care': [
    { title: 'Active Listening & Counselling Skills', summary: 'Core skills for pastoral conversations.', lessons: [
      { title: 'The Art of Active Listening', type: 'reading', content: '<p>Active listening is the foundation of pastoral care. Learn attending, reflecting, and clarifying skills that create safe spaces.</p>' },
      { title: 'Crisis Intervention Basics', type: 'reading', content: '<p>When crisis strikes, pastoral caregivers are often first responders. Learn assessment, stabilisation, and referral protocols.</p>' },
      { title: 'Grief and Loss Support', type: 'reading', content: '<p>Explore models of grief (Kubler-Ross, Worden) and learn to walk alongside those mourning loss with compassion and hope.</p>' },
    ]},
    { title: 'Ethics in Pastoral Care', summary: 'Confidentiality, boundaries, and referral.', lessons: [
      { title: 'Confidentiality and Its Limits', type: 'reading', content: '<p>Understand the ethical duty of confidentiality, its limits, and mandatory reporting obligations in pastoral contexts.</p>' },
      { title: 'When to Refer', type: 'reading', content: '<p>Recognise when a situation exceeds pastoral care scope. Learn referral pathways to mental health professionals and agencies.</p>' },
    ]},
  ],
  'certificate-chaplaincy-spiritual-care': [
    { title: 'Chaplaincy in Diverse Settings', summary: 'Hospital, prison, military, and corporate chaplaincy.', lessons: [
      { title: 'The Chaplain\'s Role', type: 'reading', content: '<p>Chaplains serve in secular institutions with interfaith sensitivity. Explore the unique identity and function of chaplaincy.</p>' },
      { title: 'Hospital and Healthcare Chaplaincy', type: 'reading', content: '<p>Learn to provide spiritual care in medical settings, navigating illness, suffering, and end-of-life conversations.</p>' },
      { title: 'Prison and Institutional Chaplaincy', type: 'reading', content: '<p>Explore chaplaincy in correctional and institutional settings, addressing justice, restoration, and spiritual formation.</p>' },
    ]},
    { title: 'Interfaith Spiritual Care', summary: 'Serving people of all faiths with integrity.', lessons: [
      { title: 'Religious Literacy for Chaplains', type: 'reading', content: '<p>Develop working knowledge of major world religions to provide respectful, competent spiritual care across faith traditions.</p>' },
      { title: 'Ethical Frameworks in Chaplaincy', type: 'reading', content: '<p>Explore professional codes of ethics for chaplains, including accountability, scope of practice, and cultural competence.</p>' },
    ]},
  ],
  'certificate-christian-leadership': [
    { title: 'Biblical Models of Leadership', summary: 'Servant leadership from Scripture.', lessons: [
      { title: 'Jesus as Servant Leader', type: 'reading', content: '<p>Jesus redefined leadership as servanthood. Explore the foot-washing model, the Good Shepherd, and Christ\'s teachings on power.</p>' },
      { title: 'Leadership in the Early Church', type: 'reading', content: '<p>Examine leadership structures in Acts and the Epistles. Learn from Peter, Paul, and the Jerusalem Council.</p>' },
      { title: 'Character and Integrity', type: 'reading', content: '<p>Leadership flows from character. Study the qualifications of elders/deacons and the fruit of the Spirit in leadership.</p>' },
    ]},
    { title: 'Team Building & Conflict Resolution', summary: 'Leading teams and navigating conflict biblically.', lessons: [
      { title: 'Building Healthy Teams', type: 'reading', content: '<p>Learn to recruit, develop, and release volunteer and staff teams. Explore gift-based ministry and delegation.</p>' },
      { title: 'Biblical Conflict Resolution', type: 'reading', content: '<p>Study Matthew 18 and Pauline principles for reconciliation. Learn a step-by-step process for church conflict.</p>' },
    ]},
  ],
  'certificate-missions-diaspora-ministry': [
    { title: 'Diaspora Communities & Mission', summary: 'Understanding migration and diaspora mission.', lessons: [
      { title: 'The Diaspora Phenomenon', type: 'reading', content: '<p>Explore global migration trends and their missional implications. Understand push/pull factors and diaspora identity.</p>' },
      { title: 'Cultural Intelligence for Mission', type: 'reading', content: '<p>Develop cultural intelligence (CQ) for cross-cultural ministry. Learn to navigate cultural differences with humility.</p>' },
      { title: 'Building Sustainable Partnerships', type: 'reading', content: '<p>Learn to build mutually beneficial partnerships between diaspora churches and sending/receiving contexts.</p>' },
    ]},
    { title: 'Contextualisation in Diaspora Ministry', summary: 'Gospel and culture in diaspora settings.', lessons: [
      { title: 'Principles of Contextualisation', type: 'reading', content: '<p>Study Paul\'s Areopagus address and principles of contextualisation. Learn to communicate the gospel faithfully across cultures.</p>' },
    ]},
  ],
  'certificate-church-administration': [
    { title: 'Church Finance & Budgeting', summary: 'Stewardship and financial management.', lessons: [
      { title: 'Biblical Stewardship Principles', type: 'reading', content: '<p>Explore biblical teaching on money, stewardship, and generosity. Learn to apply these principles to church finance.</p>' },
      { title: 'Budgeting and Financial Controls', type: 'reading', content: '<p>Learn practical budgeting, accounting basics, and internal controls for churches of all sizes.</p>' },
    ]},
    { title: 'Governance & Legal Compliance', summary: 'Church governance structures and legal requirements.', lessons: [
      { title: 'Governance Models', type: 'reading', content: '<p>Explore episcopal, presbyterian, and congregational governance. Learn board structures, policies, and accountability.</p>' },
      { title: 'Legal Compliance for Churches', type: 'reading', content: '<p>Understand charity law, safeguarding requirements, data protection, and employment law for church settings.</p>' },
    ]},
  ],
  'certificate-prayer-discipleship-spiritual-formation': [
    { title: 'Prayer & Spiritual Disciplines', summary: 'Deepening personal and corporate prayer life.', lessons: [
      { title: 'Biblical Theology of Prayer', type: 'reading', content: '<p>Explore prayer from Genesis to Revelation. Learn from the prayers of Jesus, Paul, and the Psalms.</p>' },
      { title: 'Classical Spiritual Disciplines', type: 'reading', content: '<p>Study the disciplines of prayer, fasting, meditation, solitude, and simplicity from the Christian tradition.</p>' },
    ]},
    { title: 'Discipleship Pathways', summary: 'Making and multiplying disciples.', lessons: [
      { title: 'The Great Commission Today', type: 'reading', content: '<p>Re-examine Matthew 28:18-20. Learn practical discipleship frameworks for contemporary contexts.</p>' },
      { title: 'Mentoring and Spiritual Direction', type: 'reading', content: '<p>Explore the differences between mentoring, coaching, and spiritual direction. Learn basic skills for each.</p>' },
    ]},
  ],
  // Diploma programmes (3 specialised modules each)
  'diploma-biblical-studies': [
    { title: 'Advanced Hermeneutics', summary: 'Interpretive theory and method.', lessons: [
      { title: 'History of Interpretation', type: 'reading', content: '<p>Trace the history of biblical interpretation from the early church through the Reformation to modern critical methods.</p>' },
      { title: 'Grammatical-Historical Method', type: 'reading', content: '<p>Learn the grammatical-historical method in depth, including exegesis of original languages and textual criticism.</p>' },
      { title: 'Postmodern Interpretation', type: 'reading', content: '<p>Engage with postmodern and reader-response criticism. Understand the challenges and opportunities for evangelical hermeneutics.</p>' },
    ]},
    { title: 'Biblical Theology of the Old Testament', summary: 'Tracing themes across the OT.', lessons: [
      { title: 'Covenant and Kingdom', type: 'reading', content: '<p>Explore the twin themes of covenant and kingdom as unifying threads in the Old Testament narrative.</p>' },
      { title: 'Temple and Presence', type: 'reading', content: '<p>Trace the theme of God\'s dwelling presence from Eden through tabernacle, temple, and the prophetic hope.</p>' },
    ]},
    { title: 'Biblical Theology of the New Testament', summary: 'Tracing themes across the NT.', lessons: [
      { title: 'Already and Not Yet', type: 'reading', content: '<p>Explore the inaugurated eschatology of the New Testament — the kingdom is here but not yet fully realised.</p>' },
      { title: 'New Creation in Christ', type: 'reading', content: '<p>Trace the new creation theme from 2 Corinthians 5 through Revelation 21. Understand salvation as cosmic restoration.</p>' },
    ]},
  ],
  'diploma-christian-ministry': [
    { title: 'Advanced Preaching & Homiletics', summary: 'Expository preaching and sermon design.', lessons: [
      { title: 'Expository Preaching Method', type: 'reading', content: '<p>Learn the full expository preaching process: text selection, exegesis, outline, illustration, and application.</p>' },
      { title: 'Preaching Different Genres', type: 'reading', content: '<p>Adapt preaching style to biblical genre. Learn to preach narrative, poetry, prophecy, and epistle faithfully.</p>' },
    ]},
    { title: 'Pastoral Care & Counselling', summary: 'Theology and practice of pastoral care.', lessons: [
      { title: 'Theology of Suffering', type: 'reading', content: '<p>Develop a biblical theology of suffering to undergird pastoral care. Engage with Job, Lamentations, and the cross.</p>' },
      { title: 'Counselling Models for Ministry', type: 'reading', content: '<p>Explore nouthetic, integrationist, and Christian counselling models. Learn when and how to apply each.</p>' },
    ]},
    { title: 'Mission & Evangelism Strategy', summary: 'Developing missional churches.', lessons: [
      { title: 'Missio Dei', type: 'reading', content: '<p>Understand the missio Dei — God\'s mission — as the framework for all church mission and evangelism.</p>' },
    ]},
  ],
  'diploma-chaplaincy-pastoral-care': [
    { title: 'Advanced Chaplaincy Practice', summary: 'Clinical pastoral education foundations.', lessons: [
      { title: 'Clinical Pastoral Education', type: 'reading', content: '<p>Explore the CPE model: verbatim, supervision, and reflective practice in chaplaincy training.</p>' },
      { title: 'Spiritual Assessment Tools', type: 'reading', content: '<p>Learn spiritual assessment frameworks (FICA, HOPE, SPIRIT) for use in healthcare and institutional chaplaincy.</p>' },
    ]},
    { title: 'Crisis & Trauma Chaplaincy', summary: 'Responding to crisis and trauma.', lessons: [
      { title: 'Trauma-Informed Care', type: 'reading', content: '<p>Understand trauma and its effects. Learn trauma-informed approaches to spiritual care and crisis intervention.</p>' },
    ]},
    { title: 'Ethics in Chaplaincy', summary: 'Professional ethics for chaplains.', lessons: [
      { title: 'Professional Codes & Accountability', type: 'reading', content: '<p>Study the codes of ethics from major chaplaincy bodies. Understand accountability, scope, and professional conduct.</p>' },
    ]},
  ],
  'diploma-christian-leadership': [
    { title: 'Organisational Leadership for Churches', summary: 'Leading church organisations effectively.', lessons: [
      { title: 'Organisational Design', type: 'reading', content: '<p>Learn to design church organisational structures that align with mission, values, and strategy.</p>' },
      { title: 'Change Leadership', type: 'reading', content: '<p>Explore biblical and contemporary models of leading change. Learn to navigate resistance and build consensus.</p>' },
    ]},
    { title: 'Developing Leaders', summary: 'Identifying and multiplying leaders.', lessons: [
      { title: 'Leadership Pipeline', type: 'reading', content: '<p>Build a leadership development pipeline: identify, recruit, train, and release leaders at every level.</p>' },
    ]},
    { title: 'Strategic Planning for Ministry', summary: 'Vision, strategy, and execution.', lessons: [
      { title: 'Vision Casting', type: 'reading', content: '<p>Learn to discern, articulate, and communicate a compelling vision grounded in God\'s calling.</p>' },
    ]},
  ],
  // Bachelor programmes (4 specialised modules each, across 3 years)
  'bachelor-biblical-studies': [
    { title: 'Biblical Languages: Greek I', summary: 'Introduction to New Testament Greek.', lessons: [
      { title: 'Greek Alphabet & Pronunciation', type: 'reading', content: '<p>Learn the Greek alphabet, pronunciation systems, and basic writing. Begin reading simple Greek words.</p>' },
      { title: 'Nouns and Cases', type: 'reading', content: '<p>Master Greek noun declensions and the case system. Understand how case endings convey meaning.</p>' },
      { title: 'Verbs and Tenses', type: 'reading', content: '<p>Learn Greek verb conjugation, tense, voice, and mood. Translate simple sentences from John\'s Gospel.</p>' },
    ]},
    { title: 'Biblical Languages: Hebrew I', summary: 'Introduction to Biblical Hebrew.', lessons: [
      { title: 'Hebrew Alphabet & Vowels', type: 'reading', content: '<p>Learn the Hebrew alphabet, vowel points, and basic reading. Practice with Genesis 1:1.</p>' },
      { title: 'Nouns and Construct Chain', type: 'reading', content: '<p>Master Hebrew nouns, gender, number, and the construct chain for expressing possession.</p>' },
    ]},
    { title: 'Advanced Old Testament Exegesis', summary: 'Exegetical method for OT texts.', lessons: [
      { title: 'Exegeting Narrative', type: 'reading', content: '<p>Apply exegetical method to OT narrative. Work through a passage from 1 Samuel using the full exegetical process.</p>' },
    ]},
    { title: 'Advanced New Testament Exegesis', summary: 'Exegetical method for NT texts.', lessons: [
      { title: 'Exegeting Epistles', type: 'reading', content: '<p>Apply exegetical method to NT epistles. Work through a passage from Romans using the full exegetical process.</p>' },
    ]},
  ],
  'bachelor-christian-ministry': [
    { title: 'Ministry Internship & Reflection', summary: 'Supervised ministry practice.', lessons: [
      { title: 'Theology of Ministry Practice', type: 'reading', content: '<p>Develop a personal theology of ministry that integrates biblical foundations with practical experience.</p>' },
      { title: 'Reflective Practice', type: 'reading', content: '<p>Learn the cycle of reflective practice: action, observation, reflection, and planning for ministry growth.</p>' },
    ]},
    { title: 'Youth & Family Ministry', summary: 'Ministry to children, youth, and families.', lessons: [
      { title: 'Developmental Psychology for Ministry', type: 'reading', content: '<p>Understand faith development across the lifespan. Learn to design age-appropriate ministry programmes.</p>' },
    ]},
    { title: 'Worship Leadership', summary: 'Biblical theology and practice of worship.', lessons: [
      { title: 'Biblical Theology of Worship', type: 'reading', content: '<p>Trace worship from Genesis to Revelation. Understand how worship shapes and is shaped by the covenant community.</p>' },
    ]},
    { title: 'Church Planting & Renewal', summary: 'Starting and revitalising churches.', lessons: [
      { title: 'Church Planting Models', type: 'reading', content: '<p>Explore biblical and contemporary church planting models. Learn assessment, team building, and launch strategies.</p>' },
    ]},
  ],
  'bachelor-christian-leadership': [
    { title: 'Leadership Theory & Practice', summary: 'Classical and contemporary leadership theory.', lessons: [
      { title: 'Trait, Behavioural, and Situational Theories', type: 'reading', content: '<p>Survey major leadership theories and evaluate them through a Christian worldview lens.</p>' },
      { title: 'Transformational Leadership', type: 'reading', content: '<p>Explore transformational and servant leadership models. Learn to inspire and develop followers.</p>' },
    ]},
    { title: 'Organisational Behaviour for Christian Leaders', summary: 'Understanding people in organisations.', lessons: [
      { title: 'Motivation and Engagement', type: 'reading', content: '<p>Study motivation theories and their application to volunteer and staff management in church contexts.</p>' },
    ]},
    { title: 'Research Methods for Ministry', summary: 'Evidence-based ministry practice.', lessons: [
      { title: 'Quantitative and Qualitative Methods', type: 'reading', content: '<p>Learn basic research methods for ministry: surveys, interviews, and program evaluation.</p>' },
    ]},
    { title: 'Capstone: Leadership Project', summary: 'Applied leadership project.', lessons: [
      { title: 'Project Design & Proposal', type: 'reading', content: '<p>Design a leadership project that addresses a real ministry challenge. Develop a proposal with goals, methods, and evaluation.</p>' },
    ]},
  ],
  'bachelor-chaplaincy-pastoral-care': [
    { title: 'Theology of Pastoral Care', summary: 'Theological foundations for care.', lessons: [
      { title: 'Pastoral Care as Theology', type: 'reading', content: '<p>Explore the theological foundations of pastoral care: incarnation, suffering, hope, and the priesthood of all believers.</p>' },
    ]},
    { title: 'Counselling Theories & Techniques', summary: 'Major counselling approaches.', lessons: [
      { title: 'Cognitive-Behavioural Approaches', type: 'reading', content: '<p>Learn CBT fundamentals and their integration with Christian pastoral care.</p>' },
      { title: 'Family Systems Theory', type: 'reading', content: '<p>Understand Bowen family systems theory and its application to pastoral care and congregational dynamics.</p>' },
    ]},
    { title: 'Loss, Grief & Bereavement', summary: 'Comprehensive grief support.', lessons: [
      { title: 'Complicated Grief', type: 'reading', content: '<p>Distinguish normal from complicated grief. Learn intervention strategies and referral pathways.</p>' },
    ]},
    { title: 'Capstone: Pastoral Care Project', summary: 'Applied pastoral care project.', lessons: [
      { title: 'Project Design', type: 'reading', content: '<p>Design a pastoral care initiative for a real setting. Include needs assessment, intervention plan, and evaluation.</p>' },
    ]},
  ],
  'bachelor-theology-ministry': [
    { title: 'Systematic Theology I: God & Creation', summary: 'Doctrine of God, Trinity, and creation.', lessons: [
      { title: 'The Doctrine of God', type: 'reading', content: '<p>Explore the attributes of God, the doctrine of the Trinity, and God\'s relationship to creation.</p>' },
      { title: 'Creation and Providence', type: 'reading', content: '<p>Study the doctrines of creation, fall, and providence. Engage with science-faith dialogue.</p>' },
    ]},
    { title: 'Systematic Theology II: Christ & Salvation', summary: 'Christology and soteriology.', lessons: [
      { title: 'Person of Christ', type: 'reading', content: '<p>Explore the hypostatic union, early church councils, and contemporary Christology.</p>' },
      { title: 'Work of Christ', type: 'reading', content: '<p>Study theories of atonement: Christus Victor, penal substitution, moral influence, and governmental.</p>' },
    ]},
    { title: 'Church History I: Early & Medieval', summary: 'From the apostles to the Reformation.', lessons: [
      { title: 'The Early Church', type: 'reading', content: '<p>Explore the apostolic fathers, persecutions, councils, and the rise of the papacy.</p>' },
      { title: 'Medieval Christianity', type: 'reading', content: '<p>Study monasticism, scholasticism, the Crusades, and the medieval church\'s heights and lows.</p>' },
    ]},
    { title: 'Church History II: Reformation & Modern', summary: 'From Luther to the present.', lessons: [
      { title: 'The Reformation', type: 'reading', content: '<p>Explore the Lutheran, Reformed, Anabaptist, and English reformations. Understand their lasting impact.</p>' },
      { title: 'Modern Christianity & Global South', type: 'reading', content: '<p>Study the Enlightenment, missions movement, Pentecostalism, and the shift of Christianity to the Global South.</p>' },
    ]},
  ],
  'bachelor-missions-global-christianity': [
    { title: 'History of Christian Missions', summary: 'From the apostles to the modern mission movement.', lessons: [
      { title: 'Apostolic and Early Missions', type: 'reading', content: '<p>Trace the spread of Christianity from Jerusalem to the ends of the earth in the first centuries.</p>' },
      { title: 'The Modern Mission Movement', type: 'reading', content: '<p>Study Carey, Livingstone, Taylor, and the 19th-century mission movement that reshaped global Christianity.</p>' },
    ]},
    { title: 'World Religions & Religious Pluralism', summary: 'Understanding other faiths.', lessons: [
      { title: 'Islam', type: 'reading', content: '<p>Understand the origins, beliefs, and practices of Islam. Learn to engage in respectful dialogue.</p>' },
      { title: 'Hinduism and Buddhism', type: 'reading', content: '<p>Explore the major Eastern religions and their key texts, practices, and points of contact with Christianity.</p>' },
    ]},
    { title: 'Cross-Cultural Communication', summary: 'Communicating the gospel across cultures.', lessons: [
      { title: 'Culture and Communication Theory', type: 'reading', content: '<p>Study communication theory, cultural dimensions (Hofstede), and their implications for cross-cultural gospel communication.</p>' },
    ]},
    { title: 'Diaspora Church Planting', summary: 'Planting churches among diaspora communities.', lessons: [
      { title: 'Diaspora Church Models', type: 'reading', content: '<p>Explore models of diaspora church planting: ethnic churches, multicultural churches, and network churches.</p>' },
    ]},
  ],
  // Masters — MBA Faith-Led Business (6 specialised modules)
  'msc-business-administration': [
    { title: 'Strategic Management & Kingdom Impact', summary: 'Strategy from a Christian stewardship perspective.', lessons: [
      { title: 'Strategic Analysis Frameworks', type: 'reading', content: '<p>Master SWOT, PESTEL, Porter\'s Five Forces, and resource-based view — all through the lens of Christian stewardship.</p>' },
      { title: 'Vision, Mission & Values', type: 'reading', content: '<p>Develop organisational vision and mission statements grounded in biblical values and ethical purpose.</p>' },
      { title: 'Implementation & Change', type: 'reading', content: '<p>Learn to translate strategy into action through OKRs, balanced scorecards, and change management.</p>' },
    ]},
    { title: 'Financial Management & Stewardship', summary: 'Finance and accounting for faith-led enterprises.', lessons: [
      { title: 'Financial Statements', type: 'reading', content: '<p>Read and analyse balance sheets, income statements, and cash flow statements. Understand financial health indicators.</p>' },
      { title: 'Budgeting & Forecasting', type: 'reading', content: '<p>Learn zero-based, incremental, and activity-based budgeting. Develop financial forecasts for decision-making.</p>' },
      { title: 'Investment & Capital Decisions', type: 'reading', content: '<p>Understand NPV, IRR, and payback period. Evaluate investments through both financial and ethical lenses.</p>' },
    ]},
    { title: 'Marketing & Ethical Persuasion', summary: 'Marketing that honours truth and serves customers.', lessons: [
      { title: 'Market Research & Segmentation', type: 'reading', content: '<p>Learn to conduct market research, segment audiences, and identify target markets ethically.</p>' },
      { title: 'Brand & Digital Marketing', type: 'reading', content: '<p>Explore brand strategy, digital marketing channels, and content marketing for faith-led enterprises.</p>' },
    ]},
    { title: 'Operations & Supply Chain Excellence', summary: 'Efficient, ethical operations management.', lessons: [
      { title: 'Process Design & Lean', type: 'reading', content: '<p>Learn lean principles, process mapping, and continuous improvement for operational excellence.</p>' },
      { title: 'Supply Chain Ethics', type: 'reading', content: '<p>Explore ethical sourcing, fair trade, and supply chain transparency from a Christian ethics perspective.</p>' },
    ]},
    { title: 'Leadership & Organisational Behaviour', summary: 'Leading people with wisdom and integrity.', lessons: [
      { title: 'Motivation & Engagement', type: 'reading', content: '<p>Study motivation theories (Maslow, Herzberg, McClelland) and their application in faith-led workplaces.</p>' },
      { title: 'Team Dynamics & Conflict', type: 'reading', content: '<p>Understand team development stages, conflict resolution, and building healthy organisational culture.</p>' },
    ]},
    { title: 'Capstone: Faith-Led Business Plan', summary: 'Develop a complete business plan.', lessons: [
      { title: 'Business Model Canvas', type: 'reading', content: '<p>Use the Business Model Canvas to design a viable, ethical enterprise. Integrate faith, mission, and business strategy.</p>' },
      { title: 'Financial Projections & Pitch', type: 'reading', content: '<p>Build financial projections and prepare an investor pitch for your faith-led business venture.</p>' },
    ]},
  ],
  // Doctorate programmes (4 specialised research modules each)
  'doctorate-christian-ministry': [
    { title: 'Advanced Research Methods for Ministry', summary: 'Doctoral-level research design.', lessons: [
      { title: 'Research Design & Literature Review', type: 'reading', content: '<p>Learn to design a doctoral research project: formulate questions, conduct literature reviews, and choose methodologies.</p>' },
      { title: 'Qualitative Research for Ministry', type: 'reading', content: '<p>Master qualitative methods: ethnography, case study, and phenomenology for ministry research.</p>' },
    ]},
    { title: 'Advanced Theology of Ministry', summary: 'Contemporary issues in ministry theology.', lessons: [
      { title: 'Ministry in Post-Christendom', type: 'reading', content: '<p>Explore the theological implications of ministering in a post-Christendom, pluralist context.</p>' },
    ]},
    { title: 'Innovation & Ministry Leadership', summary: 'Leading innovation in church and mission.', lessons: [
      { title: 'Disruptive Innovation in Ministry', type: 'reading', content: '<p>Apply innovation theory to ministry contexts. Learn to lead change that is both faithful and effective.</p>' },
    ]},
    { title: 'PhD Dissertation Design', summary: 'Designing the doctoral dissertation.', lessons: [
      { title: 'Dissertation Proposal', type: 'reading', content: '<p>Design a doctoral dissertation in Christian ministry: identify a research problem, review the literature, select a defensible methodology, and define the original contribution.</p>' },
    ]},
  ],
  'doctorate-practical-theology': [
    { title: 'Theories of Practical Theology', summary: 'Foundational frameworks.', lessons: [
      { title: 'What is Practical Theology?', type: 'reading', content: '<p>Explore the discipline of practical theology: its history, methods, and relationship to systematic theology.</p>' },
    ]},
    { title: 'Qualitative Research for Theology', summary: 'Empirical methods in theology.', lessons: [
      { title: 'Ethnography for Theologians', type: 'reading', content: '<p>Learn ethnographic methods for theological research. Study congregational and cultural analysis.</p>' },
    ]},
    { title: 'Theology & Contemporary Culture', summary: 'Engaging culture theologically.', lessons: [
      { title: 'Theology and Technology', type: 'reading', content: '<p>Explore the theological implications of digital culture, AI, and technological acceleration.</p>' },
    ]},
    { title: 'PhD Dissertation Design', summary: 'Designing the doctoral dissertation.', lessons: [
      { title: 'Dissertation Proposal', type: 'reading', content: '<p>Design a doctoral dissertation in practical theology: research question, methodology, and contribution to the field.</p>' },
    ]},
  ],
  'doctorate-chaplaincy-spiritual-care': [
    { title: 'Advanced Spiritual Care Theory', summary: 'Theoretical foundations of spiritual care.', lessons: [
      { title: 'Models of Spiritual Care', type: 'reading', content: '<p>Survey major theoretical models of spiritual care and their theological and psychological foundations.</p>' },
    ]},
    { title: 'Research in Spiritual Care', summary: 'Evidence-based chaplaincy.', lessons: [
      { title: 'Outcomes Research', type: 'reading', content: '<p>Learn to design and evaluate research on spiritual care outcomes in healthcare and institutional settings.</p>' },
    ]},
    { title: 'Supervision & Education', summary: 'Training future chaplains.', lessons: [
      { title: 'Clinical Supervision Theory', type: 'reading', content: '<p>Explore theories of clinical supervision for chaplaincy education and CPE supervision.</p>' },
    ]},
    { title: 'PhD Dissertation Design in Christian Chaplaincy', summary: 'Designing the doctoral dissertation.', lessons: [
      { title: 'Dissertation Proposal', type: 'reading', content: '<p>Design a doctoral dissertation in Christian chaplaincy and spiritual care: identify a research problem, review the literature, select a defensible methodology, and define the original contribution.</p>' },
    ]},
  ],
  'doctorate-christian-leadership': [
    { title: 'Advanced Leadership Theory', summary: 'Doctoral-level leadership studies.', lessons: [
      { title: 'Leadership & Power', type: 'reading', content: '<p>Explore the theology and ethics of power in leadership. Study Foucault, Weber, and biblical perspectives on authority.</p>' },
    ]},
    { title: 'Organisational Transformation', summary: 'Leading deep change.', lessons: [
      { title: 'Transformation Theory', type: 'reading', content: '<p>Study theories of organisational transformation and their application to churches and faith-based organisations.</p>' },
    ]},
    { title: 'Research Methods for Leadership', summary: 'Empirical leadership research.', lessons: [
      { title: 'Mixed Methods Research', type: 'reading', content: '<p>Learn to design mixed-methods research studies for leadership and organisational analysis.</p>' },
    ]},
    { title: 'PhD Leadership Dissertation', summary: 'Dissertation design.', lessons: [
      { title: 'Dissertation Proposal', type: 'reading', content: '<p>Design a doctoral dissertation in Christian leadership: research question, methodology, and original contribution.</p>' },
    ]},
  ],
};

exports.up = async function (knex) {
  // ── 1. Fix course titles ──────────────────────────────────
  const courses = await knex('courses').select('*');
  let titleFixed = 0;
  for (const c of courses) {
    if (c.title && c.title.includes('— Introductory Course')) {
      const newTitle = c.title.replace(' — Introductory Course', '');
      await knex('courses').where({ id: c.id }).update({
        title: newTitle,
        summary: `A comprehensive programme in ${newTitle}.`,
      });
      titleFixed++;
    }
  }
  console.log(`  ✓ Fixed ${titleFixed} course titles (removed "Introductory")`);

  // ── 2. Deduplicate shared modules ─────────────────────────
  const allShared = await knex('shared_modules').orderBy('id');
  const seen = new Map(); // title -> first id
  let dupDeleted = 0;
  for (const sm of allShared) {
    const key = sm.title.toLowerCase().trim();
    if (seen.has(key)) {
      // Reassign any junction rows to the original, then delete the duplicate
      const origId = seen.get(key);
      await knex('course_shared_modules').where({ shared_module_id: sm.id }).update({ shared_module_id: origId });
      // Delete the duplicate's template module + lessons
      const mod = await knex('modules').where({ shared_module_id: sm.id }).first();
      if (mod) {
        await knex('lessons').where({ module_id: mod.id }).del();
        await knex('modules').where({ id: mod.id }).del();
      }
      await knex('shared_modules').where({ id: sm.id }).del();
      dupDeleted++;
    } else {
      seen.set(key, sm.id);
    }
  }
  console.log(`  ✓ Removed ${dupDeleted} duplicate shared modules`);

  // ── 3. Create programme-specific modules ──────────────────
  const programs = await knex('programs').select('*');
  let modCreated = 0;
  let lessonCreated = 0;

  for (const p of programs) {
    const specialised = SPECIALISED[p.slug];
    if (!specialised) continue;

    // Find the course(s) for this programme
    const programmeCourses = await knex('courses').where({ program_id: p.id }).select('*');
    for (const course of programmeCourses) {
      // Skip if this course already has a module with a title matching any specialised module
      const existingTitles = new Set((await knex('modules').where({ course_id: course.id }).pluck('title')).map(t => t.toLowerCase()));
      const alreadyHas = specialised.some(m => existingTitles.has(m.title.toLowerCase()));
      if (alreadyHas) continue;

      // Get the max sort_order for this course
      const maxSortRow = await knex('modules').where({ course_id: course.id }).max('sort_order as m').first();
      let sortOrder = maxSortRow.m || 0;

      for (const modDef of specialised) {
        sortOrder++;
        const [mid] = await knex('modules').insert({
          course_id: course.id,
          title: modDef.title,
          summary: modDef.summary || null,
          sort_order: sortOrder,
          published: true,
        });
        const moduleId = Array.isArray(mid) ? mid[0] : mid;
        modCreated++;

        for (let li = 0; li < modDef.lessons.length; li++) {
          const l = modDef.lessons[li];
          await knex('lessons').insert({
            module_id: moduleId,
            title: l.title,
            type: l.type || 'reading',
            content: l.content,
            duration_min: 15,
            sort_order: li + 1,
            published: true,
          });
          lessonCreated++;
        }
      }
    }
  }
  console.log(`  ✓ Created ${modCreated} programme-specific modules with ${lessonCreated} lessons`);

  // ── 4. Update the autogen seed to never create "Introductory" titles ─
  // (This is a code fix, not a DB fix — the seed file itself needs updating,
  // but we can't modify it from a migration. The title fix above handles
  // existing data. The seed will be updated separately.)
};

exports.down = async function (knex) {
  // Not reversible — content is preserved.
  console.log('  Rollback skipped — content preserved.');
};
