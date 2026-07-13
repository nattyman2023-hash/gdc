/**
 * Email Template Builder for Global Diaspora Christian University.
 * Provides professional, warm HTML email templates for all transactional emails.
 * Uses placeholder replacement: {{firstName}}, {{programmeName}}, etc.
 * Templates have a Christian/Pentecostal tone suitable for a faith-based university.
 *
 * @todo Replace the APP_URL, supportEmail placeholders with actual env values
 *       once EMAILIT_API_KEY is configured.
 */

const APP_URL = process.env.APP_URL || 'https://gdcu.edu';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'admin@gdc.university';

/**
 * Build the HTML email shell (branded wrapper).
 */
function shell(heading, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body{margin:0;padding:0;font-family:'Inter',Arial,Helvetica,sans-serif;background:#f0eee8;color:#1c1c18;}
  .container{max-width:560px;margin:24px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);}
  .header{background:#071d3a;color:#ffffff;padding:24px 28px;text-align:center;}
  .header h1{margin:0;font-size:18px;font-weight:700;letter-spacing:.02em;}
  .body{padding:28px;font-size:15px;line-height:1.6;color:#1c1c18;}
  .body h2{margin:0 0 16px;font-size:20px;color:#071d3a;font-weight:600;}
  .body p{margin:0 0 14px;}
  .btn{display:inline-block;background:#071d3a;color:#ffffff;padding:13px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;margin:8px 0 16px;}
  .btn:hover{opacity:.9;}
  .btn-gold{background:#b8861b;}
  .footer{background:#f8f6f0;padding:20px 28px;font-size:12px;color:#74777e;text-align:center;border-top:1px solid #e5e2dc;}
  .footer a{color:#071d3a;text-decoration:underline;}
  .divider{height:1px;background:#e5e2dc;margin:20px 0;}
  .verse{font-style:italic;color:#b8861b;font-size:14px;text-align:center;margin:16px 0;}
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🕊 Global Diaspora Christian University</h1>
    </div>
    <div class="body">
      <h2>${heading}</h2>
      ${bodyContent}
      <div class="verse">"For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future." — Jeremiah 29:11</div>
    </div>
    <div class="footer">
      <p>Global Diaspora Christian University &bull; Educate &bull; Equip &bull; Empower &bull; Impact the World</p>
      <p style="margin-top:8px">
        <a href="${APP_URL}">${APP_URL}</a> &bull;
        <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      </p>
      <p style="margin-top:8px">This email was sent to you as part of your GDCU journey.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Replace placeholders in a template string.
 * Supported: firstName, lastName, programmeName, applicationId, status,
 *            loginUrl, paymentUrl, supportEmail, deadline, moduleName,
 *            courseName, amount, score, passwordResetLink, verificationLink
 */
function fill(template, vars = {}) {
  const defaults = {
    supportEmail: SUPPORT_EMAIL,
    loginUrl: `${APP_URL}/login`,
    appUrl: APP_URL,
  };
  const merged = { ...defaults, ...vars };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => merged[key] || `{{${key}}}`);
}

// ─── APPLICATION EMAILS ───────────────────────────────────────

function applicationStarted(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Thank you for beginning your application to study at <strong>Global Diaspora Christian University</strong>. We are excited that you are taking this step towards your calling.</p>
    <p>Your application is in progress. You can return to complete it at any time using the link below:</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Continue Your Application</a></p>
    <p>If you need any assistance or have questions about the process, please do not hesitate to contact our Admissions Team at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>May God guide you as you pursue this next chapter.</p>
    <p>In faith,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Application Started', fill(body, vars));
}

function applicationSubmitted(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We are pleased to confirm that we have received your application to study <strong>{{programmeName}}</strong> at Global Diaspora Christian University (Application ID: <strong>{{applicationId}}</strong>).</p>
    <p>Your application is now being reviewed by our Admissions Team. You will receive an update once the review process is complete.</p>
    <p>In the meantime, we encourage you to:</p>
    <ul>
      <li>Check your email regularly for updates from our team</li>
      <li>Ensure all required documents have been submitted</li>
      <li>Contact us if your circumstances change</li>
    </ul>
    <p>We are praying for you as you take this important step in your educational journey.</p>
    <p>Blessings,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Application Submitted Successfully', fill(body, vars));
}

function applicationReceived(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>This email serves as official confirmation that your application to <strong>{{programmeName}}</strong> (ID: <strong>{{applicationId}}</strong>) has been received by Global Diaspora Christian University.</p>
    <p><strong>What happens next?</strong></p>
    <ol>
      <li>Our Admissions Team will review your application carefully.</li>
      <li>We may contact you if any additional information or documents are needed.</li>
      <li>You will receive a decision via email within the stated processing time.</li>
    </ol>
    <p>Processing times vary by programme. If you have not heard from us within 10 working days, please reach out to <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>We are honoured that you have chosen to study with us.</p>
    <p>Yours in Christ,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Application Received', fill(body, vars));
}

function applicationUnderReview(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We want to let you know that your application to <strong>{{programmeName}}</strong> is now <strong>under review</strong>.</p>
    <p>Our Admissions Committee is carefully considering your application. This is an important step, and we want to ensure every application receives the prayerful attention it deserves.</p>
    <p>We will notify you as soon as a decision has been made. Rest assured, you will hear from us soon.</p>
    <p>In the meantime, please continue to check your email (including your spam folder) for updates.</p>
    <p>May the Lord direct your path as you await His guidance through this process.</p>
    <p>With prayer,<br><strong>GDCU Admissions Committee</strong></p>
  `;
  return shell('Application Under Review', fill(body, vars));
}

function applicationApproved(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p><strong>Congratulations! 🎉</strong></p>
    <p>We are delighted to inform you that your application to <strong>{{programmeName}}</strong> has been <strong>approved</strong>!</p>
    <p>We believe that God has a great purpose for your life, and we are honoured that you have chosen GDCU as part of that journey.</p>
    <p><strong>Your next steps:</strong></p>
    <ol>
      <li>Review your offer letter and terms of admission.</li>
      <li>Accept your offer by logging into your student portal.</li>
      <li>Complete your enrolment and registration.</li>
      <li>Arrange payment of tuition fees (payment plans are available).</li>
    </ol>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Accept Your Offer</a></p>
    <p>If you have any questions about the next steps, please contact our team at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>Welcome to the GDCU family! We are excited to see how God will use you.</p>
    <p>Celebrating with you,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Application Approved — Welcome to GDCU!', fill(body, vars));
}

function applicationConditionalOffer(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We are pleased to offer you a <strong>conditional place</strong> on the <strong>{{programmeName}}</strong> programme at Global Diaspora Christian University.</p>
    <p><strong>Conditions to be met:</strong></p>
    <p>Please refer to your offer letter (attached or available in your portal) for the specific conditions of your offer. These may include providing additional documentation, meeting academic requirements, or other criteria.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">View Your Offer</a></p>
    <p>Once you have fulfilled the conditions, your place will be confirmed and you can proceed with enrolment.</p>
    <p>We believe in your potential and are praying for you as you take these next steps. If you have any questions, please contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>Yours in faith,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Conditional Offer from GDCU', fill(body, vars));
}

function applicationRejected(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Thank you for the time and care you invested in your application to <strong>{{programmeName}}</strong> at Global Diaspora Christian University.</p>
    <p>After prayerful consideration, we regret to inform you that we are unable to offer you a place on this programme at this time.</p>
    <p>Please know that this decision does not diminish your value or calling. We encourage you to consider the following options:</p>
    <ul>
      <li>Explore other programmes at GDCU that may be a better fit</li>
      <li>Contact our Admissions Team for feedback on your application</li>
      <li>Consider reapplying in a future intake with additional preparation</li>
    </ul>
    <p>We are praying for God's continued guidance in your life and educational journey.</p>
    <p>With every blessing,<br><strong>GDCU Admissions Committee</strong></p>
  `;
  return shell('Update on Your Application', fill(body, vars));
}

function missingDocumentsReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We are writing to let you know that some documents are <strong>missing or incomplete</strong> in your application for <strong>{{programmeName}}</strong> (ID: {{applicationId}}).</p>
    <p><strong>Required documents:</strong></p>
    <p>Please log into your application portal to see which documents are needed and upload them as soon as possible.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Upload Documents</a></p>
    <p>Without these documents, we may not be able to process your application. Please submit them by {{deadline}} to avoid delays.</p>
    <p>If you need assistance gathering or submitting these documents, please contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>Thank you,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Missing Documents — Action Required', fill(body, vars));
}

function applicationAbandonedReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We noticed that you started an application to <strong>{{programmeName}}</strong> at Global Diaspora Christian University but have not yet completed it.</p>
    <p>We understand that life can be busy, and we want to make sure you have everything you need to finish your application. Your calling matters, and we are here to support you.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Complete Your Application</a></p>
    <p>If you have any questions or concerns about the application process, please don't hesitate to reach out to our team at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>. We would be happy to help.</p>
    <p>Take the next step in faith — we look forward to receiving your completed application.</p>
    <p>Warmly,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Did You Forget to Submit Your Application?', fill(body, vars));
}

// ─── ADMISSION EMAILS ────────────────────────────────────────

function admissionOfferSent(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We are thrilled to inform you that an official <strong>Admission Offer</strong> has been sent to you for the <strong>{{programmeName}}</strong> programme!</p>
    <p>Your offer includes full details about your programme, tuition fees, start date, and next steps.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">View Your Admission Offer</a></p>
    <p><strong>Important:</strong> Your offer has a deadline. Please review and respond by <strong>{{deadline}}</strong> to secure your place.</p>
    <p>We are praying for you as you discern this important decision.</p>
    <p>Congratulations,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Your GDCU Admission Offer Awaits', fill(body, vars));
}

function offerAccepted(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p><strong>Praise God! 🎉</strong></p>
    <p>We are overjoyed to confirm that you have accepted your offer to study <strong>{{programmeName}}</strong> at Global Diaspora Christian University.</p>
    <p>You are now officially part of the GDCU student body! We believe that God has great plans for your time with us.</p>
    <p><strong>What's next?</strong></p>
    <ol>
      <li>You will receive registration instructions shortly.</li>
      <li>Set up your student portal access.</li>
      <li>Review your course schedule and programme start date.</li>
      <li>Arrange tuition payment (payment plans are available).</li>
    </ol>
    <p>We cannot wait to see how you will grow academically and spiritually in this season.</p>
    <p>Welcome to the GDCU family!</p>
    <p>Celebrating with you,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Offer Accepted — Welcome to GDCU!', fill(body, vars));
}

function offerDeadlineReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>This is a gentle reminder that your admission offer for <strong>{{programmeName}}</strong> at Global Diaspora Christian University is still awaiting your response.</p>
    <p><strong>Offer deadline:</strong> {{deadline}}</p>
    <p>We would love to have you join us, but your place may be released to another applicant if we do not hear from you by the deadline.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Respond to Your Offer</a></p>
    <p>If you need more time or have questions, please contact our team at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>. We are here to help.</p>
    <p>Praying for clarity and peace as you make your decision,</p>
    <p>Warmly,<br><strong>GDCU Admissions Office</strong></p>
  `;
  return shell('Offer Deadline Reminder', fill(body, vars));
}

function registrationInstructions(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Welcome to Global Diaspora Christian University! We are excited to have you join us for <strong>{{programmeName}}</strong>.</p>
    <p><strong>Registration Instructions:</strong></p>
    <ol>
      <li>Log in to your student portal at <a href="{{loginUrl}}">{{loginUrl}}</a></li>
      <li>Complete your online registration form</li>
      <li>Upload your photo for your student ID</li>
      <li>Review and accept the student handbook</li>
      <li>Access your course materials and orientation</li>
      <li>Familiarise yourself with the academic calendar</li>
    </ol>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Complete Registration</a></p>
    <p>If you encounter any difficulties during registration, our support team is here to help at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>We are praying for a fruitful and transformative time of study ahead.</p>
    <p>Yours in Christ,<br><strong>GDCU Student Services</strong></p>
  `;
  return shell('Registration Instructions', fill(body, vars));
}

function paymentRequest(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Thank you for registering for <strong>{{programmeName}}</strong> at Global Diaspora Christian University.</p>
    <p>To complete your enrolment, please arrange payment of your tuition fees. Below are the details:</p>
    <p><strong>Amount due:</strong> {{amount}}<br>
    <strong>Reference:</strong> {{applicationId}}</p>
    <p>We offer flexible payment plans to make your education affordable. Please contact our Finance Team for more information.</p>
    <p style="text-align:center"><a href="{{paymentUrl}}" class="btn btn-gold">Make a Payment</a></p>
    <p>If you have any questions about fees or payment options, please contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>Thank you for investing in your education and calling.</p>
    <p>Blessings,<br><strong>GDCU Finance Office</strong></p>
  `;
  return shell('Tuition Payment Request', fill(body, vars));
}

function paymentConfirmation(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p><strong>Payment Confirmed ✓</strong></p>
    <p>We have received your payment of <strong>{{amount}}</strong> for <strong>{{programmeName}}</strong> (Reference: {{applicationId}}).</p>
    <p>Your enrolment is now complete. You can access your courses and all student resources through your portal.</p>
    <p><strong>What you can do now:</strong></p>
    <ul>
      <li>Access your online courses</li>
      <li>Meet your instructors and classmates</li>
      <li>Review your programme schedule</li>
      <li>Explore student services and support</li>
    </ul>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Go to Your Portal</a></p>
    <p>Thank you for entrusting GDCU with your education. We are committed to supporting you every step of the way.</p>
    <p>With gratitude,<br><strong>GDCU Finance Office</strong></p>
  `;
  return shell('Payment Confirmed', fill(body, vars));
}

function studentAccountCreated(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Your <strong>GDCU Student Account</strong> has been created successfully!</p>
    <p>You can now log in to your student portal to access your courses, connect with classmates, and manage your studies.</p>
    <p><strong>Your portal credentials:</strong></p>
    <p>Login URL: <a href="{{loginUrl}}">{{loginUrl}}</a></p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Access Your Portal</a></p>
    <p>We recommend that you log in as soon as possible to familiarise yourself with the platform and complete your profile.</p>
    <p>Welcome once again to the GDCU community. We are praying for a blessed and transformative journey ahead.</p>
    <p>In His service,<br><strong>GDCU Student Services</strong></p>
  `;
  return shell('Your GDCU Student Account', fill(body, vars));
}

function welcomeToProgramme(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p><strong>Welcome to {{programmeName}}!</strong> 🎓</p>
    <p>We are delighted to officially welcome you as a student of Global Diaspora Christian University. You have joined a community of believers from across the world who are being equipped to fulfil their calling.</p>
    <p><strong>Here are some things to help you get started:</strong></p>
    <ul>
      <li>Explore your programme curriculum and module schedule</li>
      <li>Introduce yourself to your instructors and classmates</li>
      <li>Review the student handbook for policies and guidelines</li>
      <li>Familiarise yourself with the academic calendar</li>
      <li>Set up your study space and schedule</li>
    </ul>
    <p>Remember, you are not alone on this journey. Our faculty, staff, and fellow students are here to support, encourage, and pray with you.</p>
    <p>"Let us not become weary in doing good, for at the proper time we will reap a harvest if we do not give up." — Galatians 6:9</p>
    <p>Let the journey begin!</p>
    <p>With excitement and prayer,<br><strong>GDCU Faculty & Staff</strong></p>
  `;
  return shell('Welcome to Your Programme!', fill(body, vars));
}

// ─── STUDENT LIFECYCLE EMAILS ────────────────────────────────

function courseEnrolmentConfirmation(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>You have been successfully enrolled in <strong>{{courseName}}</strong> as part of your <strong>{{programmeName}}</strong> programme.</p>
    <p>Your course materials are now available in your student portal.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Access Your Course</a></p>
    <p>We pray that this course enriches your knowledge, strengthens your faith, and equips you for greater service.</p>
    <p>Blessings,<br><strong>GDCU Academic Office</strong></p>
  `;
  return shell('Course Enrolment Confirmed', fill(body, vars));
}

function programmeStartReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>Your <strong>{{programmeName}}</strong> programme begins on <strong>{{deadline}}</strong>! We are looking forward to seeing you in class.</p>
    <p><strong>Before the programme starts, please ensure you:</strong></p>
    <ul>
      <li>Have logged into your student portal</li>
      <li>Reviewed your course schedule and materials</li>
      <li>Completed any pre-programme orientation</li>
      <li>Tested your device and internet connection</li>
      <li>Noted key dates in your calendar</li>
    </ul>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Prepare for Your Programme</a></p>
    <p>We are praying for a powerful and transformative learning experience for you.</p>
    <p>Excited for you,<br><strong>GDCU Academic Office</strong></p>
  `;
  return shell('Your Programme Starts Soon!', fill(body, vars));
}

function moduleAccessAvailable(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>A new module — <strong>{{moduleName}}</strong> — is now available for you in your <strong>{{programmeName}}</strong> programme.</p>
    <p>You can access the module materials, lessons, and assignments through your student portal.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Access Module</a></p>
    <p>We encourage you to stay on track with your studies and reach out if you need any support.</p>
    <p>Keep pressing forward in faith!</p>
    <p>Warmly,<br><strong>GDCU Academic Office</strong></p>
  `;
  return shell('New Module Available', fill(body, vars));
}

function assignmentDeadlineReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>This is a reminder that you have an assignment approaching its deadline for <strong>{{courseName}}</strong>.</p>
    <p><strong>Assignment:</strong> {{moduleName}}<br>
    <strong>Deadline:</strong> {{deadline}}</p>
    <p>We encourage you to submit your work on time. If you are facing challenges, please contact your instructor or our student support team.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn btn-gold">Submit Assignment</a></p>
    <p>"Whatever you do, work at it with all your heart, as working for the Lord." — Colossians 3:23</p>
    <p>We believe in you!</p>
    <p>Your success team,<br><strong>GDCU Faculty</strong></p>
  `;
  return shell('Assignment Deadline Reminder', fill(body, vars));
}

function paymentOverdueReminder(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We are writing to let you know that your tuition payment is now <strong>overdue</strong> for <strong>{{programmeName}}</strong>.</p>
    <p><strong>Amount overdue:</strong> {{amount}}</p>
    <p>To avoid any disruption to your studies, please arrange payment as soon as possible. If you are experiencing financial difficulty, we encourage you to contact our Finance Team to discuss a payment plan.</p>
    <p style="text-align:center"><a href="{{paymentUrl}}" class="btn btn-gold">Make a Payment</a></p>
    <p>We are committed to supporting you and finding a solution that works for you. Please reach out to <a href="mailto:{{supportEmail}}">{{supportEmail}}</a> to discuss your situation.</p>
    <p>Thank you for your attention to this matter.</p>
    <p>In His service,<br><strong>GDCU Finance Office</strong></p>
  `;
  return shell('Payment Overdue — Action Needed', fill(body, vars));
}

function generalStudentAnnouncement(vars) {
  const body = `
    <p>Dear GDCU Students,</p>
    <p>{{message}}</p>
    <p>For more details, please visit your student portal or contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>May God continue to bless and guide your studies.</p>
    <p>Warmly,<br><strong>GDCU Administration</strong></p>
  `;
  return shell('Important Announcement', fill(body, vars));
}

function accountPasswordReset(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We received a request to reset your GDCU account password. Click the button below to choose a new one:</p>
    <p style="text-align:center"><a href="{{passwordResetLink}}" class="btn">Reset Your Password</a></p>
    <p><strong>This link expires in 1 hour.</strong></p>
    <p>If you didn't request this, you can safely ignore this email — your password will not be changed.</p>
    <p>If you need further assistance, contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p>Yours,<br><strong>GDCU Support Team</strong></p>
  `;
  return shell('Password Reset Request', fill(body, vars));
}

function loginSecurityNotification(vars) {
  const body = `
    <p>Dear {{firstName}},</p>
    <p>We noticed a new sign-in to your GDCU account.</p>
    <p><strong>Details:</strong></p>
    <p>If this was you, no further action is needed. If you do not recognise this activity, please reset your password immediately and contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
    <p style="text-align:center"><a href="{{loginUrl}}" class="btn">Review Account Activity</a></p>
    <p>Protecting your data is important to us. Please enable two-factor authentication for added security if available.</p>
    <p>Stay safe,<br><strong>GDCU Security Team</strong></p>
  `;
  return shell('Security Notification — New Sign-In', fill(body, vars));
}

module.exports = {
  // Application
  applicationStarted,
  applicationSubmitted,
  applicationReceived,
  applicationUnderReview,
  applicationApproved,
  applicationConditionalOffer,
  applicationRejected,
  missingDocumentsReminder,
  applicationAbandonedReminder,
  // Admission
  admissionOfferSent,
  offerAccepted,
  offerDeadlineReminder,
  registrationInstructions,
  paymentRequest,
  paymentConfirmation,
  studentAccountCreated,
  welcomeToProgramme,
  // Student lifecycle
  courseEnrolmentConfirmation,
  programmeStartReminder,
  moduleAccessAvailable,
  assignmentDeadlineReminder,
  paymentOverdueReminder,
  generalStudentAnnouncement,
  accountPasswordReset,
  loginSecurityNotification,
};
