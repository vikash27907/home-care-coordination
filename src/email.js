/**
 * Email Utility Module
 * Handles sending verification and password reset emails
 */

require('dotenv').config();
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

// Email configuration
const FROM_EMAIL = "support@prishahomecare.com";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const ADMIN_NOTIFICATION_EMAIL = "prishahomecare@gmail.com";

/**
 * Send verification email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} token - Verification token
 */
async function sendVerificationEmail(email, name, token) {
  const verificationUrl = `${APP_URL}/verify-email/${token}`;
  
  const mailOptions = {
    from: `"Prisha Home Care" <${FROM_EMAIL}>`,
    to: email,
    subject: "Email Verification - Prisha Home Care",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px;">
          <h1 style="color: white; margin: 0;">Prisha Home Care</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hello ${name},</h2>
          <p style="color: #666; font-size: 16px;">Thank you for registering with Prisha Home Care. Please verify your email address to activate your account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #999; font-size: 14px;">Or copy and paste this link in your browser:</p>
          <p style="color: #667eea; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
          <p style="color: #999; font-size: 14px;">This link will expire in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">If you did not create this account, please ignore this email.</p>
        </div>
      </div>
    `
  };
  
  return sendMail(mailOptions);
}

/**
 * Send password reset OTP email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} otp - 6-digit reset OTP
 */
async function sendResetPasswordEmail(email, name, otp) {
  const mailOptions = {
    from: `"Prisha Home Care" <${FROM_EMAIL}>`,
    to: email,
    subject: "Password Reset OTP - Prisha Home Care",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px;">
          <h1 style="color: white; margin: 0;">Prisha Home Care</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hello ${name},</h2>
          <p style="color: #666; font-size: 16px;">We received a request to reset your password. Use this 6-digit OTP to continue:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: white; border-radius: 10px; padding: 16px 22px; display: inline-block;">
              <span style="font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #1f2937;">${otp}</span>
            </div>
          </div>
          <p style="color: #999; font-size: 14px;">This OTP expires in 10 minutes.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">If you did not request a password reset, please ignore this email and secure your account.</p>
        </div>
      </div>
    `
  };
  
  return sendMail(mailOptions);
}

/**
 * Send concern notification to admin
 * @param {string} adminEmail - Admin email
 * @param {object} concern - Concern object
 */
async function sendConcernNotification(adminEmail, concern) {
  const mailOptions = {
    from: `"Prisha Home Care System" <${FROM_EMAIL}>`,
    to: adminEmail,
    subject: `🔔 New Concern: ${concern.subject}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #ff6b6b; padding: 20px; border-radius: 10px;">
          <h2 style="color: white; margin: 0;">🔔 New Concern Received</h2>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">User:</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${concern.userName} (${concern.role})</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Category:</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${concern.category}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Subject:</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${concern.subject}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">Date:</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${new Date(concern.createdAt).toLocaleString()}</td>
            </tr>
          </table>
          <div style="margin-top: 20px; padding: 15px; background: white; border-radius: 5px;">
            <strong>Message:</strong><br>
            <p style="color: #666;">${concern.message}</p>
          </div>
          <div style="margin-top: 20px; text-align: center;">
            <a href="${APP_URL}/admin/concerns" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View in Admin Panel</a>
          </div>
        </div>
      </div>
    `
  };
  
  return sendMail(mailOptions);
}

/**
 * Generic mail sending function
 */
async function sendMail(mailOptions) {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const { data, error } = await resend.emails.send({
      from: mailOptions.from || FROM_EMAIL,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text
    });

    if (error) {
      throw new Error(error.message || "Resend API error");
    }

    console.log("Email sent via Resend:", data && data.id ? data.id : "unknown-id");
    return {
      success: true,
      messageId: data && data.id ? data.id : null
    };
  } catch (error) {
    console.error("Resend email error:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send request confirmation email to user
 * @param {string} userEmail - Recipient email
 * @param {string} userName - Recipient name
 * @param {string} referenceId - Generated request reference ID
 * @param {object} requestDetails - Request details object
 */
async function sendRequestConfirmationEmail(userEmail, userName, referenceId, requestDetails = {}) {
  const serviceType = String(requestDetails.serviceType || "").trim() || "Not specified";
  const city = String(requestDetails.city || "").trim() || "Not specified";
  const preferredDate = String(requestDetails.preferredDate || "").trim();
  const phone = String(requestDetails.phone || "").trim() || "Not specified";
  const patientCondition = String(requestDetails.patientCondition || "").trim();

  const mailOptions = {
    from: `"Prisha Home Care" <${FROM_EMAIL}>`,
    to: userEmail,
    subject: `Your Care Request Confirmation \u2013 Ref ID: ${referenceId}`,
    text: [
      `Hello ${userName},`,
      "",
      "Your care request has been received successfully.",
      `Your Reference ID: ${referenceId}`,
      "Please quote this ID for any future communication with Prisha Home Care.",
      "",
      "Submitted Details:",
      `\u2022 Service Type: ${serviceType}`,
      `\u2022 City: ${city}`,
      `\u2022 Preferred Date: ${preferredDate || "Not provided"}`,
      `\u2022 Phone Number: ${phone}`,
      `\u2022 Patient Condition: ${patientCondition || "Not provided"}`,
      "",
      "In case of any urgent queries, please contact:",
      "Email: prishahomecare@gmail.com",
      "Phone: +91 9138913355"
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px;">
          <h1 style="color: white; margin: 0;">Prisha Home Care</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hello ${userName},</h2>
          <p style="color: #666; font-size: 16px;">Your care request has been received successfully.</p>

          <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; color: #1f2937; font-size: 14px;">Your Reference ID</p>
            <p style="margin: 0; font-size: 24px; letter-spacing: 1px; font-weight: 700; color: #1d4ed8;">${referenceId}</p>
          </div>

          <p style="color: #555; font-size: 14px;">Please quote this ID for any future communication with Prisha Home Care.</p>

          <div style="background: white; padding: 18px; border-radius: 10px; margin: 20px 0;">
            <h3 style="color: #333; margin: 0 0 10px;">Submitted Details</h3>
            <ul style="margin: 0; padding-left: 18px; color: #555; line-height: 1.8;">
              <li><strong>Service Type:</strong> ${serviceType}</li>
              <li><strong>City:</strong> ${city}</li>
              <li><strong>Preferred Date:</strong> ${preferredDate || "Not provided"}</li>
              <li><strong>Phone Number:</strong> ${phone}</li>
              <li><strong>Patient Condition:</strong> ${patientCondition || "Not provided"}</li>
            </ul>
          </div>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 22px 0;">
          <p style="margin: 0; color: #333; font-size: 14px; font-weight: 600;">In case of any urgent queries, please contact:</p>
          <p style="margin: 8px 0 0; color: #555; font-size: 14px;">Email: prishahomecare@gmail.com</p>
          <p style="margin: 4px 0 0; color: #555; font-size: 14px;">Phone: +91 9138913355</p>
        </div>
      </div>
    `
  };

  return sendMail(mailOptions);
}

/**
 * Send internal admin notification for new care request
 * @param {string} referenceId - Generated request reference ID
 * @param {object} requestDetails - Care request details
 */
async function sendAdminCareRequestNotification(referenceId, requestDetails = {}) {
  const fullName = String(requestDetails.fullName || "").trim() || "Not provided";
  const email = String(requestDetails.email || "").trim() || "Not provided";
  const phone = String(requestDetails.phone || "").trim() || "Not provided";
  const city = String(requestDetails.city || "").trim() || "Not provided";
  const serviceType = String(requestDetails.serviceType || "").trim() || "Not provided";
  const preferredDate = String(requestDetails.preferredDate || "").trim() || "Not provided";
  const patientCondition = String(requestDetails.patientCondition || "").trim() || "Not provided";
  const budget = typeof requestDetails.budget === "number" && Number.isFinite(requestDetails.budget)
    ? requestDetails.budget
    : "Not provided";
  const duration = String(requestDetails.duration || "").trim() || "Not provided";

  const mailOptions = {
    from: `"Prisha Home Care System" <${FROM_EMAIL}>`,
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: `New Care Request Received \u2013 Ref ID: ${referenceId}`,
    text: [
      "Internal Notification: New care request received.",
      "",
      `Reference ID: ${referenceId}`,
      `Full Name: ${fullName}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `City: ${city}`,
      `Service Type: ${serviceType}`,
      `Preferred Date: ${preferredDate}`,
      `Patient Condition: ${patientCondition}`,
      `Budget: ${budget}`,
      `Duration: ${duration}`
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1f2937; color: #fff; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Internal Notification: New Care Request</h2>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px; padding: 20px; background: #ffffff;">
          <p style="margin: 0 0 12px;"><strong>Reference ID:</strong> ${referenceId}</p>
          <ul style="margin: 0; padding-left: 18px; line-height: 1.8; color: #374151;">
            <li><strong>Full Name:</strong> ${fullName}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Phone:</strong> ${phone}</li>
            <li><strong>City:</strong> ${city}</li>
            <li><strong>Service Type:</strong> ${serviceType}</li>
            <li><strong>Preferred Date:</strong> ${preferredDate}</li>
            <li><strong>Patient Condition:</strong> ${patientCondition}</li>
            <li><strong>Budget:</strong> ${budget}</li>
            <li><strong>Duration:</strong> ${duration}</li>
          </ul>
        </div>
      </div>
    `
  };

  return sendMail(mailOptions);
}

/**
 * Send internal admin notification for new nurse signup
 * @param {object} nurseDetails - Nurse profile details at signup
 */
async function sendAdminNurseSignupNotification(nurseDetails = {}) {
  const fullName = String(nurseDetails.fullName || "").trim() || "Not provided";
  const email = String(nurseDetails.email || "").trim() || "Not provided";
  const phone = String(nurseDetails.phone || "").trim() || "Not provided";
  const city = String(nurseDetails.city || "").trim() || "Not provided";
  const experienceYears = Number.isFinite(Number(nurseDetails.experienceYears))
    ? Number(nurseDetails.experienceYears)
    : 0;
  const experienceMonths = Number.isFinite(Number(nurseDetails.experienceMonths))
    ? Number(nurseDetails.experienceMonths)
    : 0;
  const skills = Array.isArray(nurseDetails.skills) && nurseDetails.skills.length > 0
    ? nurseDetails.skills.join(", ")
    : "Not provided";
  const availabilityStatus = String(nurseDetails.availabilityStatus || "").trim() || "Not provided";

  const mailOptions = {
    from: `"Prisha Home Care System" <${FROM_EMAIL}>`,
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: "New Nurse Signup \u2013 Action Required",
    text: [
      "Internal Notification: New nurse signup received.",
      "",
      `Full Name: ${fullName}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `City: ${city}`,
      `Experience: ${experienceYears} years, ${experienceMonths} months`,
      `Skills: ${skills}`,
      `Availability Status: ${availabilityStatus}`,
      "",
      "Please review and verify this nurse in the admin dashboard."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
        <div style="background: #1f2937; color: #fff; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Internal Notification: New Nurse Signup</h2>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px; padding: 20px; background: #ffffff;">
          <ul style="margin: 0; padding-left: 18px; line-height: 1.8; color: #374151;">
            <li><strong>Full Name:</strong> ${fullName}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Phone:</strong> ${phone}</li>
            <li><strong>City:</strong> ${city}</li>
            <li><strong>Experience:</strong> ${experienceYears} years, ${experienceMonths} months</li>
            <li><strong>Skills:</strong> ${skills}</li>
            <li><strong>Availability Status:</strong> ${availabilityStatus}</li>
          </ul>
          <p style="margin: 14px 0 0; color: #111827; font-weight: 600;">Please review and verify this nurse in the admin dashboard.</p>
        </div>
      </div>
    `
  };

  return sendMail(mailOptions);
}

/**
 * Send OTP verification email for nurse registration
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} otp - 4-digit OTP code
 */
async function sendVerificationOtpEmail(toEmail, name, otp) {
  console.log('Attempting to send email to:', toEmail);
  
  const mailOptions = {
    from: `"Prisha Home Care" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: "Your Verification OTP - Prisha Home Care",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px;">
          <h1 style="color: white; margin: 0;">Prisha Home Care</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hello ${name},</h2>
          <p style="color: #666; font-size: 16px;">Thank you for registering with Prisha Home Care. Please use the following OTP to verify your email address.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: white; padding: 20px; border-radius: 10px; display: inline-block;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #667eea;">${otp}</span>
            </div>
          </div>
          
          <p style="color: #999; font-size: 14px;">This OTP will expire in 10 minutes.</p>
          <p style="color: #999; font-size: 14px;">If you did not create this account, please ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          
          <p style="color: #999; font-size: 12px;">If you have any questions, please contact us at support@homecare.local or call +91 9138913355</p>
        </div>
      </div>
    `
  };
  
  return sendMail(mailOptions);
}

module.exports = {
  sendVerificationEmail,
  sendVerificationOtpEmail,
  sendResetPasswordEmail,
  sendConcernNotification,
  sendRequestConfirmationEmail,
  sendAdminCareRequestNotification,
  sendAdminNurseSignupNotification
};
