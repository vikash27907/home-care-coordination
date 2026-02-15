/**
 * Email Utility Module
 * Handles sending verification and password reset emails
 */

const nodemailer = require("nodemailer");

// Email configuration
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@homecare.local";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  
  if (!SMTP_USER || !SMTP_PASS) {
    console.warn("Email credentials not configured. Emails will be logged only.");
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: null
    });
    return transporter;
  }
  
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  
  return transporter;
}

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
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} name - Recipient name
 * @param {string} token - Reset token
 */
async function sendResetPasswordEmail(email, name, token) {
  const resetUrl = `${APP_URL}/reset-password/${token}`;
  
  const mailOptions = {
    from: `"Prisha Home Care" <${FROM_EMAIL}>`,
    to: email,
    subject: "Password Reset - Prisha Home Care",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px;">
          <h1 style="color: white; margin: 0;">Prisha Home Care</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333;">Hello ${name},</h2>
          <p style="color: #666; font-size: 16px;">We received a request to reset your password. Click the button below to create a new password.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #999; font-size: 14px;">Or copy and paste this link in your browser:</p>
          <p style="color: #667eea; font-size: 12px; word-break: break-all;">${resetUrl}</p>
          <p style="color: #999; font-size: 14px;">This link will expire in 15 minutes for security reasons.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
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
    const transport = getTransporter();
    
    // Check if using ethereal (fake) transport
    if (!SMTP_USER || !SMTP_PASS) {
      console.log("📧 [EMAIL MOCK] Would send email:");
      console.log("  To:", mailOptions.to);
      console.log("  Subject:", mailOptions.subject);
      // For testing, return a mock response
      return { 
        success: true, 
        messageId: `mock-${Date.now()}`,
        previewUrl: null
      };
    }
    
    const info = await transport.sendMail(mailOptions);
    console.log("📧 Email sent:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("📧 Email error:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendVerificationEmail,
  sendResetPasswordEmail,
  sendConcernNotification
};
