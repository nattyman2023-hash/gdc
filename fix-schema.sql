-- GDCU schema completion: create any missing supporting tables (empty)
USE `u514321141_gdcu`;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `entity_type` text NOT NULL,
  `entity_id` int NOT NULL,
  `actor_id` int NULL,
  `actor_name` varchar(255) NULL,
  `action` varchar(255) NOT NULL,
  `detail` varchar(255) NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `alumni_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `graduation_year` int NULL,
  `program` varchar(255) NULL,
  `role` varchar(255) NULL,
  `organisation` varchar(255) NULL,
  `country` varchar(255) NULL,
  `bio` text NULL,
  `is_mentor` tinyint(1) NOT NULL DEFAULT 0,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `course_id` int NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `author` varchar(255) NULL,
  `published_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `application_documents` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `application_id` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `url` varchar(255) NOT NULL,
  `uploaded_by` int NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `application_fees` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `application_id` int NOT NULL,
  `amount` int NOT NULL,
  `currency` varchar(255) NOT NULL DEFAULT 'gbp',
  `provider` varchar(255) NOT NULL DEFAULT 'stripe',
  `stripe_session_id` varchar(255) NULL,
  `stripe_payment_intent` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `applications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `program_id` int NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) NULL,
  `country` varchar(255) NULL,
  `date_of_birth` date NULL,
  `prior_education` varchar(255) NULL,
  `statement` text NULL,
  `intake` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'new',
  `payment_status` varchar(255) NOT NULL DEFAULT 'unpaid',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `student_user_id` int NULL,
  `assigned_to` int NULL,
  `archived` tinyint(1) NOT NULL DEFAULT 0,
  `interview_token` varchar(255) NULL,
  `title` varchar(255) NULL,
  `middle_name` varchar(255) NULL,
  `preferred_name` varchar(255) NULL,
  `gender` varchar(255) NULL,
  `nationality` varchar(255) NULL,
  `address_line1` varchar(255) NULL,
  `address_line2` varchar(255) NULL,
  `city` varchar(255) NULL,
  `region` varchar(255) NULL,
  `postal_code` varchar(255) NULL,
  `prev_institution` varchar(255) NULL,
  `prev_qualification` varchar(255) NULL,
  `prev_grade` varchar(255) NULL,
  `prev_year` varchar(255) NULL,
  `english_proficiency` varchar(255) NULL,
  `employment_status` varchar(255) NULL,
  `occupation` varchar(255) NULL,
  `employer` varchar(255) NULL,
  `church_involvement` text NULL,
  `ref1_name` varchar(255) NULL,
  `ref1_email` varchar(255) NULL,
  `ref1_relationship` varchar(255) NULL,
  `ref2_name` varchar(255) NULL,
  `ref2_email` varchar(255) NULL,
  `ref2_relationship` varchar(255) NULL,
  `how_heard` varchar(255) NULL,
  `sponsorship_interest` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `assignment_submissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `user_id` int NOT NULL,
  `body` text NULL,
  `url` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'submitted',
  `grade` int NULL,
  `feedback` text NULL,
  `submitted_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `graded_at` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `assignments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `course_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `instructions` text NULL,
  `due_date` date NULL,
  `max_points` int NOT NULL DEFAULT 100,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance_warnings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `stage` int NOT NULL,
  `sent_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `board_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `role` varchar(255) NULL,
  `bio` text NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_lines` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `fiscal_year` varchar(255) NOT NULL DEFAULT '2026',
  `category` varchar(255) NOT NULL,
  `description` varchar(255) NULL,
  `allocated` double NOT NULL DEFAULT 0,
  `spent` double NOT NULL DEFAULT 0,
  `currency` varchar(255) NOT NULL DEFAULT 'GBP',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `calendar_connections` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(255) NOT NULL DEFAULT 'google',
  `google_email` varchar(255) NULL,
  `access_token` text NULL,
  `refresh_token` text NULL,
  `expires_at` datetime NULL,
  `calendar_id` varchar(255) NULL DEFAULT 'primary',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `calendar_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `category` varchar(255) NOT NULL DEFAULT 'event',
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NULL,
  `all_day` tinyint(1) NOT NULL DEFAULT 1,
  `location` varchar(255) NULL,
  `audience` varchar(255) NOT NULL DEFAULT 'all',
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `certificates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `user_id` int NOT NULL,
  `course_id` int NULL,
  `title` varchar(255) NOT NULL,
  `issued_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chapel_attendance` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `student_id` int NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'present',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `chapel_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `theme` varchar(255) NULL,
  `speaker` varchar(255) NULL,
  `scripture` varchar(255) NULL,
  `starts_at` datetime NOT NULL,
  `join_url` varchar(255) NULL,
  `location` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'scheduled',
  `notes` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `subject` varchar(255) NULL,
  `message` text NOT NULL,
  `handled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crm_notes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `entity_type` text NOT NULL,
  `entity_id` int NOT NULL,
  `author_id` int NULL,
  `author_name` varchar(255) NULL,
  `body` text NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crm_tasks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `entity_type` text NOT NULL,
  `entity_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `due_date` date NULL,
  `assigned_to` int NULL,
  `created_by` int NULL,
  `done` tinyint(1) NOT NULL DEFAULT 0,
  `done_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `email_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `to_email` varchar(255) NOT NULL,
  `to_name` varchar(255) NULL,
  `subject` varchar(255) NOT NULL,
  `body` text NULL,
  `template` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'logged',
  `error` varchar(255) NULL,
  `related_type` varchar(255) NULL,
  `related_id` int NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `enrollments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `course_id` int NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `progress_pct` int NOT NULL DEFAULT 0,
  `enrolled_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `essay_submissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `module_id` int NOT NULL,
  `enrollment_id` int NOT NULL,
  `body` text NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'submitted',
  `score` int NULL,
  `feedback` text NULL,
  `submitted_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `graded_at` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `event_rsvps` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NULL,
  `description` text NULL,
  `location` varchar(255) NULL,
  `is_online` tinyint(1) NOT NULL DEFAULT 1,
  `join_url` varchar(255) NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NULL,
  `image_url` varchar(255) NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faculty_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(255) NULL,
  `phone` varchar(255) NULL,
  `specialism` varchar(255) NULL,
  `qualifications` varchar(255) NULL,
  `department` varchar(255) NULL,
  `bio` text NULL,
  `photo_url` varchar(255) NULL,
  `public_profile` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faqs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category` varchar(255) NOT NULL DEFAULT 'General',
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `formation_groups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text NULL,
  `facilitator_id` int NULL,
  `meeting_day` varchar(255) NOT NULL DEFAULT 'Tuesday',
  `meeting_time` varchar(255) NULL,
  `capacity` int NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `formation_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `student_id` int NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `governance_documents` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'Policy',
  `doc_type` varchar(255) NULL,
  `url` varchar(255) NOT NULL,
  `review_date` date NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `graduation_registrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `ceremony` varchar(255) NULL,
  `attending` tinyint(1) NOT NULL DEFAULT 1,
  `regalia_size` varchar(255) NULL,
  `guests` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `grant_applications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `institution` varchar(255) NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NULL,
  `summary` text NULL,
  `amount_requested` double NULL,
  `status` varchar(255) NOT NULL DEFAULT 'submitted',
  `review_notes` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `interview_slots` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `interviewer_id` int NULL,
  `starts_at` datetime NOT NULL,
  `mode` varchar(255) NOT NULL DEFAULT 'online',
  `location` varchar(255) NULL,
  `capacity` int NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `host_label` varchar(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `interviews` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `application_id` int NOT NULL,
  `interviewer_id` int NULL,
  `scheduled_at` datetime NOT NULL,
  `mode` varchar(255) NOT NULL DEFAULT 'online',
  `location` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'scheduled',
  `notes` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `slot_id` int NULL,
  `outcome` varchar(255) NOT NULL DEFAULT 'pending',
  `rating` int NULL,
  `outcome_notes` text NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `user_id` int NOT NULL,
  `program_id` int NULL,
  `description` varchar(255) NOT NULL,
  `amount` double NOT NULL,
  `currency` varchar(255) NOT NULL DEFAULT 'GBP',
  `due_date` date NULL,
  `installment_no` int NULL,
  `installment_total` int NULL,
  `status` varchar(255) NOT NULL DEFAULT 'sent',
  `payment_method` varchar(255) NULL,
  `paid_at` datetime NULL,
  `created_by` int NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `stripe_session_id` varchar(255) NULL,
  `stripe_payment_intent` varchar(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `job_applications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) NULL,
  `cover_note` text NULL,
  `cv_url` varchar(255) NULL,
  `status` varchar(255) NOT NULL DEFAULT 'new',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `job_openings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `department` varchar(255) NULL,
  `location` varchar(255) NULL,
  `type` varchar(255) NOT NULL DEFAULT 'Faculty',
  `summary` text NULL,
  `description` text NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `closes_on` date NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `kb_articles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'General',
  `excerpt` text NULL,
  `body` text NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `views` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leads` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) NULL,
  `country` varchar(255) NULL,
  `program_id` int NULL,
  `interest` varchar(255) NULL,
  `message` text NULL,
  `source` varchar(255) NOT NULL DEFAULT 'website',
  `status` varchar(255) NOT NULL DEFAULT 'new',
  `assigned_to` int NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `converted_application_id` int NULL,
  `archived` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `lesson_comments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `lesson_id` int NOT NULL,
  `user_id` int NULL,
  `author_name` varchar(255) NULL,
  `is_staff` tinyint(1) NOT NULL DEFAULT 0,
  `body` text NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `lesson_notes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `lesson_id` int NOT NULL,
  `user_id` int NOT NULL,
  `body` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `lesson_progress` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `enrollment_id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `completed` tinyint(1) NOT NULL DEFAULT 0,
  `completed_at` datetime NULL,
  `drip_feed_start` datetime NULL,
  `available_until` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `login_events` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `news_posts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `category` varchar(255) NULL,
  `excerpt` text NULL,
  `body` text NULL,
  `author` varchar(255) NULL,
  `image_url` varchar(255) NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `published_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `confirmed` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `type` varchar(255) NOT NULL DEFAULT 'info',
  `title` varchar(255) NOT NULL,
  `body` varchar(255) NULL,
  `link` varchar(255) NULL,
  `read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `office_hour_bookings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slot_id` int NOT NULL,
  `user_id` int NOT NULL,
  `note` text NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `office_hour_slots` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `faculty_id` int NOT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NULL,
  `mode` varchar(255) NOT NULL DEFAULT 'online',
  `join_url` varchar(255) NULL,
  `capacity` int NOT NULL DEFAULT 1,
  `topic` varchar(255) NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `open_day_registrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `open_day_id` int NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) NULL,
  `country` varchar(255) NULL,
  `interest` varchar(255) NULL,
  `message` text NULL,
  `lead_id` int NULL,
  `attended` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `open_days` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NULL,
  `location` varchar(255) NULL,
  `is_online` tinyint(1) NOT NULL DEFAULT 1,
  `join_url` varchar(255) NULL,
  `capacity` int NULL,
  `published` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `period` varchar(255) NOT NULL,
  `gross` double NOT NULL DEFAULT 0,
  `deductions` double NOT NULL DEFAULT 0,
  `net` double NOT NULL DEFAULT 0,
  `currency` varchar(255) NOT NULL DEFAULT 'GBP',
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `notes` text NULL,
  `paid_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_answers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `attempt_id` int NOT NULL,
  `question_id` int NOT NULL,
  `option_id` int NULL,
  `correct` tinyint(1) NOT NULL DEFAULT 0,
  `short_answer_text` text NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `quiz_attempts` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `quiz_id` int NOT NULL,
  `user_id` int NOT NULL,
  `score` int NOT NULL DEFAULT 0,
  `passed` tinyint(1) NOT NULL DEFAULT 0,
  `started_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `resources` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL DEFAULT 'link',
  `category` varchar(255) NULL,
  `description` text NULL,
  `url` varchar(255) NOT NULL,
  `author` varchar(255) NULL,
  `course_id` int NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `scholarships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `summary` text NULL,
  `description` text NULL,
  `award` varchar(255) NULL,
  `eligibility` text NULL,
  `deadline` date NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sponsorship_contributions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `sponsorship_id` int NOT NULL,
  `sponsor_name` varchar(255) NOT NULL,
  `sponsor_email` varchar(255) NULL,
  `amount` double NOT NULL,
  `message` text NULL,
  `status` varchar(255) NOT NULL DEFAULT 'pledged',
  `stripe_session_id` varchar(255) NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sponsorships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `token` varchar(255) NOT NULL,
  `student_id` int NOT NULL,
  `target_amount` double NULL,
  `currency` varchar(255) NOT NULL DEFAULT 'GBP',
  `message` text NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` int NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `staff_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `job_title` varchar(255) NULL,
  `department` varchar(255) NULL,
  `phone` varchar(255) NULL,
  `bio` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `phone` varchar(255) NULL,
  `date_of_birth` date NULL,
  `country` varchar(255) NULL,
  `nationality` varchar(255) NULL,
  `address` varchar(255) NULL,
  `program_id` int NULL,
  `intake` varchar(255) NULL,
  `year_of_study` int NULL,
  `student_ref` varchar(255) NULL,
  `emergency_name` varchar(255) NULL,
  `emergency_phone` varchar(255) NULL,
  `bio` text NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `support_tickets` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(255) NOT NULL,
  `user_id` int NULL,
  `subject` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL DEFAULT 'General',
  `priority` varchar(255) NOT NULL DEFAULT 'normal',
  `status` varchar(255) NOT NULL DEFAULT 'open',
  `assigned_to` int NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ticket_replies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `author_id` int NULL,
  `author_name` varchar(255) NULL,
  `is_staff` tinyint(1) NOT NULL DEFAULT 0,
  `body` text NOT NULL,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` datetime NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `webinar_questions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `webinar_id` int NOT NULL,
  `user_id` int NULL,
  `author_name` varchar(255) NULL,
  `body` text NOT NULL,
  `upvotes` int NOT NULL DEFAULT 0,
  `answered` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `webinars` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `presenter` varchar(255) NULL,
  `description` text NULL,
  `course_id` int NULL,
  `starts_at` datetime NOT NULL,
  `join_url` varchar(255) NULL,
  `recording_url` varchar(255) NULL,
  `resources` text NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ensure users.phone exists (added by a later migration that may not have applied)
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone');
SET @s := IF(@c = 0, 'ALTER TABLE `users` ADD COLUMN `phone` varchar(255) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
