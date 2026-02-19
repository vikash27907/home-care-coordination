
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { 
  readStore, writeStore, nextId, initializeStore, 
  // Existing getters
  getPatientByRequestId,
  // User helpers
  getUserById, getUserByEmail, createUser, updateUser, deleteUser, getUsers,
  // Nurse helpers  
  getNurseById, getNurseByEmail, createNurse, updateNurse, deleteNurse, getNurses,
  // Agent helpers
  getAgentById, getAgentByEmail, createAgent, updateAgent, deleteAgent, getAgents,
  // Patient helpers
  getPatientById, createPatient, updatePatient, deletePatient, getPatients,
  // Concern helpers
  getConcernById, createConcern, updateConcern, deleteConcern, getConcerns
} = require("./src/store");
const {
  sendVerificationEmail,
  sendVerificationOtpEmail,
  sendResetPasswordEmail,
  sendConcernNotification,
  sendRequestConfirmationEmail,
  sendAdminCareRequestNotification,
  sendAdminNurseSignupNotification
} = require("./src/email");
const { initializeDatabase } = require("./src/schema");
const { pool } = require("./src/db");
const { cloudinary } = require("./src/cloudinary");
const fs = require("fs");

// ============================================================
// RATE LIMITING
// ============================================================

// Login rate limiter - 5 attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: "Too many login attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't rate limit health checks
    return req.path === "/health" || req.path === "/healthz";
  }
});

// ============================================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================================
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PROFILE_DIR = path.join(UPLOAD_DIR, "profile");
const RESUME_DIR = path.join(UPLOAD_DIR, "resume");
const CERTIFICATES_DIR = path.join(UPLOAD_DIR, "certificates");

// Ensure upload directories exist
[UPLOAD_DIR, PROFILE_DIR, RESUME_DIR, CERTIFICATES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration for resumes
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RESUME_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, "resume-" + uniqueSuffix + ext);
  }
});

// Storage configuration for profile images (100KB limit)
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILE_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, "profile-" + uniqueSuffix + ext);
  }
});

// Storage configuration for certificates
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CERTIFICATES_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, "certificate-" + uniqueSuffix + ext);
  }
});

// Multer upload configurations
const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only PDF files are allowed for resume"));
  }
});

const uploadCertificate = multer({
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, JPEG, PNG, and PDF files are allowed"));
  }
});

// Profile image upload - 100KB limit (only for profile edit, NOT for signup)
const uploadProfileImage = multer({
  storage: profileStorage,
  limits: { fileSize: 100 * 1024 }, // 100KB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, JPEG, and PNG files are allowed. Max size: 100KB"));
  }
});

// Forgot-password rate limiter - protects against OTP abuse and enumeration attempts
const forgotPasswordRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: "Too many password reset requests. Please try again in 10 minutes.",
  standardHeaders: true,
  legacyHeaders: false
});

const PROFILE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_UPLOAD_ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const PROFILE_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpg",
  "image/jpeg",
  "image/png"
]);

const uploadNurseProfileFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const isExtAllowed = PROFILE_UPLOAD_ALLOWED_EXTENSIONS.has(extension);
    const isMimeAllowed = PROFILE_UPLOAD_ALLOWED_MIME_TYPES.has(String(file.mimetype || "").toLowerCase());
    if (isExtAllowed && isMimeAllowed) {
      return cb(null, true);
    }
    return cb(new Error("Only PDF, JPG, and PNG files are allowed."));
  }
}).fields([
  { name: "profilePic", maxCount: 1 },
  { name: "tenthCert", maxCount: 1 },
  { name: "highestCert", maxCount: 1 },
  { name: "resume", maxCount: 1 }
]);

function runMulterMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
}

function uploadBufferToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        return resolve(result);
      }
    );
    upload.end(file.buffer);
  });
}

const app = express();
const PORT = process.env.PORT || 10000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ============================================================
// PRODUCTION-GRADE VALIDATION CONSTANTS & HELPERS
// ============================================================

// India phone validation regex: exactly 10 digits, starts with 6-9
const INDIA_PHONE_REGEX = /^[6-9]\d{9}$/;

// Standard email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;


// Sanitization helper - removes potentially dangerous characters
function sanitizeInput(value) {
  if (value === undefined || value === null) return "";
  const str = String(value);
  // Trim whitespace
  let sanitized = str.trim();
  // Remove script tags and event handlers
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
  sanitized = sanitized.replace(/javascript:/gi, "");
  // Remove SQL injection patterns (basic)
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)/gi, "");
  return sanitized;
}

// Validate India phone number
function validateIndiaPhone(phone) {
  if (!phone || typeof phone !== "string") {
    return { valid: false, error: "Please enter a valid 10-digit Indian mobile number." };
  }
  const cleaned = phone.replace(/\D/g, "");
  if (!INDIA_PHONE_REGEX.test(cleaned)) {
    return { valid: false, error: "Please enter a valid 10-digit Indian mobile number." };
  }
  return { valid: true, value: cleaned };
}

// Validate email format
function validateEmail(email) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Please enter a valid email address." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true, value: trimmed };
}

// ============================================================
// NURSE PROFILE COMPLETION HELPER
// ============================================================
function calculateProfileCompletion(nurse) {
  let completion = 0;

  // Profile Image (supports both legacy & new column names)
  if (nurse.profile_pic_url || nurse.profile_image_path) completion += 10;

  if (nurse.aadhaar_card_url) completion += 15;
  if (nurse.skills && nurse.skills.length >= 3) completion += 15;
  if (nurse.experience_years > 0 || nurse.experience_months > 0) completion += 10;
  if (nurse.expected_salary) completion += 10;

  if (
    nurse.highest_cert_url ||
    (nurse.additional_certificates &&
      Array.isArray(nurse.additional_certificates) &&
      nurse.additional_certificates.length > 0)
  ) completion += 15;

  if (
    nurse.pan_india ||
    (nurse.work_locations &&
      Array.isArray(nurse.work_locations) &&
      nurse.work_locations.length > 0)
  ) completion += 10;

  if (nurse.preferred_shift) completion += 5;
  if (nurse.current_address) completion += 10;

  return completion;
}


// Validation middleware for request body
function validateRequest(req, res, next) {
  // Sanitize all string inputs
  for (const key in req.body) {
    if (typeof req.body[key] === "string") {
      req.body[key] = sanitizeInput(req.body[key]);
    }
  }
  next();
}

app.use(validateRequest);

const NURSE_STATUSES = ["Pending", "Approved", "Rejected"];
const AGENT_STATUSES = ["Pending", "Approved", "Rejected"];
// Standardized request statuses
const REQUEST_STATUSES = [
  "Requested",
  "Waiting for Acceptance",
  "Agent Will Contact You Soon",
  "Nurse Will Be Assigned Shortly",
  "Nurse Assigned"
];
const PATIENT_STATUSES = ["New", "In Progress", "Closed"];
const CONCERN_STATUSES = ["Open", "In Progress", "Resolved"];
const CONCERN_CATEGORIES = [
  "Profile Issue",
  "Payment Issue", 
  "Approval Issue",
  "Technical Issue",
  "Other"
];
const COMMISSION_TYPES = ["Percent", "Flat"];

// Valid service schedule values (standardized) - matches request-care.ejs dropdown
const VALID_SERVICE_SCHEDULES = [
  "8_hour_shift",
  "12_hour_shift_day",
  "12_hour_shift_night",
  "24_hour_live_in",
  "one_time_visit"
];

// Service schedule labels for display
const SERVICE_SCHEDULE_LABELS = {
  "8_hour_shift": "8 Hour Shift",
  "12_hour_shift_day": "12 Hour Shift (Day)",
  "12_hour_shift_night": "12 Hour Shift (Night)",
  "24_hour_live_in": "24 Hour Live-In",
  "one_time_visit": "One-Time / Few Visits Required"
};

// Helper function to validate service schedule
function validateServiceSchedule(serviceSchedule) {
  if (!serviceSchedule || !VALID_SERVICE_SCHEDULES.includes(serviceSchedule)) {
    return { valid: false, error: "Please select a valid service schedule." };
  }
  return { valid: true, value: serviceSchedule };
}

const SKILLS_OPTIONS = [
  "Elderly Care",
  "Post-Surgery Care",
  "Wound Dressing",
  "Medication Support",
  "Physiotherapy Assistance",
  "Palliative Care"
];

const AVAILABILITY_OPTIONS = [
  "Weekday Morning",
  "Weekday Evening",
  "Night Shift",
  "Weekend",
  "On Call"
];

const REFERRAL_DEFAULT_PERCENT = (() => {
  const raw = Number.parseFloat(process.env.REFERRAL_DEFAULT_PERCENT || "5");
  if (Number.isNaN(raw)) {
    return 5;
  }
  if (raw < 0) {
    return 0;
  }
  if (raw > 100) {
    return 100;
  }
  return Number(raw.toFixed(2));
})();

// Expanded nursing skills options
const NURSING_SKILLS_OPTIONS = [
  "General Nursing Care",
  "ICU Care",
  "Post Surgical Care",
  "Elderly Care",
  "Palliative Care",
  "Injection Administration",
  "IV Drip Handling",
  "Tracheostomy Care",
  "Bedridden Care",
  "Physiotherapy Assistance",
  "Wound Dressing",
  "Catheter Care",
  "Pediatric Care",
  "Stroke Patient Care",
  "Diabetes Management",
  "Blood Pressure Monitoring",
  "Oxygen Support",
  "Emergency First Aid",
  "Night Shift Care",
  "Dementia Care"
];

// Education level options
const EDUCATION_LEVEL_OPTIONS = [
  "10th Pass",
  "12th Pass",
  "ANM",
  "GNM",
  "BSc Nursing",
  "MSc Nursing",
  "GDA",
  "Other"
];

const PROFILE_SKILL_OPTIONS = [
  "ICU Care",
  "Tracheostomy Care",
  "Injection/IV",
  "Dressing",
  "Catheterization",
  "Ryle's Tube Feeding",
  "Post-Surgical Care",
  "Elderly Care"
];

const PROFILE_QUALIFICATION_OPTIONS = [
  "10th (SSC)",
  "12th (HSC)",
  "ANM",
  "GNM",
  "BSc Nursing",
  "MSc Nursing"
];

const PROFILE_AVAILABILITY_STATUS_OPTIONS = [
  "Open for Work",
  "Currently Working",
  "Working but looking for change"
];

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.disable("x-powered-by");

if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "replace-this-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // Always false for localhost HTTP
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);
app.use(express.static(path.join(process.cwd(), "public")));

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return [String(value).trim()].filter(Boolean);
}

function toBoolean(value) {
  if (value === true || value === "true" || value === "1" || value === "on" || value === 1) {
    return true;
  }
  return false;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }
  return Number.parseFloat(value);
}

function parseOptionalMoney(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return Number.NaN;
  }
  return parsed;
}

function dedupeNormalizedEmails(values) {
  const seen = new Set();
  const deduped = [];
  values.forEach((value) => {
    const normalized = normalizeEmail(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    deduped.push(normalized);
  });
  return deduped;
}

function getNurseAgentEmails(nurse) {
  if (!nurse) return [];
  if (Array.isArray(nurse.agentEmails)) {
    return dedupeNormalizedEmails(nurse.agentEmails);
  }
  return dedupeNormalizedEmails([nurse.agentEmail || ""]);
}

function setNurseAgentEmails(nurse, agentEmails) {
  const normalized = dedupeNormalizedEmails(agentEmails);
  nurse.agentEmails = normalized;
  nurse.agentEmail = normalized[0] || "";
  return normalized;
}

function nurseHasAgent(nurse, agentEmail) {
  const normalizedAgent = normalizeEmail(agentEmail);
  if (!normalizedAgent) return false;
  return getNurseAgentEmails(nurse).includes(normalizedAgent);
}

function calculateCommission(nurseAmount, commissionType, commissionValue) {
  let commissionAmount = 0;
  if (commissionType === "Percent") {
    commissionAmount = (nurseAmount * commissionValue) / 100;
  } else if (commissionType === "Flat") {
    commissionAmount = commissionValue;
  }
  if (commissionAmount < 0) {
    commissionAmount = 0;
  }
  const nurseNetAmount = nurseAmount - commissionAmount;
  return {
    commissionAmount: Number(commissionAmount.toFixed(2)),
    nurseNetAmount: Number(nurseNetAmount.toFixed(2))
  };
}

function now() {
  return new Date().toISOString();
}

// ============================================================
// EMAIL VERIFICATION & PASSWORD RESET HELPERS
// ============================================================

// Generate a secure random token
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Generate a 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate a temporary password
function generateTempPassword() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateRequestId(store) {
  let requestId;
  let isUnique = false;
  
  do {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    requestId = `REQ-${year}-${randomNum}`;
    
    // Check for uniqueness
    isUnique = !store.patients.some(patient => patient.requestId === requestId);
  } while (!isUnique);
  
  return requestId;
}

// Check if reset token is expired (15 minutes)
function isResetTokenExpired(expiry) {
  if (!expiry) return true;
  return new Date(expiry) < new Date();
}

// Mask Aadhar number (show last 4 digits)
function maskAadhar(aadharNumber) {
  if (!aadharNumber || aadharNumber.length < 4) return "XXXX-XXXX-XXXX";
  const cleaned = aadharNumber.replace(/\D/g, "");
  if (cleaned.length < 4) return "XXXX-XXXX-XXXX";
  return `XXXX-XXXX-${cleaned.slice(-4)}`;
}

// ============================================================
// CONCERN SYSTEM HELPERS
// ============================================================

// Get all concerns
function getAllConcerns(store) {
  if (!Array.isArray(store.concerns)) {
    return [];
  }
  return store.concerns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Get concerns by user ID
function getConcernsByUserId(store, userId) {
  return store.concerns
    ? store.concerns.filter(c => c.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    : [];
}

// Get open concerns count
function getOpenConcernsCount(store) {
  return store.concerns ? store.concerns.filter(c => c.status === "Open").length : 0;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function consumeFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

function getApprovedAgents(store) {
  return store.agents.filter((agent) => agent.status === "Approved");
}

function redirectByRole(role) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "agent") return "/agent/dashboard";
  if (role === "nurse") return "/nurse/dashboard";
  // For regular users (user role), redirect to their dashboard
  return "/dashboard";
}

function generateReferralCode(usedCodes) {
  let code = "";
  do {
    code = `N${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}

function clearPatientFinancials(patient) {
  patient.nurseId = null;
  patient.nurseAmount = null;
  patient.commissionType = "Percent";
  patient.commissionValue = 0;
  patient.commissionAmount = 0;
  patient.nurseNetAmount = null;
  patient.referrerNurseId = null;
  patient.referralCommissionPercent = 0;
  patient.referralCommissionAmount = 0;
}

function hasRegisteredPhone(store, phone, excludeUserId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return false;
  }

  if (store.users.some((user) => normalizePhone(user.phoneNumber) === normalized && (excludeUserId === null || user.id !== excludeUserId))) {
    return true;
  }
  if (store.agents.some((agent) => normalizePhone(agent.phoneNumber) === normalized && (excludeUserId === null || agent.userId !== excludeUserId))) {
    return true;
  }
  if (store.nurses.some((nurse) => normalizePhone(nurse.phoneNumber) === normalized && (excludeUserId === null || nurse.userId !== excludeUserId))) {
    return true;
  }
  return false;
}

function hasRegisteredEmail(store, email, excludeUserId = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  if (store.users.some((user) => user.email === normalized && (excludeUserId === null || user.id !== excludeUserId))) {
    return true;
  }
  if (store.agents.some((agent) => agent.email === normalized && (excludeUserId === null || agent.userId !== excludeUserId))) {
    return true;
  }
  if (store.nurses.some((nurse) => nurse.email === normalized && (excludeUserId === null || nurse.userId !== excludeUserId))) {
    return true;
  }
  return false;
}

function getPublicNurseSkills(nurse) {
  if (Array.isArray(nurse.publicSkills) && nurse.publicSkills.length) {
    return nurse.publicSkills;
  }
  return Array.isArray(nurse.skills) ? nurse.skills : [];
}

function buildPublicNurse(nurse) {
  return {
    id: nurse.id,
    fullName: nurse.fullName,
    city: nurse.publicShowCity ? nurse.city : "Not shared",
    experienceYears: nurse.publicShowExperience ? nurse.experienceYears : null,
    skills: getPublicNurseSkills(nurse),
    availability: nurse.availability || [],
    profileImageUrl: nurse.profileImageUrl || "",
    publicBio: nurse.publicBio || "",
    isAvailable: nurse.isAvailable !== false
  };
}
function normalizeStoreShape(store) {
  let changed = false;

  if (!Array.isArray(store.users)) {
    store.users = [];
    changed = true;
  }
  if (!Array.isArray(store.nurses)) {
    store.nurses = [];
    changed = true;
  }
  if (!Array.isArray(store.agents)) {
    store.agents = [];
    changed = true;
  }
  if (!Array.isArray(store.patients)) {
    store.patients = [];
    changed = true;
  }

  store.agents.forEach((agent) => {
    const normalizedEmail = normalizeEmail(agent.email);
    if (agent.email !== normalizedEmail) {
      agent.email = normalizedEmail;
      changed = true;
    }
    if (typeof agent.createdByAgentEmail !== "string") {
      agent.createdByAgentEmail = "";
      changed = true;
    }
    if (typeof agent.phoneNumber !== "string") {
      agent.phoneNumber = String(agent.phoneNumber || "");
      changed = true;
    }
  });

  const referralCodes = new Set();
  store.nurses.forEach((nurse) => {
    const normalizedEmail = normalizeEmail(nurse.email);
    if (nurse.email !== normalizedEmail) {
      nurse.email = normalizedEmail;
      changed = true;
    }

    const normalizedAgentEmails = getNurseAgentEmails(nurse);
    const existingAgentEmail = nurse.agentEmail || "";
    if (existingAgentEmail !== (normalizedAgentEmails[0] || "") || !Array.isArray(nurse.agentEmails)) {
      setNurseAgentEmails(nurse, normalizedAgentEmails);
      changed = true;
    }

    if (!Array.isArray(nurse.skills)) {
      nurse.skills = [];
      changed = true;
    }
    if (!Array.isArray(nurse.availability)) {
      nurse.availability = [];
      changed = true;
    }
    if (!Array.isArray(nurse.publicSkills)) {
      nurse.publicSkills = [];
      changed = true;
    }
    if (typeof nurse.profileImageUrl !== "string") {
      nurse.profileImageUrl = "";
      changed = true;
    }
    if (typeof nurse.publicBio !== "string") {
      nurse.publicBio = "";
      changed = true;
    }
    if (typeof nurse.isAvailable !== "boolean") {
      nurse.isAvailable = nurse.status === "Approved";
      changed = true;
    }
    if (typeof nurse.publicShowCity !== "boolean") {
      nurse.publicShowCity = true;
      changed = true;
    }
    if (typeof nurse.publicShowExperience !== "boolean") {
      nurse.publicShowExperience = true;
      changed = true;
    }
    if (nurse.referredByNurseId !== null && typeof nurse.referredByNurseId !== "number") {
      nurse.referredByNurseId = null;
      changed = true;
    }
    if (typeof nurse.referralCommissionPercent !== "number" || Number.isNaN(nurse.referralCommissionPercent)) {
      nurse.referralCommissionPercent = REFERRAL_DEFAULT_PERCENT;
      changed = true;
    }
    if (nurse.referralCommissionPercent < 0) {
      nurse.referralCommissionPercent = 0;
      changed = true;
    }
    if (nurse.referralCommissionPercent > 100) {
      nurse.referralCommissionPercent = 100;
      changed = true;
    }
    if (typeof nurse.experienceYears !== "number" || Number.isNaN(nurse.experienceYears)) {
      nurse.experienceYears = Number.parseInt(nurse.experienceYears, 10);
      if (Number.isNaN(nurse.experienceYears)) {
        nurse.experienceYears = 0;
      }
      changed = true;
    }
    if (typeof nurse.experienceMonths !== "number" || Number.isNaN(nurse.experienceMonths)) {
      nurse.experienceMonths = Number.parseInt(nurse.experienceMonths, 10);
      if (Number.isNaN(nurse.experienceMonths)) {
        nurse.experienceMonths = 0;
      }
      changed = true;
    }
    if (typeof nurse.availabilityStatus !== "string") {
      nurse.availabilityStatus = "";
      changed = true;
    }
    if (!Array.isArray(nurse.workLocations)) {
      nurse.workLocations = [];
      changed = true;
    }
    if (typeof nurse.currentAddress !== "string") {
      nurse.currentAddress = "";
      changed = true;
    }
    if (typeof nurse.aadhaarNumber !== "string") {
      nurse.aadhaarNumber = typeof nurse.aadharNumber === "string" ? nurse.aadharNumber : "";
      changed = true;
    }
    if (!Array.isArray(nurse.qualifications)) {
      nurse.qualifications = [];
      changed = true;
    }
    if (typeof nurse.highestCertUrl !== "string") {
      nurse.highestCertUrl = "";
      changed = true;
    }
    if (typeof nurse.tenthCertUrl !== "string") {
      nurse.tenthCertUrl = "";
      changed = true;
    }

    // New fields for nurse profile completion
    if (typeof nurse.educationLevel !== "string") {
      nurse.educationLevel = "";
      changed = true;
    }
    if (typeof nurse.resumeUrl !== "string") {
      nurse.resumeUrl = "";
      changed = true;
    }
    if (typeof nurse.certificateUrl !== "string") {
      nurse.certificateUrl = "";
      changed = true;
    }
    // New fields for enhanced nurse profile
    if (typeof nurse.aadharNumber !== "string") {
      nurse.aadharNumber = "";
      changed = true;
    }
    if (typeof nurse.address !== "string") {
      nurse.address = "";
      changed = true;
    }
    if (typeof nurse.workCity !== "string") {
      nurse.workCity = "";
      changed = true;
    }
    if (typeof nurse.profileImagePath !== "string") {
      nurse.profileImagePath = "";
      changed = true;
    }
    if (typeof nurse.customSkills !== "object" || !Array.isArray(nurse.customSkills)) {
      nurse.customSkills = [];
      changed = true;
    }

    let referralCode = String(nurse.referralCode || "").trim().toUpperCase();
    if (!referralCode || referralCodes.has(referralCode)) {
      referralCode = generateReferralCode(referralCodes);
      nurse.referralCode = referralCode;
      changed = true;
    } else {
      referralCodes.add(referralCode);
      if (nurse.referralCode !== referralCode) {
        nurse.referralCode = referralCode;
        changed = true;
      }
    }
  });

  store.users.forEach((user) => {
    const normalizedEmail = normalizeEmail(user.email);
    if (user.email !== normalizedEmail) {
      user.email = normalizedEmail;
      changed = true;
    }
    if (typeof user.phoneNumber !== "string") {
      const agent = store.agents.find((item) => item.userId === user.id);
      const nurse = store.nurses.find((item) => item.userId === user.id);
      user.phoneNumber = (agent && agent.phoneNumber) || (nurse && nurse.phoneNumber) || "";
      changed = true;
    }
    // Email verification fields
    if (typeof user.emailVerified !== "boolean") {
      user.emailVerified = false;
      changed = true;
    }
    if (typeof user.verificationToken !== "string") {
      user.verificationToken = "";
      changed = true;
    }
    if (typeof user.resetToken !== "string") {
      user.resetToken = "";
      changed = true;
    }
    if (typeof user.resetTokenExpiry !== "string") {
      user.resetTokenExpiry = "";
      changed = true;
    }
  });

  store.patients.forEach((patient) => {
    if (typeof patient.email === "string") {
      const normalizedEmail = normalizeEmail(patient.email);
      if (patient.email !== normalizedEmail) {
        patient.email = normalizedEmail;
        changed = true;
      }
    }

    if (typeof patient.budget === "undefined") {
      patient.budget = 0;
      changed = true;
    }
    if (patient.budget === "" || Number.isNaN(patient.budget)) {
      patient.budget = 0;
      changed = true;
    }
    if (typeof patient.budget !== "number") {
      const parsed = Number.parseFloat(patient.budget);
      patient.budget = Number.isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
      changed = true;
    }

    if (typeof patient.commissionType !== "string" || !COMMISSION_TYPES.includes(patient.commissionType)) {
      patient.commissionType = "Percent";
      changed = true;
    }
    if (typeof patient.commissionValue !== "number" || Number.isNaN(patient.commissionValue)) {
      patient.commissionValue = 0;
      changed = true;
    }
    if (typeof patient.commissionAmount !== "number" || Number.isNaN(patient.commissionAmount)) {
      patient.commissionAmount = 0;
      changed = true;
    }
    if (patient.referrerNurseId !== null && typeof patient.referrerNurseId !== "number") {
      patient.referrerNurseId = null;
      changed = true;
    }
    if (typeof patient.referralCommissionPercent !== "number" || Number.isNaN(patient.referralCommissionPercent)) {
      patient.referralCommissionPercent = 0;
      changed = true;
    }
    if (typeof patient.referralCommissionAmount !== "number" || Number.isNaN(patient.referralCommissionAmount)) {
      patient.referralCommissionAmount = 0;
      changed = true;
    }
    if (typeof patient.transferMarginType !== "string" || !COMMISSION_TYPES.includes(patient.transferMarginType)) {
      patient.transferMarginType = "Percent";
      changed = true;
    }
    if (typeof patient.transferMarginValue !== "number" || Number.isNaN(patient.transferMarginValue)) {
      patient.transferMarginValue = 0;
      changed = true;
    }
    if (typeof patient.transferMarginAmount !== "number" || Number.isNaN(patient.transferMarginAmount)) {
      patient.transferMarginAmount = 0;
      changed = true;
    }
    if (typeof patient.lastTransferredAt !== "string") {
      patient.lastTransferredAt = "";
      changed = true;
    }
    if (typeof patient.lastTransferredBy !== "string") {
      patient.lastTransferredBy = "";
      changed = true;
    }
    if (patient.preferredNurseId !== null && typeof patient.preferredNurseId !== "number") {
      patient.preferredNurseId = null;
      changed = true;
    }
    if (typeof patient.preferredNurseName !== "string") {
      patient.preferredNurseName = "";
      changed = true;
    }
  });

  return changed;
}

function readNormalizedStore() {
  const store = readStore();
  const changed = normalizeStoreShape(store);
  if (changed) {
    writeStore(store);
  }
  return store;
}

function loadCurrentUser(req, res, next) {
  req.currentUser = null;
  const userId = req.session.userId;
  if (!userId) {
    return next();
  }

  // Use async query to get fresh user data from PostgreSQL
  getUserById(userId)
    .then((user) => {
      if (!user) {
        req.session.userId = null;
        req.session.role = null;
        return next();
      }

      req.currentUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        phoneNumber: user.phoneNumber || ""
      };
      return next();
    })
    .catch((err) => {
      console.error("Error loading current user:", err);
      return next();
    });
}

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    setFlash(req, "error", "Please log in first.");
    return res.redirect("/login");
  }
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.currentUser) {
      setFlash(req, "error", "Please log in first.");
      return res.redirect("/login");
    }
    if (req.currentUser.role !== role) {
      return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
    }
    return next();
  };
}

function requireApprovedAgent(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== "agent") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  const store = readNormalizedStore();
  const agentRecord = store.agents.find((item) => item.userId === req.currentUser.id);
  if (!agentRecord || agentRecord.status !== "Approved") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  req.agentRecord = agentRecord;
  return next();
}

async function requireApprovedNurse(req, res, next) {
  console.log('--- Debugging requireApprovedNurse ---');
  if (!req.currentUser) {
    console.log('Failed: No currentUser found.');
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  console.log('Checking User ID:', req.currentUser.id, 'Role:', req.currentUser.role);
  if (req.currentUser.role !== "nurse") {
    console.log('Failed: Role is not nurse.');
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  // Only block "Rejected" or "Suspended" status - allow "Pending" through
  if (req.currentUser.status === "Rejected" || req.currentUser.status === "Suspended") {
    console.log('Failed: User status is Rejected or Suspended. Current status:', req.currentUser.status);
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  const store = readNormalizedStore();

  console.log('Attempting to find nurse profile for user ID:', req.currentUser.id);
  let nurseRecord = store.nurses.find((item) => item.userId === req.currentUser.id);
  if (!nurseRecord) {
    // Cache can be stale after writes; fall back to a fresh DB read.
    const nurses = await getNurses();
    nurseRecord = nurses.find((item) => item.userId === req.currentUser.id);
    if (nurseRecord && !store.nurses.some((item) => item.id === nurseRecord.id)) {
      store.nurses.push(nurseRecord);
    }
  }

  if (!nurseRecord) {
    // Self-heal broken accounts by creating a minimal nurse profile row.
    console.log('No nurse record found - creating fallback nurse profile');
    const usedCodes = new Set((await getNurses())
      .map((item) => String(item.referralCode || "").toUpperCase())
      .filter(Boolean));
    const fallbackNurse = await createNurse({
      id: nextId(readStore(), "nurse"),
      userId: req.currentUser.id,
      fullName: req.currentUser.fullName || "Nurse",
      city: "",
      gender: "Not Specified",
      status: req.currentUser.status === "Approved" ? "Approved" : "Pending",
      agentEmail: "",
      agentEmails: [],
      profileImagePath: "/images/default-male.png",
      referralCode: generateReferralCode(usedCodes),
      referredByNurseId: null,
      referralCommissionPercent: REFERRAL_DEFAULT_PERCENT,
      createdAt: now()
    });
    if (fallbackNurse) {
      if (!store.nurses.some((item) => item.id === fallbackNurse.id)) {
        store.nurses.push(fallbackNurse);
      }
      req.nurseRecord = fallbackNurse;
      return next();
    }

    // If DB write fails, keep compatibility with existing profile completion flow.
    console.log('Fallback nurse creation failed - creating dummy record for profile completion');
    req.nurseRecord = { 
      id: null, 
      status: 'Pending',
      fullName: req.currentUser.fullName,
      email: req.currentUser.email,
      phoneNumber: req.currentUser.phoneNumber || '',
      city: '',
      gender: '',
      aadhaarNumber: '',
      experienceMonths: 0,
      availabilityStatus: '',
      workLocations: [],
      currentAddress: '',
      qualifications: [],
      skills: [],
      availability: [],
      experienceYears: 0,
      educationLevel: '',
      resumeUrl: '',
      highestCertUrl: '',
      tenthCertUrl: '',
      certificateUrl: '',
      profileImagePath: '',
      publicSkills: [],
      isAvailable: false,
      referralCode: '',
      referredByNurseId: null,
      referralCommissionPercent: REFERRAL_DEFAULT_PERCENT,
      createdAt: now()
    };
    return next();
  } else if (nurseRecord.status === "Rejected" || nurseRecord.status === "Suspended") {
    console.log('Failed: Nurse profile status is Rejected or Suspended:', nurseRecord.status);
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  // Allow "Pending" status to pass through
  console.log('Success: Nurse authorized.');
  req.nurseRecord = nurseRecord;
  return next();
}

app.use(loadCurrentUser);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.use((req, res, next) => {
  res.locals.currentUser = req.currentUser;
  res.locals.currentPath = req.path;
  res.locals.flash = consumeFlash(req);
  res.locals.nurseStatuses = NURSE_STATUSES;
  res.locals.agentStatuses = AGENT_STATUSES;
  res.locals.patientStatuses = PATIENT_STATUSES;
  res.locals.commissionTypes = COMMISSION_TYPES;
  res.locals.concernStatuses = CONCERN_STATUSES;
  res.locals.concernCategories = CONCERN_CATEGORIES;
// Service schedule options - standardized list (matches request-care.ejs)
  const SERVICE_SCHEDULE_OPTIONS = [
    { value: "8_hour_shift", label: "8 Hour Shift" },
    { value: "12_hour_shift_day", label: "12 Hour Shift (Day)" },
    { value: "12_hour_shift_night", label: "12 Hour Shift (Night)" },
    { value: "24_hour_live_in", label: "24 Hour Live-In" },
    { value: "one_time_visit", label: "One-Time / Few Visits Required" }
  ];

  // Request status options - standardized
  const REQUEST_STATUSES = [
    "Requested",
    "Waiting for Acceptance",
    "Agent Will Contact You",
    "Nurse Will Be Assigned Soon",
    "Nurse Assigned"
  ];

  res.locals.serviceScheduleOptions = SERVICE_SCHEDULE_OPTIONS;
  res.locals.requestStatuses = REQUEST_STATUSES;
  return next();
});

// ============================================================
// POSTGRESQL ADMIN MANAGEMENT
// ============================================================

// Ensure admin exists in PostgreSQL - called during server startup
// ONLY creates admin if no admin exists - NEVER updates existing
async function ensureAdmin() {
  const email = "vikash27907@gmail.com";
  const password = "9661611495@Rajas";

  try {
    // Check if admin exists in PostgreSQL - ONLY create if not exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existing.rows.length === 0) {
      // Insert new admin only if no admin exists
      const hashed = bcrypt.hashSync(password, 10);
      await pool.query(
        `INSERT INTO users 
          (email, phone_number, password_hash, role, status, email_verified, otp_code, otp_expiry, created_at) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [email, "", hashed, "admin", "Approved", true, "", null]
      );
      console.log("Admin created in PostgreSQL");
    }
    
    // Always log verification complete
    console.log("Admin verification complete.");
  } catch (error) {
    console.error("Error ensuring admin:", error.message);
  }
}

async function createNurseUnderAgent(req, res, failRedirect, generatedOtp, otpExpiry) {
  const creatorAgentEmail = req.currentUser && req.currentUser.role === "agent" ? normalizeEmail(req.currentUser.email) : "";
  const fullName = String(req.body.fullName || "").trim();
  const emailInput = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const gender = String(req.body.gender || "").trim();
  
  // Check if OTP verification is required (for nurse signup)
  const requiresOtpVerification = typeof generatedOtp === 'string' && typeof otpExpiry === 'object';

  // Validate required fields
  if (!fullName || !emailInput || !phoneNumber || !city || !gender || !password) {
    setFlash(req, "error", "Please complete all required nurse details.");
    return res.redirect(failRedirect);
  }

  // Validate gender must be Male or Female
  if (!["Male", "Female"].includes(gender)) {
    setFlash(req, "error", "Please select a valid gender.");
    return res.redirect(failRedirect);
  }
  
  // Validate email format
  const emailValidation = validateEmail(emailInput);
  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect(failRedirect);
  }
  const email = emailValidation.value;
  
  // Validate India phone number
  const phoneValidation = validateIndiaPhone(phoneNumber);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect(failRedirect);
  }

  // Check if email already exists using async helper
  const existingUserByEmail = await getUserByEmail(email);
  if (existingUserByEmail) {
    setFlash(req, "error", "This email already has a registered account.");
    return res.redirect(failRedirect);
  }
  
  // Check if phone already exists
  const users = await getUsers();
  const nurses = await getNurses();
  const agents = await getAgents();
  
  const hasRegisteredPhone = (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    if (users.some(u => normalizePhone(u.phoneNumber) === normalized)) return true;
    if (agents.some(a => normalizePhone(a.phoneNumber) === normalized)) return true;
    if (nurses.some(n => normalizePhone(n.phoneNumber) === normalized)) return true;
    return false;
  };
  
  if (hasRegisteredPhone(phoneNumber)) {
    setFlash(req, "error", "This phone number already has a registered account.");
    return res.redirect(failRedirect);
  }

  // Default avatar based on gender
  const defaultAvatar = gender === "Male" ? "/images/default-male.png" : "/images/default-female.png";
  
  // ============================================================
  // STEP 1: Insert into USERS table (authentication)
  // ============================================================
  const user = {
    email,
    phoneNumber,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "nurse",
    status: "Pending",
    createdAt: now(),
    emailVerified: false,
    otpCode: requiresOtpVerification ? generatedOtp : "",
    otpExpiry: requiresOtpVerification ? otpExpiry.toISOString() : null
  };
  
  const createdUser = await createUser(user);
  if (!createdUser) {
    setFlash(req, "error", "Unable to create your account right now. Please try again.");
    return res.redirect(failRedirect);
  }
  
  // ============================================================
  // STEP 2: Insert into NURSES table (profile data only)
  // ============================================================
  const nurse = {
    userId: createdUser.id,
    fullName,
    city,
    gender,
    status: "Pending",
    profileImagePath: defaultAvatar,
    createdAt: now()
  };
  
  const createdNurse = await createNurse(nurse);
  if (!createdNurse) {
    await deleteUser(createdUser.id);
    setFlash(req, "error", "Unable to create nurse profile. Please try again.");
    return res.redirect(failRedirect);
  }

  try {
    const skills = toArray(req.body.skills)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const experienceYears = Number.parseInt(req.body.experienceYears, 10);
    const experienceMonths = Number.parseInt(req.body.experienceMonths, 10);
    const availabilityStatus = String(req.body.availabilityStatus || "").trim();

    const adminNurseEmailResult = await sendAdminNurseSignupNotification({
      fullName,
      email,
      phone: phoneNumber,
      city,
      experienceYears: Number.isFinite(experienceYears) ? experienceYears : 0,
      experienceMonths: Number.isFinite(experienceMonths) ? experienceMonths : 0,
      skills,
      availabilityStatus: availabilityStatus || "Not provided"
    });

    if (adminNurseEmailResult && adminNurseEmailResult.success === false) {
      throw new Error(adminNurseEmailResult.error || "Unknown admin nurse notification email error");
    }
  } catch (error) {
    console.error(`Admin nurse signup email failed for ${email}:`, error);
  }

  // Send OTP email after both records are created successfully.
  if (requiresOtpVerification) {
    await sendVerificationOtpEmail(email, fullName, generatedOtp);
  }

  // Do NOT auto-login - redirect to OTP verification instead
  if (creatorAgentEmail) {
    const successMessage = requiresOtpVerification
      ? "Nurse profile created successfully. Please verify email."
      : "Nurse profile created successfully.";
    setFlash(req, "success", successMessage);
    return res.redirect("/agent");
  }

  // Redirect to OTP verification page
  setFlash(req, "success", "Account created! Please verify your email with the OTP sent to your inbox.");
  return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
}

async function createAgentUnderAgent(req, res, failRedirect) {
  const fullName = String(req.body.fullName || "").trim();
  const emailInput = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const region = String(req.body.region || "").trim();

  // Validate required fields
  if (!fullName || !emailInput || !password || !phoneNumber || !region) {
    setFlash(req, "error", "Please complete all agent details.");
    return res.redirect(failRedirect);
  }
  
  // Validate email format
  const emailValidation = validateEmail(emailInput);
  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect(failRedirect);
  }
  const email = emailValidation.value;
  
  // Validate India phone number
  const phoneValidation = validateIndiaPhone(phoneNumber);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect(failRedirect);
  }

  // Check if email already exists using async helper
  const existingUserByEmail = await getUserByEmail(email);
  if (existingUserByEmail) {
    setFlash(req, "error", "This email already has a registered account.");
    return res.redirect(failRedirect);
  }
  
  // Check if phone already exists
  const users = await getUsers();
  const nurses = await getNurses();
  const agents = await getAgents();
  
  const hasRegisteredPhone = (phone) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    if (users.some(u => normalizePhone(u.phoneNumber) === normalized)) return true;
    if (agents.some(a => normalizePhone(a.phoneNumber) === normalized)) return true;
    if (nurses.some(n => normalizePhone(n.phoneNumber) === normalized)) return true;
    return false;
  };
  
  if (hasRegisteredPhone(phoneNumber)) {
    setFlash(req, "error", "This phone number already has a registered account.");
    return res.redirect(failRedirect);
  }

  // Get next IDs from store
  const store = readStore();
  const userId = nextId(store, "user");
  const agentId = nextId(store, "agent");
  const creatorAgentEmail = req.currentUser && req.currentUser.role === "agent" ? normalizeEmail(req.currentUser.email) : "";

  // ============================================================
  // STEP 1: Insert into USERS table (authentication)
  // ============================================================
  const user = {
    id: userId,
    fullName,
    email,
    phoneNumber,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "agent",
    status: "Pending",
    createdAt: now()
  };
  
  await createUser(user);

  // ============================================================
  // STEP 2: Insert into AGENTS table (profile data only)
  // ============================================================
  const agent = {
    id: agentId,
    userId,
    fullName,
    email,
    phoneNumber,
    region,
    status: "Pending",
    createdByAgentEmail: creatorAgentEmail,
    createdAt: now()
  };
  
  await createAgent(agent);

  if (creatorAgentEmail) {
    setFlash(req, "success", "Agent account created. Admin approval is required before login.");
    return res.redirect("/agent");
  }

  setFlash(req, "success", "Agent registration submitted. Admin approval is required before login.");
  return res.redirect("/agent-registration");
}

// Commented out seedAdmin - now using ensureAdmin() for PostgreSQL
// seedAdmin();

// Health check routes - support both /health and /healthz
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "home-care-coordination", ts: now() });
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true, service: "home-care-coordination", ts: now() });
});

app.get("/", (req, res) => {
  res.render("public/home", { title: "Prisha Home Care" });
});

app.get("/nurses", (req, res) => {
  const includeUnavailable = String(req.query.show || "").trim().toLowerCase() === "all";
  const store = readNormalizedStore();

  const nurses = store.nurses
    .filter((nurse) => nurse.status === "Approved")
    .filter((nurse) => (includeUnavailable ? true : nurse.isAvailable !== false))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((nurse) => buildPublicNurse(nurse));

  return res.render("public/nurses", {
    title: "Find Nurses",
    nurses,
    includeUnavailable
  });
});

app.get("/nurses/:id", (req, res) => {
  const nurseId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(nurseId)) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === nurseId && item.status === "Approved");
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  return res.render("public/nurse-profile", {
    title: `${nurse.fullName} | Public Nurse Profile`,
    nurse: buildPublicNurse(nurse)
  });
});

app.get("/request-care", (req, res) => {
  const preferredNurseId = Number.parseInt(req.query.nurseId, 10);
  let preferredNurse = null;
  if (!Number.isNaN(preferredNurseId)) {
    const store = readNormalizedStore();
    const nurse = store.nurses.find((item) => item.id === preferredNurseId && item.status === "Approved" && item.isAvailable !== false);
    if (nurse) {
      preferredNurse = buildPublicNurse(nurse);
    }
  }
  res.render("public/request-care", { title: "Request Care", preferredNurse });
});


app.post("/request-care", async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const serviceSchedule = String(req.body.serviceSchedule || "").trim();
  
  // Validate required fields
  if (!fullName || !email || !phoneNumber || !city || !serviceSchedule) {
    setFlash(req, "error", "Please complete all required fields.");
    return res.redirect("/request-care");
  }
  
  // Validate India phone number
  const phoneValidation = validateIndiaPhone(phoneNumber);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect("/request-care");
  }
  
  // Validate email
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect("/request-care");
  }
  
  // Validate service schedule
  const scheduleValidation = validateServiceSchedule(serviceSchedule);
  if (!scheduleValidation.valid) {
    setFlash(req, "error", scheduleValidation.error);
    return res.redirect("/request-care");
  }

  // Parse duration type and budget
  const durationUnit = String(req.body.durationUnit || "").trim();
  const durationValue = Number(req.body.durationValue);
  const budget = Number(req.body.budget);

  if (!durationUnit || !["days", "months"].includes(durationUnit)) {
    setFlash(req, "error", "Please select a valid duration unit.");
    return res.redirect("/request-care");
  }

  if (!durationValue || isNaN(durationValue) || durationValue < 1) {
    setFlash(req, "error", "Please enter a valid duration value.");
    return res.redirect("/request-care");
  }

  // Create duration string for storage
  const duration = `${durationValue} ${durationUnit}`;

  if (!budget || isNaN(budget) || budget <= 0) {
    setFlash(req, "error", "Please enter a valid budget.");
    return res.redirect("/request-care");
  }

  const preferredNurseIdRaw = String(req.body.preferredNurseId || "").trim();
  const preferredNurseId = preferredNurseIdRaw ? Number.parseInt(preferredNurseIdRaw, 10) : Number.NaN;

  const store = readStore();
  let preferredNurseName = "";
  let preferredNurseValue = null;
  
  if (!Number.isNaN(preferredNurseId)) {
    const nurses = await getNurses();
    const preferredNurse = nurses.find(
      (item) => item.id === preferredNurseId && item.status === "Approved" && item.isAvailable !== false
    );
    if (!preferredNurse) {
      setFlash(req, "error", "Selected nurse is no longer available.");
      return res.redirect("/request-care");
    }
    preferredNurseName = preferredNurse.fullName;
    preferredNurseValue = preferredNurse.id;
  }

  const patientId = nextId(store, "patient");
  const referenceId = generateRequestId(store);
  
  // Default status is "Requested"
  const defaultStatus = "Requested";
  
  const patient = {
    id: patientId,
    requestId: referenceId,
    userId: req.currentUser ? req.currentUser.id : null,
    fullName,
    email,
    phoneNumber,
    city,
    serviceSchedule,
    notes: req.body.notes || "",
    status: defaultStatus,
    agentEmail: "",
    nurseId: null,
    nurseAmount: null,
    commissionType: "Percent",
    commissionValue: 0,
    commissionAmount: 0,
    nurseNetAmount: null,
    referrerNurseId: null,
    referralCommissionPercent: 0,
    referralCommissionAmount: 0,
    preferredNurseId: preferredNurseValue,
    preferredNurseName,
    transferMarginType: "Percent",
    transferMarginValue: 0,
    transferMarginAmount: 0,
    lastTransferredAt: "",
    lastTransferredBy: "",
    duration: duration,
    budget: budget,
    createdAt: now()
  };
  
  await createPatient(patient);

  // Send confirmation email asynchronously (do not block request submission).
  const serviceScheduleLabel = req.app.locals.serviceScheduleOptions?.find((s) => s.value === serviceSchedule)?.label || serviceSchedule;
  const userEmail = email;
  const userName = fullName;
  const preferredDate = String(req.body.preferredDate || "").trim();
  const patientCondition = String(req.body.patientCondition || req.body.notes || "").trim();

  try {
    const emailResult = await sendRequestConfirmationEmail(
      userEmail,
      userName,
      referenceId,
      {
        serviceType: serviceScheduleLabel,
        city,
        preferredDate,
        phone: phoneNumber,
        patientCondition
      }
    );

    if (emailResult && emailResult.success === false) {
      throw new Error(emailResult.error || "Unknown email error");
    }
  } catch (error) {
    console.error(`Email failed for reference ${referenceId}:`, error);
  }

  try {
    const adminEmailResult = await sendAdminCareRequestNotification(referenceId, {
      fullName,
      email,
      phone: phoneNumber,
      city,
      serviceType: serviceScheduleLabel,
      preferredDate,
      patientCondition,
      budget,
      duration
    });

    if (adminEmailResult && adminEmailResult.success === false) {
      throw new Error(adminEmailResult.error || "Unknown admin notification email error");
    }
  } catch (error) {
    console.error(`Admin notification failed for reference ${referenceId}:`, error);
  }

  return res.redirect(`/request-success?requestId=${referenceId}`);
});

app.get("/request-success", (req, res) => {
  const { requestId } = req.query;
  if (!requestId) {
    return res.redirect("/request-care");
  }
  res.render("public/request-success", {
    title: "Request Submitted",
    requestId
  });
});

app.get("/track-request", (req, res) => {
  const { requestId } = req.query;
  const renderData = {
    title: "Track Request",
    requestId: requestId || ""
  };

  if (requestId) {
    const store = readNormalizedStore();
    const request = store.patients.find(p => p.requestId === requestId);
    
    if (request) {
      // Permission check: allow if user is owner, admin, or agent assigned to this request
      let hasPermission = false;
      
      if (req.currentUser) {
        // Admin can view all
        if (req.currentUser.role === "admin") {
          hasPermission = true;
        }
        // Agent can view if assigned
        else if (req.currentUser.role === "agent") {
          if (request.agentEmail && request.agentEmail.toLowerCase() === req.currentUser.email.toLowerCase()) {
            hasPermission = true;
          }
        }
        // Nurse can view if assigned to this patient
        else if (req.currentUser.role === "nurse") {
          if (request.nurseId && req.nurseRecord && request.nurseId === req.nurseRecord.id) {
            hasPermission = true;
          }
        }
        // Regular user can view their own requests
        else if (request.userId === req.currentUser.id) {
          hasPermission = true;
        }
      } else {
        // Public user can only view if they have the correct request ID (no additional check needed)
        hasPermission = true;
      }
      
      if (hasPermission) {
        renderData.request = request;
      } else {
        renderData.error = "You don't have permission to view this request.";
      }
    } else {
      renderData.error = "Request not found.";
    }
  }

  res.render("public/track-request", renderData);
});

app.post("/update-request", (req, res) => {
  const { requestId, duration, serviceSchedule, notes } = req.body;

  if (!requestId) {
    setFlash(req, "error", "Invalid request ID.");
    return res.redirect("/track-request");
  }

  const store = readNormalizedStore();
  const requestIndex = store.patients.findIndex(p => p.requestId === requestId);

  if (requestIndex === -1) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }

  const request = store.patients[requestIndex];
  
  // Permission check: allow if user is owner or admin
  let hasPermission = false;
  
  if (req.currentUser) {
    // Admin can edit all
    if (req.currentUser.role === "admin") {
      hasPermission = true;
    }
    // Agent can edit if assigned
    else if (req.currentUser.role === "agent") {
      if (request.agentEmail && request.agentEmail.toLowerCase() === req.currentUser.email.toLowerCase()) {
        hasPermission = true;
      }
    }
    // Regular user can edit their own requests only
    else if (request.userId === req.currentUser.id) {
      hasPermission = true;
    }
  } else {
    // Public users can edit with correct request ID
    hasPermission = true;
  }
  
  if (!hasPermission) {
    setFlash(req, "error", "You don't have permission to edit this request.");
    return res.redirect("/track-request");
  }

  store.patients[requestIndex].duration = duration;
  store.patients[requestIndex].serviceSchedule = serviceSchedule;
  store.patients[requestIndex].notes = notes;

  writeStore(store);

  setFlash(req, "success", "Request updated successfully.");
  res.redirect(`/track-request?requestId=${requestId}`);
});

app.get("/nurse-signup", (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/nurses/new");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("public/nurse-signup", {
    title: "Nurse Signup",
    skillsOptions: SKILLS_OPTIONS,
    availabilityOptions: AVAILABILITY_OPTIONS
  });
});

app.post("/nurse-signup", async (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/nurses/new");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  
  // Generate 4-digit OTP for email verification
  const generatedOtp = String(Math.floor(1000 + Math.random() * 9000));
  const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for testing
  
  // Add OTP to request body for createNurseUnderAgent to use
  req.body.generatedOtp = generatedOtp;
  req.body.otpExpiry = otpExpiry;
  
  return createNurseUnderAgent(req, res, "/nurse-signup", generatedOtp, otpExpiry);
});

app.get("/verify-otp", (req, res) => {
  const { email } = req.query;
  if (!email) {
    setFlash(req, "error", "Invalid request. Please try again.");
    return res.redirect("/nurse-signup");
  }
  res.render("public/verify-otp", {
    title: "Verify OTP",
    email
  });
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  
  console.log('--- OTP DEBUG START ---');
  console.log('User Email:', email);
  console.log('Input OTP (Type):', otp, typeof otp);
  
  // Fetch user directly from database for fresh data
  const user = await getUserByEmail(email);
  
  if (!user) {
    console.log('ERROR: User not found in database');
    console.log('--- OTP DEBUG END ---');
    setFlash(req, "error", "User not found. Please try again.");
    return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
  }
  
  console.log('DB OTP (Type):', user.otpCode, typeof user.otpCode);
  console.log('DB Expiry:', user.otpExpiry);
  console.log('Current Time:', new Date());
  console.log('Is Expired?', new Date() > new Date(user.otpExpiry));
  console.log('Do Codes Match?', String(user.otpCode).trim() === String(otp).trim());
  console.log('--- OTP DEBUG END ---');

  // Fix 1: Type safety - force both to strings and trim
  // Fix 2: Date safety - ensure proper date comparison
  if (!user || !user.otpCode || String(user.otpCode).trim() !== String(otp).trim() || new Date() > new Date(user.otpExpiry)) {
    console.log('OTP validation FAILED');
    setFlash(req, "error", "Invalid or expired OTP. Please try again.");
    return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
  }

  console.log('SUCCESS: Codes match!');
  
  // OTP is valid - clear it and set email_verified = true
  await updateUser(user.id, {
    emailVerified: true,
    otpCode: '',
    otpExpiry: null
  });

  // Set session
  req.session.userId = user.id;
  req.session.role = user.role;

  setFlash(req, "success", "Email verified successfully! Welcome to your dashboard.");
  return res.redirect("/nurse/profile");
});

app.get("/agent-registration", (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/agents/new");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("public/agent-registration", {
    title: "Agent Registration"
  });
});

app.post("/agent-registration", async (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/agents/new");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return createAgentUnderAgent(req, res, "/agent-registration");
});

app.get("/login", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("auth/login", { title: "Login" });
});

app.post("/login", loginRateLimiter, async (req, res) => {
  const identifierRaw = String(req.body.identifier || req.body.email || "").trim();
  const password = String(req.body.password || "");
  const normalizedEmail = normalizeEmail(identifierRaw);

  if (!normalizedEmail) {
    setFlash(req, "error", "Please enter a valid email address.");
    return res.redirect("/login");
  }

  // Login is email-primary and loads nurse profile name through JOIN in store helper.
  const user = await getUserByEmail(normalizedEmail);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    setFlash(req, "error", "Invalid credentials.");
    return res.redirect("/login");
  }

  if (!user.emailVerified) {
    setFlash(req, "error", "Please verify your email before logging in.");
    return res.redirect("/login");
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  setFlash(req, "success", `Welcome, ${user.fullName || user.email}.`);
  return res.redirect(redirectByRole(user.role));
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// User Dashboard - for logged-in users who are not admin/agent/nurse
// Shows their care requests
app.get("/dashboard", requireAuth, (req, res) => {
  // Redirect admin, agent, and nurse to their respective dashboards
  if (req.currentUser.role === "admin") {
    return res.redirect("/admin");
  }
  if (req.currentUser.role === "agent") {
    return res.redirect("/agent");
  }
  if (req.currentUser.role === "nurse") {
    return res.redirect("/nurse/profile");
  }
  
  // For regular users, show their requests
  const store = readNormalizedStore();
  const userRequests = store.patients
    .filter((item) => item.userId === req.currentUser.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.render("public/user-dashboard", {
    title: "My Dashboard",
    userRequests
  });
});

app.get("/admin", requireRole("admin"), (req, res) => {
  const store = readNormalizedStore();
  const metrics = {
    totalNurses: store.nurses.length,
    availableNurses: store.nurses.filter((item) => item.status === "Approved" && item.isAvailable !== false).length,
    pendingNurses: store.nurses.filter((item) => item.status === "Pending").length,
    totalPatients: store.patients.length,
    newPatients: store.patients.filter((item) => item.status === "New").length,
    totalAgents: store.agents.length,
    pendingAgents: store.agents.filter((item) => item.status === "Pending").length,
    openConcerns: getOpenConcernsCount(store)
  };
  return res.render("admin/dashboard", { title: "Admin Dashboard", metrics });
});

// Admin Dashboard route - redirects to /admin
app.get("/admin/dashboard", requireRole("admin"), (req, res) => {
  return res.redirect("/admin");
});

app.get("/admin/nurses", requireRole("admin"), (req, res) => {
  const statusFilter = String(req.query.status || "All");
  const store = readNormalizedStore();
  const approvedAgents = getApprovedAgents(store);
  const nurses = store.nurses
    .filter((item) => (statusFilter === "All" ? true : item.status === statusFilter))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return res.render("admin/nurses", {
    title: "Manage Nurses",
    statusFilter,
    nurses,
    approvedAgents
  });
});

app.post("/admin/nurses/:id/update", requireRole("admin"), async (req, res) => {
  const nurseId = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "").trim();
  const fullName = String(req.body.fullName || "").trim();
  const city = req.body.city === undefined ? null : String(req.body.city || "").trim();
  const gender = String(req.body.gender || "").trim();
  const statusFilter = String(req.body.statusFilter || "All");
  const hasStatusFilter = Boolean(req.body.statusFilter);

  if (status && !NURSE_STATUSES.includes(status)) {
    setFlash(req, "error", "Invalid nurse status.");
    return res.redirect(`/admin/nurses?status=${encodeURIComponent(statusFilter)}`);
  }
  if (gender && !["Male", "Female"].includes(gender)) {
    setFlash(req, "error", "Invalid nurse gender.");
    return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : `/admin/user/view/nurse/${nurseId}`);
  }

  const nurse = await getNurseById(nurseId);
  if (!nurse) {
    setFlash(req, "error", "Nurse record not found.");
    return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : "/admin/nurses");
  }

  const nurseUpdates = {};
  if (status) nurseUpdates.status = status;
  if (fullName) nurseUpdates.fullName = fullName;
  if (city !== null) nurseUpdates.city = city;
  if (gender) nurseUpdates.gender = gender;

  if (Object.keys(nurseUpdates).length === 0) {
    setFlash(req, "error", "No changes submitted.");
    return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : `/admin/user/view/nurse/${nurseId}`);
  }

  const updatedNurse = await updateNurse(nurseId, nurseUpdates);
  if (!updatedNurse) {
    setFlash(req, "error", "Failed to update nurse record.");
    return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : `/admin/user/view/nurse/${nurseId}`);
  }

  if (status) {
    await updateUser(nurse.userId, { status });
  }

  setFlash(req, "success", "Nurse record updated.");
  return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : `/admin/user/view/nurse/${nurseId}`);
});

app.get("/admin/agents", requireRole("admin"), (req, res) => {
  const statusFilter = String(req.query.status || "All");
  const store = readNormalizedStore();
  const agents = store.agents
    .filter((item) => (statusFilter === "All" ? true : item.status === statusFilter))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return res.render("admin/agents", {
    title: "Manage Agents",
    statusFilter,
    agents
  });
});

app.post("/admin/agents/:id/update", requireRole("admin"), (req, res) => {
  const agentId = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "").trim();
  const statusFilter = String(req.body.statusFilter || "All");

  if (!AGENT_STATUSES.includes(status)) {
    setFlash(req, "error", "Invalid agent status.");
    return res.redirect(`/admin/agents?status=${encodeURIComponent(statusFilter)}`);
  }

  const store = readNormalizedStore();
  const agent = store.agents.find((item) => item.id === agentId);
  if (!agent) {
    setFlash(req, "error", "Agent record not found.");
    return res.redirect(`/admin/agents?status=${encodeURIComponent(statusFilter)}`);
  }

  agent.status = status;
  const user = store.users.find((item) => item.id === agent.userId);
  if (user) {
    user.status = status;
  }

  if (status !== "Approved") {
    store.patients.forEach((patient) => {
      if (normalizeEmail(patient.agentEmail) === normalizeEmail(agent.email)) {
        patient.agentEmail = "";
        clearPatientFinancials(patient);
      }
    });
    store.nurses.forEach((nurse) => {
      if (!nurseHasAgent(nurse, agent.email)) {
        return;
      }
      const remainingAgents = getNurseAgentEmails(nurse).filter((email) => email !== normalizeEmail(agent.email));
      setNurseAgentEmails(nurse, remainingAgents);
    });
  }

  writeStore(store);
  setFlash(req, "success", "Agent record updated.");
  return res.redirect(`/admin/agents?status=${encodeURIComponent(statusFilter)}`);
});

app.get("/admin/patients", requireRole("admin"), (req, res) => {
  const statusFilter = String(req.query.status || "All");
  const store = readNormalizedStore();
  const approvedAgents = getApprovedAgents(store);
  const nurseIndex = store.nurses.reduce((acc, nurse) => {
    acc[nurse.id] = nurse.fullName;
    return acc;
  }, {});
  const patients = store.patients
    .filter((item) => (statusFilter === "All" ? true : item.status === statusFilter))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return res.render("admin/patients", {
    title: "Manage Patients",
    statusFilter,
    patients,
    approvedAgents,
    nurseIndex
  });
});

app.post("/admin/patients/:id/update", requireRole("admin"), (req, res) => {
  const patientId = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "").trim();
  const agentEmail = normalizeEmail(req.body.agentEmail || "");
  const statusFilter = String(req.body.statusFilter || "All");

  if (!PATIENT_STATUSES.includes(status)) {
    setFlash(req, "error", "Invalid patient status.");
    return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
  }

  const store = readNormalizedStore();
  const patient = store.patients.find((item) => item.id === patientId);
  if (!patient) {
    setFlash(req, "error", "Patient record not found.");
    return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
  }

  if (agentEmail) {
    const validAgent = store.agents.find((agent) => agent.email === agentEmail && agent.status === "Approved");
    if (!validAgent) {
      setFlash(req, "error", "Assigned agent must be approved.");
      return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
    }
  }

  patient.status = status;
  patient.agentEmail = agentEmail;

  if (patient.nurseId) {
    const assignedNurse = store.nurses.find((nurse) => nurse.id === patient.nurseId);
    const mismatch = !assignedNurse || !nurseHasAgent(assignedNurse, agentEmail || "");
    if (mismatch) {
      clearPatientFinancials(patient);
    }
  }

  writeStore(store);
  setFlash(req, "success", "Patient record updated.");
  return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
});
app.get("/agent", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const store = readNormalizedStore();

  const patients = store.patients
    .filter((item) => normalizeEmail(item.agentEmail) === agentEmail || (item.userId && item.userId === req.currentUser.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const nurses = store.nurses
    .filter((item) => nurseHasAgent(item, agentEmail))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const approvedNurses = nurses.filter((nurse) => nurse.status === "Approved" && nurse.isAvailable !== false);
  const nurseIndex = nurses.reduce((acc, nurse) => {
    acc[nurse.id] = nurse.fullName;
    return acc;
  }, {});
  const referralNurseIndex = store.nurses.reduce((acc, nurse) => {
    acc[nurse.id] = nurse.fullName;
    return acc;
  }, {});
  const transferTargets = getApprovedAgents(store).filter((agent) => normalizeEmail(agent.email) !== agentEmail);
  const createdAgents = store.agents.filter((agent) => normalizeEmail(agent.createdByAgentEmail) === agentEmail);

  return res.render("agent/dashboard", {
    title: "Agent Dashboard",
    patients,
    nurses,
    approvedNurses,
    nurseIndex,
    referralNurseIndex,
    transferTargets,
    createdAgents
  });
});

// Agent Dashboard route - redirects to /agent
app.get("/agent/dashboard", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.redirect("/agent");
});

app.get("/agent/patients/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.render("agent/add-patient", { title: "Add Patient" });
});

app.post("/agent/patients/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const careRequirement = String(req.body.careRequirement || "").trim();
  const durationType = String(req.body.durationType || "").trim();
  const budget = Number(req.body.budget);

  if (!fullName || !email || !phoneNumber || !city || !careRequirement || !durationType) {
    setFlash(req, "error", "Please complete all required patient fields.");
    return res.redirect("/agent/patients/new");
  }
  if (!normalizePhone(phoneNumber)) {
    setFlash(req, "error", "Please enter a valid phone number.");
    return res.redirect("/agent/patients/new");
  }
  if (!budget || isNaN(budget) || budget <= 0) {
    setFlash(req, "error", "Please enter a valid budget.");
    return res.redirect("/agent/patients/new");
  }
  if (!["Days", "Months", "Years"].includes(durationType)) {
    setFlash(req, "error", "Please select a valid duration type.");
    return res.redirect("/agent/patients/new");
  }

  const store = readStore();
  const patientId = nextId(store, "patient");
  
  const patient = {
    id: patientId,
    fullName,
    email,
    phoneNumber,
    city,
    careRequirement,
    durationType: durationType,
    budget: budget,
    status: "New",
    agentEmail: req.currentUser.email,
    nurseId: null,
    nurseAmount: null,
    commissionType: "Percent",
    commissionValue: 0,
    commissionAmount: 0,
    nurseNetAmount: null,
    referrerNurseId: null,
    referralCommissionPercent: 0,
    referralCommissionAmount: 0,
    preferredNurseId: null,
    preferredNurseName: "",
    transferMarginType: "Percent",
    transferMarginValue: 0,
    transferMarginAmount: 0,
    lastTransferredAt: "",
    lastTransferredBy: "",
    createdAt: now()
  };
  
  await createPatient(patient);

  setFlash(req, "success", "Patient added successfully.");
  return res.redirect("/agent");
});

app.post("/agent/patients/:id/financials", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const patientId = Number.parseInt(req.params.id, 10);
  const nurseIdRaw = String(req.body.nurseId || "").trim();
  const nurseAmount = parseMoney(req.body.nurseAmount);
  const commissionType = String(req.body.commissionType || "").trim();
  const commissionValue = parseMoney(req.body.commissionValue);

  const store = readNormalizedStore();
  const agentEmail = normalizeEmail(req.currentUser.email);
  const patient = store.patients.find((item) => item.id === patientId);

  if (!patient || normalizeEmail(patient.agentEmail) !== agentEmail) {
    setFlash(req, "error", "Patient not found in your assigned list.");
    return res.redirect("/agent");
  }

  if (!nurseIdRaw) {
    clearPatientFinancials(patient);
    writeStore(store);
    setFlash(req, "success", "Nurse and financial assignment cleared for this patient.");
    return res.redirect("/agent");
  }

  const nurseId = Number.parseInt(nurseIdRaw, 10);
  const nurse = store.nurses.find((item) => item.id === nurseId);
  if (!nurse || !nurseHasAgent(nurse, agentEmail) || nurse.status !== "Approved" || nurse.isAvailable === false) {
    setFlash(req, "error", "Selected nurse must be approved, available, and assigned under your account.");
    return res.redirect("/agent");
  }

  if (Number.isNaN(nurseAmount) || nurseAmount < 0) {
    setFlash(req, "error", "Please enter a valid nurse amount.");
    return res.redirect("/agent");
  }
  if (!COMMISSION_TYPES.includes(commissionType)) {
    setFlash(req, "error", "Please choose a valid commission type.");
    return res.redirect("/agent");
  }
  if (Number.isNaN(commissionValue) || commissionValue < 0) {
    setFlash(req, "error", "Please enter a valid commission value.");
    return res.redirect("/agent");
  }
  if (commissionType === "Percent" && commissionValue > 100) {
    setFlash(req, "error", "Commission percent cannot be more than 100.");
    return res.redirect("/agent");
  }

  const roundedNurseAmount = Number(nurseAmount.toFixed(2));
  const roundedCommissionValue = Number(commissionValue.toFixed(2));
  const { commissionAmount, nurseNetAmount } = calculateCommission(
    roundedNurseAmount,
    commissionType,
    roundedCommissionValue
  );

  if (nurseNetAmount < 0) {
    setFlash(req, "error", "Commission cannot exceed nurse amount.");
    return res.redirect("/agent");
  }
  if (typeof patient.budget === "number" && roundedNurseAmount > patient.budget) {
    setFlash(req, "error", "Nurse amount should be within patient budget.");
    return res.redirect("/agent");
  }

  patient.nurseId = nurse.id;
  patient.nurseAmount = roundedNurseAmount;
  patient.commissionType = commissionType;
  patient.commissionValue = roundedCommissionValue;
  patient.commissionAmount = commissionAmount;
  patient.nurseNetAmount = nurseNetAmount;

  const referrer = nurse.referredByNurseId
    ? store.nurses.find((item) => item.id === nurse.referredByNurseId && item.status === "Approved")
    : null;
  if (referrer) {
    const referralPercent = Number((nurse.referralCommissionPercent || REFERRAL_DEFAULT_PERCENT).toFixed(2));
    const referralAmount = Number(((roundedNurseAmount * referralPercent) / 100).toFixed(2));
    patient.referrerNurseId = referrer.id;
    patient.referralCommissionPercent = referralPercent;
    patient.referralCommissionAmount = referralAmount;
  } else {
    patient.referrerNurseId = null;
    patient.referralCommissionPercent = 0;
    patient.referralCommissionAmount = 0;
  }

  writeStore(store);
  setFlash(req, "success", "Patient assignment and commission saved.");
  return res.redirect("/agent");
});

app.post("/agent/patients/:id/transfer", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const patientId = Number.parseInt(req.params.id, 10);
  const targetAgentEmail = normalizeEmail(req.body.targetAgentEmail || "");
  const transferMarginType = String(req.body.transferMarginType || "").trim();
  const transferMarginValue = parseMoney(req.body.transferMarginValue);
  const currentAgentEmail = normalizeEmail(req.currentUser.email);

  const store = readNormalizedStore();
  const patient = store.patients.find((item) => item.id === patientId);
  if (!patient || normalizeEmail(patient.agentEmail) !== currentAgentEmail) {
    setFlash(req, "error", "Patient not found in your assigned list.");
    return res.redirect("/agent");
  }

  if (!targetAgentEmail || targetAgentEmail === currentAgentEmail) {
    setFlash(req, "error", "Please select a different approved agent for transfer.");
    return res.redirect("/agent");
  }
  const targetAgent = store.agents.find((agent) => agent.email === targetAgentEmail && agent.status === "Approved");
  if (!targetAgent) {
    setFlash(req, "error", "Target agent must be approved.");
    return res.redirect("/agent");
  }
  if (!COMMISSION_TYPES.includes(transferMarginType)) {
    setFlash(req, "error", "Please choose a valid margin type.");
    return res.redirect("/agent");
  }
  if (Number.isNaN(transferMarginValue) || transferMarginValue < 0) {
    setFlash(req, "error", "Please enter a valid transfer margin.");
    return res.redirect("/agent");
  }
  if (transferMarginType === "Percent" && transferMarginValue > 100) {
    setFlash(req, "error", "Transfer margin percent cannot be more than 100.");
    return res.redirect("/agent");
  }

  const marginValue = Number(transferMarginValue.toFixed(2));
  let transferMarginAmount = 0;
  if (typeof patient.nurseAmount === "number") {
    transferMarginAmount = transferMarginType === "Percent"
      ? Number(((patient.nurseAmount * marginValue) / 100).toFixed(2))
      : marginValue;
  } else {
    transferMarginAmount = transferMarginType === "Flat" ? marginValue : 0;
  }

  patient.transferMarginType = transferMarginType;
  patient.transferMarginValue = marginValue;
  patient.transferMarginAmount = transferMarginAmount;
  patient.lastTransferredAt = now();
  patient.lastTransferredBy = currentAgentEmail;
  patient.agentEmail = targetAgentEmail;

  if (patient.nurseId) {
    const assignedNurse = store.nurses.find((nurse) => nurse.id === patient.nurseId);
    const nurseCompatible = assignedNurse
      && assignedNurse.status === "Approved"
      && assignedNurse.isAvailable !== false
      && nurseHasAgent(assignedNurse, targetAgentEmail);
    if (!nurseCompatible) {
      clearPatientFinancials(patient);
    }
  }

  writeStore(store);
  setFlash(req, "success", "Patient transferred successfully.");
  return res.redirect("/agent");
});

app.get("/agent/nurses/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const store = readNormalizedStore();
  const referralNurses = store.nurses
    .filter((nurse) => nurse.status === "Approved")
    .sort((a, b) => (a.fullName > b.fullName ? 1 : -1))
    .map((nurse) => ({
      id: nurse.id,
      fullName: nurse.fullName,
      referralCode: nurse.referralCode
    }));

  return res.render("agent/add-nurse", {
    title: "Add Nurse",
    skillsOptions: SKILLS_OPTIONS,
    availabilityOptions: AVAILABILITY_OPTIONS,
    referralNurses,
    prefilledReferralCode: String(req.query.ref || "").trim().toUpperCase()
  });
});

app.post("/agent/nurses/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  return createNurseUnderAgent(req, res, "/agent/nurses/new");
});

app.get("/agent/agents/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.render("agent/add-agent", { title: "Add Agent" });
});

app.post("/agent/agents/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  return createAgentUnderAgent(req, res, "/agent/agents/new");
});

app.get("/nurse/profile", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const store = readNormalizedStore();
  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  const assignedAgents = getNurseAgentEmails(nurse).map((agentEmail) => {
    const agent = store.agents.find((item) => normalizeEmail(item.email) === agentEmail);
    return {
      email: agentEmail,
      name: agent ? agent.fullName : "Unknown Agent",
      region: agent ? agent.region : "-"
    };
  });
  const referredNurses = store.nurses
    .filter((item) => item.referredByNurseId === nurse.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const referralPatients = store.patients
    .filter((patient) => patient.referrerNurseId === nurse.id && typeof patient.referralCommissionAmount === "number")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const referralTotal = referralPatients.reduce((sum, patient) => sum + (patient.referralCommissionAmount || 0), 0);

  return res.render("nurse/profile", {
    title: "Nurse Profile",
    nurse,
    assignedAgents,
    referredNurses,
    referralPatients,
    referralTotal: Number(referralTotal.toFixed(2)),
    referralLink: `/agent/nurses/new?ref=${encodeURIComponent(nurse.referralCode || "")}`
  });
});

// Nurse Dashboard route - redirects to /nurse/profile
app.get("/nurse/dashboard", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  return res.redirect("/nurse/profile");
});

// Nurse Profile Edit GET route
app.get("/nurse/profile/edit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  return res.render("nurse/profile-edit", {
    title: "Update Profile",
    nurse,
    profileSkillOptions: PROFILE_SKILL_OPTIONS,
    qualificationOptions: PROFILE_QUALIFICATION_OPTIONS,
    availabilityStatusOptions: PROFILE_AVAILABILITY_STATUS_OPTIONS
  });
});

// Nurse Profile Edit POST route with Cloudinary file uploads
app.post("/nurse/profile/edit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  try {
    await runMulterMiddleware(uploadNurseProfileFiles, req, res);
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      setFlash(req, "error", "Each file must be 2MB or smaller.");
      return res.redirect("/nurse/profile/edit");
    }
    setFlash(req, "error", error.message || "Invalid file upload.");
    return res.redirect("/nurse/profile/edit");
  }

  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  let profilePicDbColumn = "profile_image_path";
  try {
    const profilePicColumnResult = await pool.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'nurses'
          AND column_name = 'profile_pic_url'
      ) AS has_profile_pic_url`
    );
    if (profilePicColumnResult.rows[0] && profilePicColumnResult.rows[0].has_profile_pic_url) {
      profilePicDbColumn = "profile_pic_url";
    }
  } catch (error) {
    // Fall back to profile_image_path when metadata lookup is unavailable.
    profilePicDbColumn = "profile_image_path";
  }

  const normalizeArray = (val) => {
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const city = String(req.body.city || "").trim();
  if (!city) {
    setFlash(req, "error", "City is required.");
    return res.redirect("/nurse/profile/edit");
  }

  const aadhaarDigits = String(req.body.aadhaarNumber || "").replace(/\D/g, "");
  if (aadhaarDigits && aadhaarDigits.length !== 12) {
    setFlash(req, "error", "Aadhaar number must be exactly 12 digits.");
    return res.redirect("/nurse/profile/edit");
  }

  const experienceYears = Number.parseInt(
    req.body.experience_years ?? req.body.experienceYears,
    10
  );
  if (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60) {
    setFlash(req, "error", "Experience years must be between 0 and 60.");
    return res.redirect("/nurse/profile/edit");
  }

  const experienceMonths = Number.parseInt(
    req.body.experience_months ?? req.body.experienceMonths,
    10
  );
  if (Number.isNaN(experienceMonths) || experienceMonths < 0 || experienceMonths > 11) {
    setFlash(req, "error", "Experience months must be between 0 and 11.");
    return res.redirect("/nurse/profile/edit");
  }

  const availabilityStatus = String(req.body.availability_status || req.body.availabilityStatus || "").trim();
  if (!PROFILE_AVAILABILITY_STATUS_OPTIONS.includes(availabilityStatus)) {
    setFlash(req, "error", "Please select a valid availability status.");
    return res.redirect("/nurse/profile/edit");
  }

  const selectedSkills = normalizeArray(req.body.skills)
    .map((item) => String(item || "").trim())
    .filter((item) => PROFILE_SKILL_OPTIONS.includes(item));

  const selectedQualifications = normalizeArray(req.body.qualifications)
    .map((item) => String(item || "").trim())
    .filter((item) => PROFILE_QUALIFICATION_OPTIONS.includes(item));

  const workLocationsRaw = String(req.body.workLocationsRaw || "").trim();
  const workLocationsInput = workLocationsRaw
    ? workLocationsRaw.split(",").map((item) => item.trim())
    : normalizeArray(req.body.work_locations).map((item) => String(item || "").trim());
  const normalizedWorkLocations = normalizeArray(workLocationsInput).filter(Boolean);

  const currentAddress = String(req.body.currentAddress || req.body.current_address || "").trim();

  const updateData = {};
  const setIfDefined = (key, value) => {
    if (typeof value !== "undefined") {
      updateData[key] = value;
    }
  };

  // Explicitly whitelisted profile fields only.
  setIfDefined("city", city);
  setIfDefined("current_address", currentAddress);
  setIfDefined("availability_status", availabilityStatus);
  setIfDefined("experience_years", experienceYears);
  setIfDefined("experience_months", experienceMonths);
  setIfDefined("aadhaar_number", aadhaarDigits);
  setIfDefined("skills", selectedSkills);
  setIfDefined("work_locations", normalizedWorkLocations);
  setIfDefined("qualifications", selectedQualifications);

  // Optional phone update belongs to users table.
  const phoneInput = String(req.body.phone || "").trim();
  let normalizedPhone = "";
  if (phoneInput) {
    const phoneValidation = validateIndiaPhone(phoneInput);
    if (!phoneValidation.valid) {
      setFlash(req, "error", phoneValidation.error);
      return res.redirect("/nurse/profile/edit");
    }
    normalizedPhone = phoneValidation.value;
  }

  const files = req.files || {};
  try {
    if (files.profilePic && files.profilePic[0]) {
      const uploadedProfilePic = await uploadBufferToCloudinary(files.profilePic[0], "home-care/nurses/profile");
      setIfDefined(profilePicDbColumn, uploadedProfilePic.secure_url);
    }
    if (files.resume && files.resume[0]) {
      const uploadedResume = await uploadBufferToCloudinary(files.resume[0], "home-care/nurses/resume");
      setIfDefined("resume_url", uploadedResume.secure_url);
    }
    if (files.highestCert && files.highestCert[0]) {
      const uploadedHighest = await uploadBufferToCloudinary(files.highestCert[0], "home-care/nurses/highest-cert");
      setIfDefined("highest_cert_url", uploadedHighest.secure_url);
    }
    if (files.tenthCert && files.tenthCert[0]) {
      const uploadedTenth = await uploadBufferToCloudinary(files.tenthCert[0], "home-care/nurses/tenth-cert");
      setIfDefined("tenth_cert_url", uploadedTenth.secure_url);
    }
  } catch (error) {
    console.error("CLOUDINARY UPLOAD ERROR:", error);
    setFlash(req, "error", "Cloudinary upload failed. Please check server logs.");
    return res.redirect("/nurse/profile/edit");
  }

  try {
    if (normalizedPhone) {
      await pool.query(
        "UPDATE users SET phone_number = $1 WHERE id = $2",
        [normalizedPhone, nurse.userId]
      );
    }

    const pickValue = (key) => (
      Object.prototype.hasOwnProperty.call(updateData, key) ? updateData[key] : null
    );

    if (profilePicDbColumn === "profile_pic_url") {
      await pool.query(
        `UPDATE nurses SET
          city = COALESCE($1, city),
          current_address = COALESCE($2, current_address),
          availability_status = COALESCE($3, availability_status),
          experience_years = COALESCE($4, experience_years),
          experience_months = COALESCE($5, experience_months),
          aadhaar_number = COALESCE($6, aadhaar_number),
          skills = COALESCE($7, skills),
          work_locations = COALESCE($8, work_locations),
          qualifications = COALESCE($9, qualifications),
          resume_url = COALESCE($10, resume_url),
          highest_cert_url = COALESCE($11, highest_cert_url),
          tenth_cert_url = COALESCE($12, tenth_cert_url),
          profile_pic_url = COALESCE($13, profile_pic_url)
        WHERE id = $14`,
        [
          pickValue("city"),
          pickValue("current_address"),
          pickValue("availability_status"),
          pickValue("experience_years"),
          pickValue("experience_months"),
          pickValue("aadhaar_number"),
          pickValue("skills"),
          pickValue("work_locations"),
          pickValue("qualifications"),
          pickValue("resume_url"),
          pickValue("highest_cert_url"),
          pickValue("tenth_cert_url"),
          pickValue("profile_pic_url"),
          nurse.id
        ]
      );
    } else {
      await pool.query(
        `UPDATE nurses SET
          city = COALESCE($1, city),
          current_address = COALESCE($2, current_address),
          availability_status = COALESCE($3, availability_status),
          experience_years = COALESCE($4, experience_years),
          experience_months = COALESCE($5, experience_months),
          aadhaar_number = COALESCE($6, aadhaar_number),
          skills = COALESCE($7, skills),
          work_locations = COALESCE($8, work_locations),
          qualifications = COALESCE($9, qualifications),
          resume_url = COALESCE($10, resume_url),
          highest_cert_url = COALESCE($11, highest_cert_url),
          tenth_cert_url = COALESCE($12, tenth_cert_url),
          profile_image_path = COALESCE($13, profile_image_path)
        WHERE id = $14`,
        [
          pickValue("city"),
          pickValue("current_address"),
          pickValue("availability_status"),
          pickValue("experience_years"),
          pickValue("experience_months"),
          pickValue("aadhaar_number"),
          pickValue("skills"),
          pickValue("work_locations"),
          pickValue("qualifications"),
          pickValue("resume_url"),
          pickValue("highest_cert_url"),
          pickValue("tenth_cert_url"),
          pickValue("profile_image_path"),
          nurse.id
        ]
      );
    }

    // Fetch updated raw nurse row
    const { rows } = await pool.query(
      "SELECT * FROM nurses WHERE id = $1",
      [nurse.id]
    );
    const updatedRawNurse = rows[0];

    // Calculate completion
    const completion = calculateProfileCompletion(updatedRawNurse);

    // Save completion
    await pool.query(
      "UPDATE nurses SET profile_completion = $1 WHERE id = $2",
      [completion, nurse.id]
    );
  } catch (error) {
    console.error("Error updating nurse profile:", error);
    setFlash(req, "error", "Unable to update profile right now. Please try again.");
    return res.redirect("/nurse/profile/edit");
  }

  const updatedNurse = await getNurseById(nurse.id);
  if (!updatedNurse) {
    setFlash(req, "error", "Unable to update profile right now. Please try again.");
    return res.redirect("/nurse/profile/edit");
  }

  const cacheStore = readStore();
  const cachedNurse = cacheStore.nurses.find((item) => item.id === updatedNurse.id);
  if (cachedNurse) {
    Object.assign(cachedNurse, updatedNurse);
  }

  if (!updatedNurse.tenthCertUrl || !updatedNurse.highestCertUrl) {
    setFlash(req, "success", "Profile updated. Upload both 10th marksheet and highest certificate to reach 100% completion.");
    return res.redirect("/nurse/profile");
  }

  setFlash(req, "success", "Profile updated successfully.");
  return res.redirect("/nurse/profile");
});

app.post("/nurse/profile/submit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  try {
    const nurseResult = await pool.query(
      `SELECT
         (to_jsonb(n) ->> 'aadhaar_card_url') AS aadhaar_card_url,
         n.skills
       FROM nurses n
       WHERE n.id = $1
       LIMIT 1`,
      [nurse.id]
    );

    const nurseRow = nurseResult.rows[0];
    if (!nurseRow) {
      setFlash(req, "error", "Nurse profile not found.");
      return res.redirect("/nurse/profile");
    }

    const aadhaarCardUrl = String(nurseRow.aadhaar_card_url || "").trim();
    const skills = Array.isArray(nurseRow.skills) ? nurseRow.skills : [];

    if (!aadhaarCardUrl) {
      setFlash(req, "error", "Aadhaar card upload is required before submitting profile.");
      return res.redirect("/nurse/profile");
    }

    if (skills.length < 3) {
      setFlash(req, "error", "Please add at least 3 skills before submitting profile.");
      return res.redirect("/nurse/profile");
    }

    await pool.query(
      `UPDATE nurses
       SET profile_status = $1,
           last_profile_update = NOW()
       WHERE id = $2`,
      ["pending", nurse.id]
    );

    setFlash(req, "success", "Profile submitted successfully.");
    return res.redirect("/nurse/profile");
  } catch (error) {
    console.error("Error submitting nurse profile:", error);
    setFlash(req, "error", "Unable to submit profile right now. Please try again.");
    return res.redirect("/nurse/profile");
  }
});

app.post("/nurse/profile/public", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  nurse.profileImageUrl = String(req.body.profileImageUrl || "").trim();
  nurse.publicBio = String(req.body.publicBio || "").trim();
  nurse.isAvailable = toBoolean(req.body.isAvailable);
  nurse.publicShowCity = toBoolean(req.body.publicShowCity);
  nurse.publicShowExperience = toBoolean(req.body.publicShowExperience);
  nurse.publicSkills = toArray(req.body.publicSkills).filter((skill) => SKILLS_OPTIONS.includes(skill));

  writeStore(store);
  setFlash(req, "success", "Public profile settings updated.");
  return res.redirect("/nurse/profile");
});

// Complete Nurse Profile Route
app.post("/nurse/profile/complete", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  // Update experience
  const experienceYears = Number.parseInt(req.body.experienceYears, 10);
  if (!Number.isNaN(experienceYears) && experienceYears >= 0 && experienceYears <= 60) {
    nurse.experienceYears = experienceYears;
  }

  // Update skills - new skills options
  const newSkillsOptions = [
    "Elderly Care",
    "ICU Experience",
    "Injection Specialist",
    "Post-Surgery Care",
    "Bedridden Care",
    "Child Care",
    "Palliative Care"
  ];
  nurse.skills = toArray(req.body.skills).filter((skill) => newSkillsOptions.includes(skill));

  // Update availability (shift preferences)
  const newAvailabilityOptions = [
    "Day Shift",
    "Night Shift",
    "24-Hour Live-in",
    "Part Time",
    "Full Time"
  ];
  nurse.availability = toArray(req.body.availability).filter((avail) => newAvailabilityOptions.includes(avail));

  // Update education level (optional)
  const educationLevel = String(req.body.educationLevel || "").trim();
  const validEducationLevels = ["10th Pass", "12th Pass", "GDA", "ANM", "GNM", "BSc Nursing", "MSc Nursing"];
  if (validEducationLevels.includes(educationLevel)) {
    nurse.educationLevel = educationLevel;
  } else {
    nurse.educationLevel = "";
  }

  // Note: File uploads (resume, certificate, profile image) would need additional handling
  // For now, we store the paths if provided via URL
  if (req.body.resumeUrl) {
    nurse.resumeUrl = String(req.body.resumeUrl).trim();
  }
  if (req.body.certificateUrl) {
    nurse.certificateUrl = String(req.body.certificateUrl).trim();
  }

  writeStore(store);
  setFlash(req, "success", "Profile details updated successfully!");
  return res.redirect("/nurse/profile");
});

// ============================================================
// EMAIL VERIFICATION ROUTES
// ============================================================

// Email verification page
app.get("/verify-email/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) {
    setFlash(req, "error", "Invalid verification link.");
    return res.redirect("/login");
  }

  const store = readNormalizedStore();
  const user = store.users.find((item) => item.verificationToken === token);

  if (!user) {
    setFlash(req, "error", "Invalid or expired verification link.");
    return res.redirect("/login");
  }

  // Mark email as verified
  user.emailVerified = true;
  user.verificationToken = "";
  writeStore(store);

  setFlash(req, "success", "Email verified successfully! You can now log in.");
  return res.redirect("/login");
});

// ============================================================
// PASSWORD RESET ROUTES
// ============================================================

// Forgot password page
app.get("/forgot-password", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("auth/forgot-password", {
    title: "Forgot Password",
    prefillEmail: String(req.query.email || "").trim()
  });
});

// Request password reset OTP
app.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
  const emailInput = String(req.body.email || "").trim();

  if (!emailInput) {
    setFlash(req, "error", "Please enter your email address.");
    return res.redirect("/forgot-password");
  }

  const emailValidation = validateEmail(emailInput);
  if (!emailValidation.valid) {
    setFlash(req, "error", "Please enter a valid email address.");
    return res.redirect("/forgot-password");
  }

  const email = emailValidation.value;

  req.session.canResetPassword = false;
  req.session.resetUserId = null;

  try {
    const result = await pool.query(
      `SELECT
        u.id,
        u.email,
        COALESCE(n.full_name, a.full_name, 'User') AS full_name
      FROM users u
      LEFT JOIN nurses n ON n.user_id = u.id
      LEFT JOIN agents a ON a.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1`,
      [email]
    );

    const user = result.rows[0] || null;
    if (user) {
      const resetOtp = generateOtp(); // always 6-digit numeric
      const resetOtpHash = await bcrypt.hash(resetOtp, 12);
      const resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await pool.query(
        `UPDATE users
         SET reset_otp_hash = $1, reset_otp_expires = $2
         WHERE id = $3`,
        [resetOtpHash, resetOtpExpires, user.id]
      );

      // Send reset OTP email (async fire-and-forget)
      sendResetPasswordEmail(user.email, user.full_name || "User", resetOtp).catch((error) => {
        console.error("Failed to send reset OTP email:", error);
      });
    }
  } catch (error) {
    console.error("Forgot-password flow error:", error);
  }

  // Always show success to prevent email enumeration
  setFlash(req, "success", "If an account exists with this email, a 6-digit OTP has been sent.");
  return res.redirect(`/forgot-password/verify?email=${encodeURIComponent(email)}`);
});

// OTP verification page for forgot-password flow
app.get("/forgot-password/verify", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }

  return res.render("auth/verify-reset-otp", {
    title: "Verify Reset OTP",
    email: String(req.query.email || "").trim()
  });
});

// Verify reset OTP and enable password reset session
app.post("/forgot-password/verify", async (req, res) => {
  const emailInput = String(req.body.email || "").trim();
  const emailValidation = validateEmail(emailInput);
  const fallbackRedirect = `/forgot-password/verify?email=${encodeURIComponent(emailInput)}`;

  if (!emailValidation.valid) {
    setFlash(req, "error", "Please enter a valid email address.");
    return res.redirect("/forgot-password");
  }

  const otpFromInput = String(req.body.otp || "").trim();
  const otpFromBoxes = [
    req.body.otp1, req.body.otp2, req.body.otp3,
    req.body.otp4, req.body.otp5, req.body.otp6
  ].map((digit) => String(digit || "").trim()).join("");
  const otp = otpFromInput || otpFromBoxes;

  if (!/^\d{6}$/.test(otp)) {
    setFlash(req, "error", "Please enter a valid 6-digit OTP.");
    return res.redirect(fallbackRedirect);
  }

  try {
    const userResult = await pool.query(
      `SELECT id, reset_otp_hash, reset_otp_expires
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [emailValidation.value]
    );

    const user = userResult.rows[0] || null;
    if (!user || !user.reset_otp_hash || !user.reset_otp_expires) {
      setFlash(req, "error", "Invalid or expired OTP.");
      return res.redirect(fallbackRedirect);
    }

    if (new Date(user.reset_otp_expires) < new Date()) {
      await pool.query(
        `UPDATE users
         SET reset_otp_hash = NULL, reset_otp_expires = NULL
         WHERE id = $1`,
        [user.id]
      );
      setFlash(req, "error", "OTP expired. Please request a new one.");
      return res.redirect("/forgot-password");
    }

    const isOtpValid = await bcrypt.compare(otp, user.reset_otp_hash);
    if (!isOtpValid) {
      setFlash(req, "error", "Invalid or expired OTP.");
      return res.redirect(fallbackRedirect);
    }

    // OTP verified: clear reset OTP and set secure reset session flags.
    await pool.query(
      `UPDATE users
       SET reset_otp_hash = NULL, reset_otp_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    req.session.canResetPassword = true;
    req.session.resetUserId = user.id;

    setFlash(req, "success", "OTP verified. Please set your new password.");
    return res.redirect("/reset-password");
  } catch (error) {
    console.error("Reset OTP verification error:", error);
    setFlash(req, "error", "Unable to verify OTP right now. Please try again.");
    return res.redirect(fallbackRedirect);
  }
});

// Reset password page - only available after OTP verification session
app.get("/reset-password", (req, res) => {
  if (!req.session.canResetPassword || !req.session.resetUserId) {
    setFlash(req, "error", "Unauthorized password reset attempt.");
    return res.redirect("/forgot-password");
  }
  return res.render("auth/reset-password", {
    title: "Reset Password"
  });
});

// Process password reset (OTP session protected)
app.post("/reset-password", async (req, res) => {
  if (!req.session.canResetPassword || !req.session.resetUserId) {
    setFlash(req, "error", "Unauthorized password reset attempt.");
    return res.redirect("/forgot-password");
  }

  const newPassword = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!newPassword || !confirmPassword) {
    setFlash(req, "error", "All fields are required.");
    return res.redirect("/reset-password");
  }

  if (newPassword !== confirmPassword) {
    setFlash(req, "error", "Passwords do not match.");
    return res.redirect("/reset-password");
  }

  if (newPassword.length < 6) {
    setFlash(req, "error", "Password must be at least 6 characters.");
    return res.redirect("/reset-password");
  }

  const resetUserId = Number(req.session.resetUserId);
  if (!Number.isInteger(resetUserId) || resetUserId <= 0) {
    setFlash(req, "error", "Unauthorized password reset attempt.");
    return res.redirect("/forgot-password");
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           reset_otp_hash = NULL,
           reset_otp_expires = NULL
       WHERE id = $2`,
      [passwordHash, resetUserId]
    );
  } catch (error) {
    console.error("Password reset update error:", error);
    setFlash(req, "error", "Unable to reset password right now. Please try again.");
    return res.redirect("/reset-password");
  }

  req.session.canResetPassword = false;
  req.session.resetUserId = null;

  return req.session.destroy((destroyError) => {
    if (destroyError) {
      console.error("Session destroy error after password reset:", destroyError);
    }
    return res.redirect("/login");
  });
});

// Legacy reset-link flow disabled (OTP-only production flow)
app.get("/reset-password/:token", (req, res) => {
  setFlash(req, "error", "Reset link flow is disabled. Please request a 6-digit OTP.");
  return res.redirect("/forgot-password");
});

app.post("/reset-password/:token", (req, res) => {
  setFlash(req, "error", "Unauthorized password reset attempt.");
  return res.redirect("/forgot-password");
});

// ============================================================
// CONCERN SYSTEM ROUTES
// ============================================================

// Raise concern page (for logged in users)
app.get("/concern/new", requireAuth, (req, res) => {
  return res.render("public/raise-concern", { title: "Raise Concern" });
});

// Submit concern
app.post("/concern/new", requireAuth, async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const message = String(req.body.message || "").trim();
  const category = String(req.body.category || "").trim();

  if (!subject || !message || !category) {
    setFlash(req, "error", "All fields are required.");
    return res.redirect("/concern/new");
  }

  if (!CONCERN_CATEGORIES.includes(category)) {
    setFlash(req, "error", "Invalid category.");
    return res.redirect("/concern/new");
  }

  const user = await getUserById(req.currentUser.id);

  if (!user) {
    setFlash(req, "error", "User not found.");
    return res.redirect("/");
  }

  // Get next ID for concern
  const store = readStore();
  const concernId = nextId(store, "concern");
  
  // Create concern object
  const concern = {
    id: concernId,
    userId: user.id,
    role: user.role,
    userName: user.fullName,
    subject,
    message,
    category,
    status: "Open",
    adminReply: "",
    createdAt: now(),
    updatedAt: now()
  };
  
  await createConcern(concern);

  // Send notification to admin (async) - using PostgreSQL admin email
  const adminEmail = "vikash27907@gmail.com";
  sendConcernNotification(adminEmail, {
    userName: user.fullName,
    role: user.role,
    subject,
    message,
    category,
    createdAt: concern.createdAt
  }).catch(err => {
    console.error("Failed to send admin notification:", err);
  });

  setFlash(req, "success", "Your concern has been submitted. We will get back to you shortly.");
  
  // Redirect based on role
  if (user.role === "nurse") return res.redirect("/nurse/profile");
  if (user.role === "agent") return res.redirect("/agent");
  if (user.role === "admin") return res.redirect("/admin/concerns");
  return res.redirect("/");
});

// User's concerns list
app.get("/my-concerns", requireAuth, (req, res) => {
  const store = readNormalizedStore();
  const concerns = getConcernsByUserId(store, req.currentUser.id);
  
  return res.render("public/my-concerns", { 
    title: "My Concerns",
    concerns
  });
});

// ============================================================
// ADMIN CONCERNS ROUTES
// ============================================================

// Admin concerns list
app.get("/admin/concerns", requireRole("admin"), (req, res) => {
  const statusFilter = String(req.query.status || "All");
  const store = readNormalizedStore();
  const concerns = getAllConcerns(store);
  
  const filteredConcerns = statusFilter === "All" 
    ? concerns 
    : concerns.filter(c => c.status === statusFilter);

  const openCount = getOpenConcernsCount(store);

  return res.render("admin/concerns", {
    title: "Manage Concerns",
    concerns: filteredConcerns,
    statusFilter,
    openCount
  });
});

// Admin update concern status
app.post("/admin/concerns/:id/update", requireRole("admin"), (req, res) => {
  const concernId = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "").trim();
  const adminReply = String(req.body.adminReply || "").trim();
  const statusFilter = String(req.body.statusFilter || "All");

  if (!CONCERN_STATUSES.includes(status)) {
    setFlash(req, "error", "Invalid status.");
    return res.redirect(`/admin/concerns?status=${encodeURIComponent(statusFilter)}`);
  }

  const store = readNormalizedStore();
  const concern = store.concerns.find((item) => item.id === concernId);

  if (!concern) {
    setFlash(req, "error", "Concern not found.");
    return res.redirect(`/admin/concerns?status=${encodeURIComponent(statusFilter)}`);
  }

  concern.status = status;
  concern.adminReply = adminReply;
  concern.updatedAt = now();
  writeStore(store);

  setFlash(req, "success", "Concern updated successfully.");
  return res.redirect(`/admin/concerns?status=${encodeURIComponent(statusFilter)}`);
});

// ============================================================
// OTP VERIFICATION FOR REQUEST EDITS
// ============================================================

// In-memory OTP store (for production, use Redis or database)
// Format: { requestId: { otp: "123456", expiresAt: Date } }
const otpStore = new Map();

// OTP expiry time in milliseconds (5 minutes)
const OTP_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Generate a 6-digit numeric OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP for a request
 */
function storeOTP(requestId, otp) {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  otpStore.set(requestId, { otp, expiresAt });
}

/**
 * Validate OTP for a request
 */
function validateOTP(requestId, otp) {
  const record = otpStore.get(requestId);
  if (!record) {
    return { valid: false, error: "OTP expired or not found. Please request a new OTP." };
  }
  
  if (new Date() > record.expiresAt) {
    otpStore.delete(requestId);
    return { valid: false, error: "OTP has expired. Please request a new OTP." };
  }
  
  if (record.otp !== otp) {
    return { valid: false, error: "Invalid OTP. Please try again." };
  }
  
  // OTP is valid - delete it after successful verification
  otpStore.delete(requestId);
  return { valid: true };
}

/**
 * Send OTP to user's email
 */
async function sendOTP(email, requestId, fullName) {
  const otp = generateOTP();
  storeOTP(requestId, otp);
  
  // For now, log the OTP (in production, send via email)
  console.log(`OTP for request ${requestId}: ${otp}`);
  
  // Simulate successful OTP sending
  return { success: true };
}

// Step 1: Request OTP for editing a request
app.get("/edit-request/:requestId", (req, res) => {
  const { requestId } = req.params;
  
  const store = readNormalizedStore();
  const request = store.patients.find(p => p.requestId === requestId);
  
  if (!request) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }
  
  // Show OTP request form
  res.render("public/request-otp", {
    title: "Verify Your Identity",
    requestId,
    request
  });
});

// Step 2: Send OTP to user's email
app.post("/edit-request/:requestId/send-otp", loginRateLimiter, async (req, res) => {
  const { requestId } = req.params;
  
  const store = readNormalizedStore();
  const request = store.patients.find(p => p.requestId === requestId);
  
  if (!request) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }
  
  // Send OTP to the registered email
  const result = await sendOTP(request.email, requestId, request.fullName);
  
  if (result.success) {
    setFlash(req, "success", `OTP sent to ${request.email}. Please check your inbox.`);
    res.redirect(`/edit-request/${requestId}/verify`);
  } else {
    setFlash(req, "error", `Failed to send OTP: ${result.error}`);
    res.redirect(`/edit-request/${requestId}`);
  }
});

// Step 3: Verify OTP and show edit form
app.get("/edit-request/:requestId/verify", (req, res) => {
  const { requestId } = req.params;
  
  const store = readNormalizedStore();
  const request = store.patients.find(p => p.requestId === requestId);
  
  if (!request) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }
  
  res.render("public/request-edit", {
    title: "Edit Request",
    request,
    serviceScheduleOptions: SERVICE_SCHEDULE_OPTIONS
  });
});

// Step 4: Verify OTP and process edit
app.post("/edit-request/:requestId/verify", (req, res) => {
  const { requestId } = req.params;
  const { otp } = req.body;
  
  const otpValidation = validateOTP(requestId, otp);
  
  if (!otpValidation.valid) {
    setFlash(req, "error", otpValidation.error);
    return res.redirect(`/edit-request/${requestId}`);
  }
  
  // OTP is valid - redirect to edit form with verification flag
  res.redirect(`/edit-request/${requestId}/form`);
});

// Step 5: Show the actual edit form (after OTP verification)
app.get("/edit-request/:requestId/form", (req, res) => {
  const { requestId } = req.params;
  
  const store = readNormalizedStore();
  const request = store.patients.find(p => p.requestId === requestId);
  
  if (!request) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }
  
  res.render("public/request-edit", {
    title: "Edit Request",
    request,
    serviceScheduleOptions: SERVICE_SCHEDULE_OPTIONS,
    verified: true
  });
});

// Step 6: Process the edit request
app.post("/edit-request/:requestId/update", (req, res) => {
  const { requestId } = req.params;
  const { serviceSchedule, duration, notes } = req.body;
  
  const store = readNormalizedStore();
  const requestIndex = store.patients.findIndex(p => p.requestId === requestId);
  
  if (requestIndex === -1) {
    setFlash(req, "error", "Request not found.");
    return res.redirect("/track-request");
  }
  
  const request = store.patients[requestIndex];
  
  // Update only allowed fields
  request.serviceSchedule = serviceSchedule;
  request.duration = duration;
  request.notes = notes;
  request.updatedAt = now();
  
  writeStore(store);
  
  setFlash(req, "success", "Your request has been updated successfully.");
  res.redirect(`/track-request?requestId=${requestId}`);
});

// ============================================================
// ADMIN USER MANAGEMENT ROUTES
// ============================================================

// Admin view user profile
app.get("/admin/user/view/:role/:id", requireRole("admin"), (req, res) => {
  const role = String(req.params.role || "");
  const userId = Number.parseInt(req.params.id, 10);
  
  if (!["nurse", "agent"].includes(role) || Number.isNaN(userId)) {
    return res.status(404).render("shared/not-found", { title: "Not Found" });
  }

  const store = readNormalizedStore();
  
  if (role === "nurse") {
    const nurse = store.nurses.find((item) => item.id === userId);
    if (!nurse) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }
    const user = store.users.find((item) => item.id === nurse.userId);
    const concerns = getConcernsByUserId(store, nurse.userId);
    
    return res.render("admin/view-nurse", {
      title: "View Nurse",
      nurse,
      user,
      concerns,
      maskedAadhar: maskAadhar(nurse.aadharNumber)
    });
  }
  
  if (role === "agent") {
    const agent = store.agents.find((item) => item.id === userId);
    if (!agent) {
      return res.status(404).render("shared/not-found", { title: "Agent Not Found" });
    }
    const user = store.users.find((item) => item.id === agent.userId);
    const concerns = getConcernsByUserId(store, agent.userId);
    
    return res.render("admin/view-agent", {
      title: "View Agent",
      agent,
      user,
      concerns
    });
  }

  return res.status(404).render("shared/not-found", { title: "Not Found" });
});

// Admin reset user password
app.post("/admin/user/:id/reset-password", requireRole("admin"), async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  
  if (Number.isNaN(userId)) {
    setFlash(req, "error", "Invalid user.");
    return res.redirect("/admin/nurses");
  }

  const user = await getUserById(userId);

  if (!user) {
    setFlash(req, "error", "User not found.");
    return res.redirect("/admin/nurses");
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  const updatedUser = await updateUser(user.id, { passwordHash: bcrypt.hashSync(tempPassword, 10) });
  if (!updatedUser) {
    setFlash(req, "error", "Unable to reset password right now.");
    return res.redirect("/admin/nurses");
  }

  // Show temp password (in production, would send via secure channel)
  setFlash(req, "success", `Password reset successful! Temporary password: ${tempPassword}`);
  
  // Redirect based on role
  if (user.role === "nurse") return res.redirect("/admin/nurses");
  if (user.role === "agent") return res.redirect("/admin/agents");
  return res.redirect("/admin");
});

// Admin toggle email verification
app.post("/admin/user/:id/verify-email", requireRole("admin"), (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  
  if (Number.isNaN(userId)) {
    setFlash(req, "error", "Invalid user.");
    return res.redirect("/admin/nurses");
  }

  const store = readNormalizedStore();
  const user = store.users.find((item) => item.id === userId);

  if (!user) {
    setFlash(req, "error", "User not found.");
    return res.redirect("/admin/nurses");
  }

  // Toggle email verified status
  user.emailVerified = !user.emailVerified;
  writeStore(store);

  const status = user.emailVerified ? "verified" : "unverified";
  setFlash(req, "success", `Email ${status} status updated.`);
  
  if (user.role === "nurse") return res.redirect("/admin/nurses");
  if (user.role === "agent") return res.redirect("/admin/agents");
  return res.redirect("/admin");
});

// Admin delete user account
app.post("/admin/user/:id/delete", requireRole("admin"), (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  
  if (Number.isNaN(userId)) {
    setFlash(req, "error", "Invalid user.");
    return res.redirect("/admin/nurses");
  }

  const store = readNormalizedStore();
  const user = store.users.find((item) => item.id === userId);

  if (!user) {
    setFlash(req, "error", "User not found.");
    return res.redirect("/admin/nurses");
  }

  // Don't allow deleting admin
  if (user.role === "admin") {
    setFlash(req, "error", "Cannot delete admin account.");
    return res.redirect("/admin");
  }

  // Remove from nurses or agents
  if (user.role === "nurse") {
    store.nurses = store.nurses.filter((item) => item.userId !== userId);
  } else if (user.role === "agent") {
    store.agents = store.agents.filter((item) => item.userId !== userId);
  }

  // Remove user
  store.users = store.users.filter((item) => item.id !== userId);
  writeStore(store);

  setFlash(req, "success", "User account deleted successfully.");
  
  if (user.role === "nurse") return res.redirect("/admin/nurses");
  if (user.role === "agent") return res.redirect("/admin/agents");
  return res.redirect("/admin");
});

// 404 handler
app.use((req, res) => {
  return res.status(404).render("shared/not-found", { title: "Page Not Found" });
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = { pool };

async function startServer() {
  try {
    const { migrateNurseProfileColumns } = require("./scripts/migrate-profile");
    await migrateNurseProfileColumns();
    await initializeDatabase();
    await initializeStore();
    await ensureAdmin();

    app.listen(PORT, "0.0.0.0", () => {
      // eslint-disable-next-line no-console
      console.log(`Prisha Home Care running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize:", error);
    process.exit(1);
  }
}

startServer();


