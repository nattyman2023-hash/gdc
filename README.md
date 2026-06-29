# Global Diaspora Christian University (GDCU)

An online university platform — public website, with a foundation for the **LMS** (learning) and **CRM** (admissions/sales/finance) systems. Built with **Node.js + Express + EJS**, backed by **SQLite for local development** and **MySQL on Hostinger** for production (the same code runs on both via Knex).

> Brand: *Academic Heritage* — Deep Navy `#071d3a` + University Gold `#b8861b`, Playfair Display / Inter / Montserrat. Derived from the Stitch design system in `/Stitch`.

---

## What's built (Phase 1 — Foundation + Public site)

**Functional, database-backed** — not static demo files:

- Public marketing site: Home, About, Programs (filterable catalogue + detail pages), Admissions & Tuition, How Online Learning Works, Accreditation, Student Life, News & Insights (list + article), FAQ, Contact.
- **Apply Now** — full application form → saved to the database → **Stripe Checkout** for the application fee → success page with reference number. (Without Stripe keys it records the application and confirms directly.)
- **Request Info** — lead-capture form on multiple pages → `leads` table (feeds the future CRM pipeline).
- **Contact** form → `contact_messages` table.
- **Newsletter** signup (footer) → `newsletter_subscribers` table.
- **Login/logout** with hashed passwords & DB-backed sessions (the gateway for the LMS/CRM phases).
- Seeded data: 8 programs, news articles, FAQs, and an admin user.

## What's built (Phase 2 — Student LMS)

A working learning platform at **`/portal`** (sign in required):

- **Student dashboard** — enrolled courses with live progress bars, stats, and announcements.
- **Course catalogue** — browse courses and **enrol** with one click.
- **Course view** — modules & lessons, instructor, progress, and assessments.
- **Lessons** — reading/video/live content, lesson index sidebar, prev/next, and **Mark complete** which updates course progress in real time.
- **Quizzes** — take auto-graded quizzes; pass/fail against a pass mark; full **remediation & review** showing correct answers and explanations; retake supported. Attempts and answers are stored.
- **Certificates** — when a course hits 100%, the student can **claim a certificate** and open a **printable certificate** (Print / Save as PDF).
- **Profile** page.

Seeded for demo: 2 courses (with modules, lessons, a graded quiz), an instructor, announcements, and a demo student already enrolled.

> Demo student login: **student@gdcu.edu** / **Student!2026** (override with `SEED_STUDENT_EMAIL` / `SEED_STUDENT_PASSWORD`).

## What's built (Phase 3 — Staff CRM/Admin)

A working back-office at **`/admin`** (staff/admin only):

- **Dashboard** — live KPIs (new leads, open applications, students, unread messages), revenue collected vs outstanding, and the admissions pipeline by stage.
- **Leads** — searchable/filterable list, lead detail with a colour-coded status, **status updates** and a **notes timeline**. Public *Request Info* submissions land here automatically.
- **Applications** — list + detail with the full admissions pipeline (new → in review → interview → offer → accepted/declined). **Accepting an application auto-creates a student account** (with a one-time temporary password) and links it. Notes + fee status included.
- **Students directory** — searchable list with enrolment/certificate counts, and a student record showing courses, progress, certificates and invoices.
- **Faculty** — faculty list with the courses each teaches.
- **Finance** — collected/outstanding/overdue totals, an invoices table, **raise a new invoice**, and **mark invoices paid** (supports tuition instalments).
- **Messages** — contact-form inbox with reply + handled toggle.

> Staff login: **staff@gdcu.edu** / **Staff!2026** · Admin: **admin@gdcu.edu** / **ChangeMe!2026**

The three products share one database, so data flows end-to-end: a website enquiry → CRM lead → application → **accepted creates an LMS student** → tuition invoices in Finance.

## What's built (Phase 4 — In-admin Content Management)

Staff can now manage all site & learning content from **`/admin/content`** — no code needed:

- **Programs** — create/edit/delete, with auto slugs, featured/published toggles; changes appear live on the public site instantly.
- **Courses** — create/edit/delete, plus a **curriculum builder**: add/remove **modules** and **lessons** (reading/video/live, duration, HTML content, video URL) inline on the course edit page.
- **News** — full article editor (create/edit/delete, publish toggle); live on `/news`.
- **FAQs** — add/edit/delete with categories and ordering; live on `/faq`.

All changes are written to the same database the public site and LMS read from, so editing is immediate.

## What's built (Phase 5 — Student Billing & Online Payments)

Students can now view and pay their tuition online, closing the finance loop:

- **Billing & Payments** page in the student portal (`/portal/billing`) — outstanding balance, all invoices with status, and overdue flagging.
- **Pay Now** → **Stripe Checkout** for an individual invoice; on success the webhook marks it paid. Without Stripe keys (local dev) it records the payment directly so the flow is testable.
- **Outstanding-balance banner** on the student dashboard linking to billing.
- The Stripe webhook now reconciles **both** application fees and invoice payments (via `metadata.kind`).
- Payments made by a student appear immediately as **paid** in the staff **Finance** ledger (one shared ledger).
- Ownership-enforced: a student can only pay their own invoices.

## What's built (Phase 6 — User & Staff Administration)

Admins can manage people and communications from the CRM:

- **Staff & Users** (`/admin/users`, **admin-only**) — list/filter/search all accounts; **create faculty, staff or admin users**; edit name/role/status; **reset passwords**; **activate/deactivate** accounts. Deactivated users cannot log in. Self-lockout protection: an admin cannot deactivate or demote their own account.
- New faculty immediately become selectable as **course instructors** (in the content course editor) and appear on the **Faculty** page.
- **Announcements** (`/admin/content/announcements`) — post **global** or **course-specific** announcements; they appear instantly on the relevant **student dashboards**. Edit/delete supported.
- Role-based access enforced: user management is admin-only (staff get 403); the nav item is hidden from non-admins.

## What's built (Phase 7 — Faculty Portal, Events & Library)

Three more Stitch-designed areas, fully functional:

- **Faculty Teaching Portal** (`/faculty`, faculty/admin) — faculty log in to their own portal: dashboard of taught courses with student counts and average progress; a combined **My Students** roster; per-course **gradebook** (each student's progress + best quiz scores, pass/fail coloured); and the ability to **post course announcements** that appear on enrolled students' dashboards. New faculty added in the CRM are assignable as instructors and immediately get their portal.
- **Events & Campus Hub** — public **/events** calendar + event detail; **admin CRUD** (Content → Events); a student **portal events** page with **RSVP** and a Join link for online events.
- **Library / Resources** — **admin CRUD** (Content → Library) for documents, links, videos, books and journals (optionally tied to a course); a searchable, type-filterable **student library** in the portal.

Logins now route by role: **student → /portal**, **faculty → /faculty**, **staff/admin → /admin**.

> Faculty demo login: **dr.makori@gdcu.edu** / **Faculty!2026**

## What's built (Phase 8 — CRM enhancements)

- **Staff can now manage users** (the earlier blocker): staff may create/edit **faculty and student** accounts; only admins can create/edit staff/admin accounts. "Staff & Users" is in the staff nav, and the Faculty page has an **Add faculty member** button.
- **Follow-up tasks** — add due-dated, assignable tasks to any lead or application; complete them with one click; a **"My follow-ups"** widget on the dashboard surfaces open tasks (overdue flagged).
- **Lead → Application conversion** — one click turns a lead into an application (carrying over details), marks the lead *converted*, and links the two.
- **Lead assignment** — assign leads to staff, with **My leads / Unassigned** filters and an owner column.
- **CSV export** — download leads and applications as CSV.
- **Dashboard analytics** — lead→application **conversion funnel**, **leads by source**, plus the existing pipeline and revenue widgets.

## What's built (Phase 9 — more Stitch features)

- **Faculty Quiz Builder** — faculty create quizzes on their courses and add questions (multiple-choice, mark the correct option, optional explanation); students can then take them and they feed the gradebook.
- **Support Helpdesk** — students raise tickets (category/priority) and message back-and-forth in the portal; staff manage, reply and set status in the CRM (Operations → Support).
- **Student Performance Analytics** — a portal "My Performance" page: average progress, courses completed, average quiz score, quizzes passed, per-course progress bars and quiz results.
- **Scholarships** — public listing + detail pages, with full **admin CRUD** (Content → Scholarships).
- **Careers / Join GDCU** — public openings list + detail with an **apply form**; admin manages positions and views applicants (Content → Careers).

## What's built (Phase 10 — scheduling & analytics)

- **Admissions Interview Scheduler** — schedule interviews on an application (date/time, online/in-person, link, interviewer); scheduling auto-advances the application to the *interview* stage. A CRM **Interviews** list shows all upcoming interviews with status updates.
- **Faculty Office Hours & Mentorship** — faculty publish availability slots (time, mode, capacity, topic); students browse and **book** them in the portal (with cancel), and faculty see who booked.
- **Transcripts** — students generate a printable **academic transcript** (courses, credits, best quiz score, status, total credits earned).
- **Executive Analytics** (admin-only) — applications by country and programme, enrolments by course, acceptance rate, and a finance snapshot.

### Stitch pages still available to build (mostly back-office/governance)
Diaspora sponsorship link generator, research-grant application + funding manager, faculty payroll, institutional budget/governance/legal repository, alumni network/marketplace, graduation/commencement hub, institutional archives, smart-notification automation, regional applicant hubs.

## What's built (Phase 11 — full CRUD across the CRM)

Every operational CRM record can now be edited, archived and/or deleted:

- **Leads** — edit all fields, **archive/restore** (with an Archived view), and delete. Lists hide archived by default.
- **Applications** — edit all fields, archive/restore, delete.
- **Invoices** — edit (amount/description/due/status), **void**, and delete.
- **Notes**, **follow-up tasks**, **interviews**, **contact messages**, and **support tickets** — all deletable from their records.
- **Users** — edit, deactivate/reactivate (soft archive), reset password, and **hard delete** — with guards: you can't delete or demote your own account, and staff can only manage student/faculty accounts.

Destructive actions use confirm prompts; archiving is reversible and non-destructive.

## What's built (Phase 12 — advancement & community)

- **Diaspora Sponsorship** — staff generate a shareable sponsor link from a student's record (with optional target + appeal message); a public **sponsor page** shows a progress bar and takes contributions (Stripe Checkout when configured, otherwise recorded); contributions and totals appear on the student record.
- **Research Grants** — public application form (`/research-grants`); a CRM **grants manager** (list, detail, review notes, status: submitted → under review → awarded/declined, delete).
- **Alumni Network** — public `/alumni` page with mentor profiles + partner vacancies + a "join the network" form (submissions await admin approval); admin CRUD for alumni profiles.
- **Graduation / Commencement Hub** — student portal degree audit (credits earned vs required, per-course status), a 4-step commencement checklist, and **commencement registration** (ceremony, attendance, regalia size, guests); links to digital diplomas.

## Navigation (reorganized)

- **Public site** — grouped dropdown menus: **About** (About, Accreditation, Student Life, News, Events, Alumni), **Study** (Programs, How Online Learning Works, Scholarships, Research Grants), **Admissions** (Admissions & Tuition, Apply, FAQs), plus Careers and Contact. Mobile menu mirrors the groups.
- **CRM sidebar** — grouped: Dashboard/Analytics · **Admissions** (Leads, Applications, Interviews, Research Grants) · **People** (Students, Faculty, Staff & Users) · **Finance & Support** · **Content — Marketing** · **Content — Learning**.
- **Student portal sidebar** — sectioned: **Learning** · **Community** · **Milestones** · **Account**.

## What's built (Phase 13 — usability & more features)

- **Reliable record navigation** — every CRM list (applications, leads, students, support, interviews, grants) now opens records via **real links** (with an "Open" action), not JavaScript — so viewing/editing an applicant's full details always works.
- **Application documents** — staff attach and remove supporting document links (transcripts, references) on an application.
- **Global CRM search** — a search box in the admin header finds leads, applications and students by name, email or reference.
- **Knowledge Base** — public help articles at `/knowledge-base` (grouped by category, with view counts) and admin CRUD (Content → Knowledge Base).

## What's built (Phase 14 — finance & governance back-office, admin-only)

A new **Governance** section in the CRM (admin-only; staff are blocked and don't see it):

- **Payroll** — create faculty/staff pay entries (period, gross, deductions → net), mark paid, delete, with paid/pending totals.
- **Budget & Asset Allocation** — budget lines with allocated vs spent progress bars, inline editing, and allocated/spent/remaining totals.
- **Compliance & Board** — a policy/legal/compliance **document repository** (with review dates) and a **governance board** member list, both with add/remove.

## What's built (Phase 15 — LMS depth & interview self-scheduling)

- **Virtual classroom depth** — each lesson now has **Lesson Materials** (downloadable resources, managed by staff in the lesson editor), a **Community Discussion** (students & faculty comment), and private **My Notes** that save per student.
- **Live Webinars** — admin schedules webinars (presenter, time, join link, recording, resource pack); students get an upcoming/on-demand list, a webinar page with **Join / Watch recording**, the **Session Resource Pack**, and a **Questions Queue** they can post to and upvote.
- **Interview self-scheduling** — staff publish **interview availability slots** (interviewer, time, mode) and generate a per-applicant **booking link**; the applicant opens a public page, picks a mentor and time, and **confirms their interview** (which advances the application to the interview stage).

## Phase 16 — CRM sidebar & robustness

- The CRM sidebar is now **collapsible**: each section (Admissions, People, Finance & Support, Governance, Content) folds, and only the section containing the current page is expanded — no more scrolling a long list.
- **Lead → Application conversion** is hardened: it validates the program and owner references before inserting, so a lead pointing at a deleted programme or staff member can no longer error.

## Phase 17 — quick-view drawer

- Clicking a **lead** or **application** in the CRM opens a **slide-over drawer** to view and edit it without leaving the list: see all details, **change status**, **add notes**, **edit / archive / delete / convert** — status & note changes refresh the drawer in place; archive/delete/convert refresh the list.
- Progressive enhancement: the same links still open the **full record** page if JavaScript is unavailable, and "Full record" is always one click away inside the drawer.

## Phase 19 — assignments + whole-row drawer

- **Click anywhere on a lead/application row** to open the quick-view drawer (the whole row is now the trigger; the "Full record" link still works without JS).
- **LMS Assignments** — faculty create assignments on a course (title, instructions, due date, points); students **submit** text and/or a link; faculty **grade with feedback**; grades show on the student's course page and assignment page (and a graded assignment locks from resubmission).

## Phase 20 — drawers across the CRM

Whole-row quick-view drawers now cover **leads, applications, students, support tickets, grants**, and **interviews** (interview rows open the linked application). Each drawer shows the key details with inline quick actions (status/notes/replies/reviews) and a "Full record" link; destructive/convert actions refresh the list. Progressive enhancement keeps the full pages working without JS.

## Phase 21 — editability audit & fixes

Closed gaps where existing records weren't fully editable:
- **Applications** — the edit form now covers **every** field the full application collects (personal, address, education, experience, references, statement, etc.), not just the basics.
- **Faculty** — each faculty card now has **Edit / Manage account** links (→ user editor); adding faculty was already possible.
- **Students** — student detail has an **Edit account** link.
- **Governance** — policy/compliance **documents and board members are now editable** (inline edit mode), not just add/delete.
- **Payroll** — payroll entries are now **editable** (period, gross, deductions), in addition to create / mark-paid / delete.

## Phase 22 — Interview Availability upgrade

Interview slots are now fully manageable: **edit** any slot (interviewer, time, mode, capacity, location), **duplicate** to the next day, and delete. The page now shows **summary stats** (open / booked / total), a **status** badge per slot (Open / Full / Past), **who booked** each slot (linked to the application), a **capacity** field, and splits **upcoming vs past** slots. Capacity can't be set below the number already booked.

## Phase 23 — public detail-page polish

The event, scholarship and careers detail pages were rebuilt to a consistent, full-width **8/4 layout** (no more squashed narrow column): a richer left column (structured content — "what to expect" / eligibility + how-to-apply / why-join), a polished **sticky** sidebar card, and a closing CTA band so pages feel complete even when the content is short.

## Phase 24 — Notifications & Email engine (platform-wide)

- **In-app notifications** — a notification **bell with unread count** in the student, faculty and admin headers, a dropdown of recent items, a full notifications page, and mark-read / mark-all-read.
- **Transactional email** — a `mailer` that sends via **SMTP when configured** (set `SMTP_HOST` etc.) and otherwise **logs safely** to an outbox (dev-safe; `nodemailer` is optional/lazy-loaded). Branded HTML email shell.
- **Email outbox** — admin page (Operations → Email Outbox) listing every email with status (sent / logged / failed).
- **Wired into lifecycle events:** new application (→ staff notif + applicant confirmation email), application accepted (→ student welcome notif + email), interview booked (→ staff), invoice created (→ student), support ticket created/replied (→ both directions), announcements (→ enrolled/all students), assignment graded (→ student).

To enable real email delivery in production, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` and run `npm install nodemailer`.

## Phase 25 — ticket UX + application wizard

- **Support tickets:** replies now show a clear **"Sending… → Sent ✓"** state in the drawer; both staff and students can **edit their own messages** (with an "edited" marker); tickets can be **closed and reopened** from both the CRM and the student portal.
- **Application form:** rebuilt as a guided **multi-step wizard** (Personal → Contact → Programme → Education → Experience → Statement → References → Finish) with a progress bar and Back/Next, so it no longer looks cumbersome. Progress is **auto-saved to the browser** and **restored on return**, so applicants can leave half-way and resume (cleared automatically on submit).

## Phase 26 — complete interview scheduling system

End-to-end, across all three sides:
- **Applicant (front):** receives an **interview-invite email** with a self-scheduling link, picks a mentor + time, gets a **confirmation email**, can **add it to their calendar (.ics)**, and can **reschedule or cancel** their own booking.
- **Staff (CRM):** one-click **"Email interview invite"**, **schedule directly** or via the self-scheduling link, **reschedule** an interview, and **record an outcome** (recommend / hold / decline + 1–5 rating + notes) shown on the application; capacity-aware slots with status/booked-by.
- **Interviewer (faculty):** a **"My Interviews"** page listing upcoming & past interviews, join links, and the ability to **record outcomes**.
- Notifications fire to staff on book/cancel; emails are recorded in the outbox.

### Other future enhancements
- Media/image uploads, PDF receipts/transcripts, smart-notification automation, regional applicant micro-sites.

---

## Quick start (local development)

Requires **Node.js 18+**.

```bash
npm install
cp .env.example .env        # then edit if needed (defaults work for local dev)
npm run db:reset            # create tables + seed sample data (SQLite)
npm run dev                 # start with auto-reload  ->  http://localhost:3000
```

Local dev uses **SQLite** (`DB_CLIENT=sqlite`) — no database server needed. The file lives at `./data/gdcu.sqlite`.

Default admin login (created by the seed): **admin@gdcu.edu** / **ChangeMe!2026**
Override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars. **Change this in production.**

---

## Configuration (`.env`)

| Key | Purpose |
|-----|---------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP port (default 3000) |
| `APP_URL` | Public base URL — used for Stripe redirects |
| `SESSION_SECRET` | Long random string for signing session cookies |
| `DB_CLIENT` | `sqlite` (local) or `mysql` (Hostinger) |
| `SQLITE_FILE` | SQLite path (local only) |
| `MYSQL_*` | Host/port/user/password/database (production) |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `APPLICATION_FEE_AMOUNT` | Fee in smallest unit (e.g. `5000` = £50.00) |
| `APPLICATION_FEE_CURRENCY` | e.g. `gbp` |

If Stripe keys are left as `sk_test_xxx`, the app still works — applications are recorded without taking payment (handy for local dev).

---

## Stripe setup

1. Create an account at <https://dashboard.stripe.com> and copy your **Secret** and **Publishable** keys into `.env`.
2. Set `APPLICATION_FEE_AMOUNT` / `APPLICATION_FEE_CURRENCY`.
3. Add a webhook endpoint pointing to `https://YOUR_DOMAIN/webhooks/stripe`, subscribe to **`checkout.session.completed`**, and copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test locally with the Stripe CLI: `stripe listen --forward-to localhost:3000/webhooks/stripe`.

The webhook marks the application's fee as **paid** when checkout completes.

---

## Deploying to Hostinger (VPS / Cloud — Node.js)

1. **Create a MySQL database** in hPanel → *Databases* → note host, name, user, password.
2. **Upload the project** (git clone or SFTP). Do **not** upload `node_modules` or `.env`.
3. On the server:
   ```bash
   npm install --omit=dev
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   NODE_ENV=production
   APP_URL=https://yourdomain.com
   SESSION_SECRET=<long random string>
   DB_CLIENT=mysql
   MYSQL_HOST=localhost
   MYSQL_USER=...
   MYSQL_PASSWORD=...
   MYSQL_DATABASE=...
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. **Create the schema and seed:**
   ```bash
   npm run migrate
   npm run seed
   ```
   (The server also runs pending migrations automatically on boot.)
5. **Run the app under a process manager** so it stays up and restarts on reboot:
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name gdcu
   pm2 save && pm2 startup
   ```
6. **Reverse proxy / domain:** point your domain to the server and proxy port `3000` (Hostinger's Node.js app setup or an Nginx reverse proxy with SSL). Ensure HTTPS is enabled — session cookies are `secure` in production.

### Hostinger shared hosting note
If you are on **shared hosting** (no Node.js), this app needs the **VPS or Cloud** plan. Shared hosting only runs PHP — switching to that would require a PHP rewrite.

---

## Project structure

```
src/
  app.js            Express app (security, sessions, routes, error handling)
  server.js         Boots the server, runs migrations
  config/db.js      Shared Knex instance
  lib/              helpers, Stripe client
  middleware/       locals (view globals), auth guards
  routes/           public, programs, admissions, news, contact, auth, stripeWebhook
  db/
    migrations/     schema (Knex — works on SQLite & MySQL)
    seeds/          programs, news, FAQs, admin user
views/
  layouts/          base + auth layouts
  partials/         head (Tailwind theme), nav, footer, flash, page-hero, request-info
  public/           all marketing pages
  auth/             login
  errors/           404, 500, 403
public/             static assets (favicon, future CSS/JS/images)
Stitch/             original design reference (not served)
```

## NPM scripts
- `npm run dev` — dev server with reload
- `npm start` — production start
- `npm run migrate` / `migrate:rollback` — schema
- `npm run seed` — sample data
- `npm run db:reset` — rollback all + migrate + seed
