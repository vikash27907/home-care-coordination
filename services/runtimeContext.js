
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
  getUserById, getUserByEmail, getUserByPhone, getUserByUniqueId, createUser, updateUser, deleteUser, getUsers,
  // Nurse helpers  
  getNurseById, getNurseByUserId, getNurseByEmail, getNurseByProfileSlug, createNurse, updateNurse, deleteNurse, getNurses,
  // Agent helpers
  getAgentById, getAgentByEmail, createAgent, updateAgent, deleteAgent, getAgents,
  // Patient helpers
  getPatientById, createPatient, updatePatient, deletePatient, getPatients,
  // Concern helpers
  getConcernById, createConcern, updateConcern, deleteConcern, getConcerns
} = require("../src/store");
const {
  sendCareRequestEmail,
  sendVerificationEmail,
  sendVerificationOtpEmail,
  sendAgentVerificationOtpEmail,
  sendResetPasswordEmail,
  sendConcernNotification,
  sendAdminCareRequestNotification,
  sendAdminNurseSignupNotification
} = require("../src/email");
const { initializeDatabase } = require("../src/schema");
const { pool } = require("../src/db");
const { cloudinary } = require("../src/cloudinary");
const generateQR = require("../src/utils/qr");
const { normalizePhone: normalizePhoneValue } = require("../utils/phone");
const fs = require("fs");

const COMPANY_PHONE = "9138913355";
const COMPANY_EMAIL = "prishahomecare@gmail.com";

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
const RESUME_DIR = path.join(UPLOAD_DIR, "resume");
const CERTIFICATES_DIR = path.join(UPLOAD_DIR, "certificates");

// Ensure upload directories exist
[UPLOAD_DIR, RESUME_DIR, CERTIFICATES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function extractCloudinaryPublicId(assetUrl) {
  if (typeof assetUrl !== "string" || !assetUrl.trim()) return null;

  try {
    const parsedUrl = new URL(assetUrl);
    if (parsedUrl.hostname !== "res.cloudinary.com") return null;

    const uploadMarker = "/upload/";
    const uploadIndex = parsedUrl.pathname.indexOf(uploadMarker);
    if (uploadIndex === -1) return null;

    let publicId = parsedUrl.pathname.slice(uploadIndex + uploadMarker.length);
    publicId = publicId.replace(/^v\d+\//, "");

    const extensionIndex = publicId.lastIndexOf(".");
    const slashIndex = publicId.lastIndexOf("/");
    if (extensionIndex > slashIndex) {
      publicId = publicId.slice(0, extensionIndex);
    }

    return publicId || null;
  } catch (error) {
    return null;
  }
}

async function deleteCloudinaryAssetByUrl(assetUrl) {
  const publicId = extractCloudinaryPublicId(assetUrl);
  if (!publicId) return;

  for (const resourceType of ["image", "raw", "video"]) {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate: true
      });
    } catch (error) {
      console.error(`Cloudinary delete failed for ${publicId} (${resourceType}):`, error);
    }
  }
}

async function deleteLocalAsset(localPathOrUrl) {
  if (typeof localPathOrUrl !== "string" || !localPathOrUrl.trim()) return;
  if (/^https?:\/\//i.test(localPathOrUrl)) return;

  let resolvedPath = null;
  if (path.isAbsolute(localPathOrUrl)) {
    resolvedPath = localPathOrUrl;
  } else if (localPathOrUrl.startsWith("/uploads/")) {
    resolvedPath = path.join(process.cwd(), localPathOrUrl.replace(/^\/+/, ""));
  } else if (localPathOrUrl.startsWith("uploads/")) {
    resolvedPath = path.join(process.cwd(), localPathOrUrl);
  }

  if (!resolvedPath) return;

  const absoluteResolvedPath = path.resolve(resolvedPath);
  const workspaceRoot = path.resolve(process.cwd());
  if (!absoluteResolvedPath.toLowerCase().startsWith(workspaceRoot.toLowerCase())) {
    return;
  }

  try {
    await fs.promises.unlink(absoluteResolvedPath);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      console.error(`Local file delete failed for ${absoluteResolvedPath}:`, error);
    }
  }
}

function collectNurseAssetUrls(nurseRow) {
  const qualificationAssets = Array.isArray(nurseRow && nurseRow.qualifications)
    ? nurseRow.qualifications.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      return [
        item.certificate_url,
        item.certificateUrl,
        item.document_url,
        item.documentUrl,
        item.file_url,
        item.fileUrl
      ];
    })
    : [];

  return Array.from(new Set(
    [
      nurseRow && nurseRow.profile_image_url,
      nurseRow && nurseRow.profile_image_path,
      nurseRow && nurseRow.resume_url,
      nurseRow && nurseRow.aadhar_image_url,
      nurseRow && nurseRow.aadhar_front_url,
      nurseRow && nurseRow.aadhar_back_url,
      nurseRow && nurseRow.certificate_url,
      ...qualificationAssets
    ]
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith("/images/"))
  ));
}

async function deleteNurseAssets(assetUrls) {
  for (const assetUrl of assetUrls) {
    await deleteCloudinaryAssetByUrl(assetUrl);
    await deleteLocalAsset(assetUrl);
  }
}









// Forgot-password rate limiter - protects against OTP abuse and enumeration attempts
const forgotPasswordRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: "Too many password reset requests. Please try again in 10 minutes.",
  standardHeaders: true,
  legacyHeaders: false
});

const PROFILE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_UPLOAD_ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);
const PROFILE_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpg",
  "image/jpeg",
  "image/png",
  "image/webp"
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
}).any();

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

const AGENT_NURSE_IMAGE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AGENT_NURSE_IMAGE_ALLOWED_MIME_TYPES = new Set([
  "image/jpg",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getAgentNurseImageExtension(file) {
  const originalExtension = path.extname(String(file && file.originalname ? file.originalname : "")).toLowerCase();
  if (AGENT_NURSE_IMAGE_ALLOWED_EXTENSIONS.has(originalExtension)) {
    return originalExtension;
  }

  const mimeType = String(file && file.mimetype ? file.mimetype : "").toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

function validateAgentNurseImageFile(file) {
  if (!file) {
    return { valid: true };
  }

  const mimeType = String(file.mimetype || "").toLowerCase();
  const extension = getAgentNurseImageExtension(file);
  if (!AGENT_NURSE_IMAGE_ALLOWED_MIME_TYPES.has(mimeType) || !extension) {
    return { valid: false, error: "Upload a JPG, PNG, or WebP image for the nurse photo." };
  }

  return { valid: true, extension };
}

async function saveAgentNurseImageFile(file) {
  const validation = validateAgentNurseImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid nurse profile image.");
  }

  const directory = path.join(UPLOAD_DIR, "agent-nurse-docs");
  await fs.promises.mkdir(directory, { recursive: true });

  const filename = `nurse-profile-${Date.now()}-${crypto.randomInt(100000000, 999999999)}${validation.extension}`;
  const absolutePath = path.join(directory, filename);
  await fs.promises.writeFile(absolutePath, file.buffer);
  return `/uploads/agent-nurse-docs/${filename}`;
}




const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === "production";

function getAppBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_URL || "").trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }
  return `${req.protocol}://${req.get("host")}`;
}

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
  const cleaned = normalizePhoneValue(phone);
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

  if (
    nurse.aadhaar_card_url
    || nurse.aadhar_image_url
    || nurse.aadhaar_image_url
    || nurse.aadhar_card_url
    || nurse.aadhar_front_url
    || nurse.aadhaar_front_url
    || nurse.aadhar_back_url
    || nurse.aadhaar_back_url
  ) completion += 15;
  if (nurse.skills && nurse.skills.length >= 3) completion += 15;
  if (nurse.experience_years > 0 || nurse.experience_months > 0) completion += 10;
  if (nurse.expected_salary) completion += 10;

  // Check for new qualification system with individual certificates
  const hasQualificationCertificate =
    Array.isArray(nurse.qualifications) &&
    nurse.qualifications.some(q => q.certificate_url);

  if (hasQualificationCertificate) completion += 15;

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



const NURSE_STATUSES = ["Pending", "Approved", "Rejected"];
const AGENT_STATUSES = ["pending", "approved", "rejected", "deleted"];
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
const CARE_REQUEST_STATUSES = [
  "open",
  "assigned",
  "payment_pending",
  "active",
  "completed",
  "cancelled"
];
const CARE_REQUEST_PAYMENT_STATUSES = ["pending", "paid", "refunded"];
const CARE_REQUEST_EARNINGS_PAYOUT_STATUSES = ["pending", "approved", "paid", "on_hold", "cancelled"];
const CARE_REQUEST_MARKETPLACE_TABS = [
  "open",
  "assigned",
  "payment_pending",
  "active",
  "completed",
  "cancelled"
];
const CARE_REQUEST_TRANSITIONS = {
  open: new Set(["assigned", "cancelled"]),
  assigned: new Set(["open", "payment_pending", "active", "cancelled"]),
  payment_pending: new Set(["assigned", "active", "cancelled"]),
  active: new Set(["open", "completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set()
};

const NURSE_STATUS_INPUT_MAP = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected"
};
const PROFILE_CURRENT_STATUS_OPTIONS = [
  "Available for Work",
  "Currently Working",
  "Open to Opportunities",
  "Not Available"
];

function normalizeNurseStatusInput(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return NURSE_STATUS_INPUT_MAP[normalized] || "";
}

function normalizeAgentStatusInput(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return AGENT_STATUSES.includes(normalized) ? normalized : "";
}

function isApprovedAgentStatus(value) {
  return normalizeAgentStatusInput(value) === "approved";
}

function normalizeCurrentStatusInput(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const normalized = clean.toLowerCase();
  if (normalized === "open for work" || normalized === "available" || normalized === "available for work") {
    return "Available for Work";
  }
  if (normalized === "currently working") {
    return "Currently Working";
  }
  if (
    normalized === "working but looking for change"
    || normalized === "working need change"
    || normalized === "open to opportunities"
  ) {
    return "Open to Opportunities";
  }
  if (normalized === "not available" || normalized === "unavailable") {
    return "Not Available";
  }
  return PROFILE_CURRENT_STATUS_OPTIONS.includes(clean) ? clean : "";
}

function normalizeCareRequestStatusInput(value) {
  const status = String(value || "").trim().toLowerCase();
  return CARE_REQUEST_STATUSES.includes(status) ? status : "";
}

function normalizeCareRequestPaymentStatusInput(value) {
  const paymentStatus = String(value || "").trim().toLowerCase();
  return CARE_REQUEST_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "";
}

function normalizeCareRequestPayoutStatusInput(value) {
  const payoutStatus = String(value || "").trim().toLowerCase();
  return CARE_REQUEST_EARNINGS_PAYOUT_STATUSES.includes(payoutStatus) ? payoutStatus : "";
}

function canTransitionCareRequestStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowedTransitions = CARE_REQUEST_TRANSITIONS[currentStatus];
  return Boolean(allowedTransitions && allowedTransitions.has(nextStatus));
}

const SERVICE_SCHEDULE_OPTIONS = [
  { value: "8 Hour Shift", label: "8 Hour Shift" },
  { value: "12 Hour Shift (Day)", label: "12 Hour Shift (Day)" },
  { value: "12 Hour Shift (Night)", label: "12 Hour Shift (Night)" },
  { value: "24 Hour Live-In", label: "24 Hour Live-In" },
  { value: "One-Time / Few Visits", label: "One-Time / Few Visits" }
];

// Valid service schedule values (must match request form options exactly)
const VALID_SERVICE_SCHEDULES = SERVICE_SCHEDULE_OPTIONS.map((option) => option.value);

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
  "8 Hour Shift",
  "12 Hour Shift (Day)",
  "12 Hour Shift (Night)",
  "24 Hour Live-In",
  "One-Time / Few Visits"
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

const MASTER_SKILL_OPTIONS = [
  "Elderly Care",
  "Bedridden Care",
  "Feeding Assistance",
  "Bathing Assistance",
  "Patient Hygiene",
  "Mobility Support",
  "Wheelchair Assistance",
  "Post Hospital Care",
  "Toileting Assistance",
  "Oral Care",
  "Grooming Assistance",
  "Transfer Assistance",
  "Fall Prevention",
  "Pressure Area Care",
  "Companionship Care",
  "Medication Reminder",
  "Meal Preparation Support",
  "Home Safety Monitoring",
  "Daily Living Assistance",
  "Vitals Chart Maintenance",
  "ICU Care",
  "Ventilator Handling",
  "Oxygen Therapy",
  "Nebulization",
  "Injection Administration",
  "IV Cannulation",
  "Wound Dressing",
  "Catheter Care",
  "Tracheostomy Care",
  "Ryles Tube Feeding",
  "Blood Pressure Monitoring",
  "Blood Sugar Monitoring",
  "ECG Monitoring",
  "Suctioning",
  "CPR Certified",
  "BLS Certified",
  "First Aid",
  "Pulse Oximetry Monitoring",
  "Temperature Monitoring",
  "Urine Output Monitoring",
  "Stoma Care",
  "Colostomy Care",
  "NG Tube Care",
  "PEG Tube Care",
  "Insulin Administration",
  "Medication Administration",
  "Pain Assessment",
  "Fluid Balance Monitoring",
  "Seizure Management",
  "Emergency Response",
  "Aseptic Technique",
  "Infection Control",
  "Sterilization Protocols",
  "Sample Collection",
  "Phlebotomy Assistance",
  "Infusion Pump Handling",
  "Syringe Pump Handling",
  "Central Line Care",
  "PICC Line Care",
  "Post Operative Monitoring",
  "Pediatric Care",
  "Newborn Care",
  "Postnatal Care",
  "Dementia Care",
  "Alzheimer's Care",
  "Palliative Care",
  "Oncology Care",
  "Stroke Care",
  "Parkinson's Care",
  "Dialysis Assistance",
  "Bed Sore Management",
  "Post-Surgery Recovery",
  "Cancer Patient Care",
  "Orthopedic Care",
  "Psychiatric Patient Care",
  "Geriatric Care",
  "Neurology Care",
  "Cardiac Care",
  "COPD Care",
  "Asthma Care",
  "Diabetes Care",
  "Hypertension Care",
  "Renal Care",
  "Liver Disease Care",
  "End of Life Care",
  "Hospice Care",
  "Bariatric Care",
  "Spinal Cord Injury Care",
  "Paralysis Care",
  "Autism Care",
  "Special Needs Care",
  "Burn Care",
  "Fracture Care",
  "Post Stroke Rehabilitation Support",
  "Speech Therapy Support",
  "Occupational Therapy Support",
  "8 Hour Shift Care",
  "12 Hour Shift Care",
  "24 Hour Live-In Care",
  "Night Shift Care",
  "Day Shift Care",
  "Weekend Shift Care",
  "Live-In Attendant Care",
  "Home Visit Care",
  "Respite Care",
  "Travel Escort Care",
  "Hospital Attendant Service",
  "Discharge Transition Care",
  "Bedside Attendant Care",
  "Companion Care",
  "Recovery Room Support",
  "Patient Counseling Support",
  "Family Education Support",
  "Care Plan Coordination",
  "Medical Record Documentation",
  "Telehealth Assistance",
  "Appointment Coordination",
  "Ambulation Support",
  "Physiotherapy Assistance",
  "Respiratory Exercise Support",
  "Range of Motion Exercises",
  "Nutrition Monitoring",
  "Hydration Monitoring",
  "Sleep Monitoring",
  "Behavioral Observation",
  "Delirium Monitoring",
  "Isolation Care",
  "Home Equipment Handling",
  "Walker Assistance",
  "Commode Assistance",
  "Lifting and Positioning"
];

const PROFILE_QUALIFICATION_OPTIONS = [
  "10th (SSC)",
  "12th (HSC)",
  "ANM",
  "GNM",
  "BSc Nursing",
  "MSc Nursing",
  "GDA"
];


function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalizePhoneValue(value);
}

function normalizeUniqueLoginId(value) {
  const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^PHC[NA]\d+$/.test(compact)) {
    return "";
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function isPasswordLoginPhone(value) {
  return /^[6-9]\d{9}$/.test(String(value || "").trim());
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
  return crypto.randomInt(100000, 1000000).toString();
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

async function generateUniquePublicRequestCode() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const year = new Date().getFullYear();
    const randomNum = crypto.randomInt(100000, 1000000);
    const requestCode = `REQ-${year}-${randomNum}`;
    const collisionResult = await pool.query(
      `SELECT EXISTS (
          SELECT 1 FROM patients WHERE LOWER(request_id) = LOWER($1)
          UNION ALL
          SELECT 1 FROM care_requests WHERE LOWER(request_code) = LOWER($1)
        ) AS exists`,
      [requestCode]
    );
    if (!collisionResult.rows[0] || collisionResult.rows[0].exists !== true) {
      return requestCode;
    }
  }

  throw new Error("Unable to generate a unique request code.");
}

async function generateUniqueCareRequestEditToken() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const editToken = crypto.randomInt(100000, 1000000).toString();
    const collisionResult = await pool.query(
      "SELECT 1 FROM care_requests WHERE edit_token = $1 LIMIT 1",
      [editToken]
    );
    if (!collisionResult.rows.length) {
      return editToken;
    }
  }

  throw new Error("Unable to generate a unique edit token.");
}

function formatCareRequestDuration(durationValue, durationUnit, fallbackDuration) {
  const fallback = String(fallbackDuration || "").trim();
  if (fallback) {
    return fallback;
  }

  const numericValue = Number.parseInt(durationValue, 10);
  const unit = String(durationUnit || "").trim();
  if (!Number.isNaN(numericValue) && numericValue > 0 && unit) {
    return `${numericValue} ${unit}`;
  }

  return "";
}

function mapPublicCareRequestRow(row) {
  if (!row) return null;

  const budgetValue = row.budget !== null && typeof row.budget !== "undefined"
    ? Number(row.budget)
    : null;
  const duration = formatCareRequestDuration(row.duration_value, row.duration_unit, row.duration);

  return {
    careRequestId: row.care_request_id,
    patientId: row.patient_id,
    requestId: row.request_code,
    requestCode: row.request_code,
    editToken: row.edit_token || "",
    fullName: row.full_name || "",
    email: row.email || "",
    phoneNumber: row.phone_number || "",
    city: row.city || "",
    serviceSchedule: row.service_schedule || "",
    duration,
    durationValue: !Number.isNaN(Number.parseInt(row.duration_value, 10))
      ? Number.parseInt(row.duration_value, 10)
      : "",
    durationUnit: String(row.duration_unit || "months").trim() || "months",
    budget: Number.isFinite(budgetValue) ? budgetValue : null,
    notes: row.notes || "",
    status: row.care_request_status || row.patient_status || "open",
    paymentStatus: row.payment_status || "pending",
    createdAt: row.care_request_created_at || row.patient_created_at || null
  };
}

async function getPublicCareRequestRecordByRequestCode(requestCode) {
  const lookupValue = String(requestCode || "").trim();
  if (!lookupValue) return null;

  const result = await pool.query(
    `SELECT
        cr.id AS care_request_id,
        p.id AS patient_id,
        COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
        cr.edit_token,
        p.full_name,
        p.email,
        p.phone_number,
        p.city,
        p.service_schedule,
        p.duration,
        COALESCE(p.duration_value, cr.duration_value) AS duration_value,
        COALESCE(NULLIF(p.duration_unit, ''), cr.duration_unit) AS duration_unit,
        COALESCE(NULLIF(p.notes, ''), cr.care_type, '') AS notes,
        COALESCE(NULLIF(p.budget, 0), NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), 0) AS budget,
        cr.status AS care_request_status,
        cr.payment_status,
        p.status AS patient_status,
        cr.created_at AS care_request_created_at,
        p.created_at AS patient_created_at
     FROM care_requests cr
     LEFT JOIN patients p ON p.id = cr.patient_id
     WHERE LOWER(COALESCE(cr.request_code, '')) = LOWER($1)
        OR LOWER(COALESCE(p.request_id, '')) = LOWER($1)
     ORDER BY cr.created_at DESC
     LIMIT 1`,
    [lookupValue]
  );

  return mapPublicCareRequestRow(result.rows[0]);
}

async function getPublicCareRequestRecordByEditToken(editToken) {
  const lookupValue = String(editToken || "").trim();
  if (!lookupValue) return null;

  const result = await pool.query(
    `SELECT
        cr.id AS care_request_id,
        p.id AS patient_id,
        COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
        cr.edit_token,
        p.full_name,
        p.email,
        p.phone_number,
        p.city,
        p.service_schedule,
        p.duration,
        COALESCE(p.duration_value, cr.duration_value) AS duration_value,
        COALESCE(NULLIF(p.duration_unit, ''), cr.duration_unit) AS duration_unit,
        COALESCE(NULLIF(p.notes, ''), cr.care_type, '') AS notes,
        COALESCE(NULLIF(p.budget, 0), NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), 0) AS budget,
        cr.status AS care_request_status,
        cr.payment_status,
        p.status AS patient_status,
        cr.created_at AS care_request_created_at,
        p.created_at AS patient_created_at
     FROM care_requests cr
     LEFT JOIN patients p ON p.id = cr.patient_id
     WHERE cr.edit_token = $1
     ORDER BY cr.created_at DESC
     LIMIT 1`,
    [lookupValue]
  );

  return mapPublicCareRequestRow(result.rows[0]);
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

// Middleware to add admin context (open concerns count) to all views for admin users
function adminContextMiddleware(req, res, next) {
  // Only add this for admin users
  if (req.currentUser && req.currentUser.role === "admin") {
    const store = readNormalizedStore();
    res.locals.openConcerns = getOpenConcernsCount(store);
  }
  return next();
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
  return store.agents.filter((agent) => isApprovedAgentStatus(agent.status) && !isStoreUserDeleted(store, agent.userId));
}

function getHomeLinkForUser(userOrRole) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole && userOrRole.role;
  if (role === "nurse") return "/nurse/dashboard";
  if (role === "agent") return "/agent/dashboard";
  if (role === "admin") return "/admin";
  return "/";
}

function redirectByRole(role) {
  return getHomeLinkForUser(role);
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

function isStoreUserDeleted(store, userId) {
  if (userId === null || typeof userId === "undefined") {
    return false;
  }
  const user = Array.isArray(store.users)
    ? store.users.find((item) => item.id === userId)
    : null;
  return Boolean(user && user.isDeleted);
}

function hasRegisteredPhone(store, phone, excludeUserId = null) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return false;
  }

  if (store.users.some((user) => !user.isDeleted && normalizePhone(user.phoneNumber) === normalized && (excludeUserId === null || user.id !== excludeUserId))) {
    return true;
  }
  if (store.agents.some((agent) => !isStoreUserDeleted(store, agent.userId) && normalizePhone(agent.phoneNumber) === normalized && (excludeUserId === null || agent.userId !== excludeUserId))) {
    return true;
  }
  if (store.nurses.some((nurse) => !isStoreUserDeleted(store, nurse.userId) && normalizePhone(nurse.phoneNumber) === normalized && (excludeUserId === null || nurse.userId !== excludeUserId))) {
    return true;
  }
  return false;
}

function hasRegisteredEmail(store, email, excludeUserId = null) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  if (store.users.some((user) => !user.isDeleted && user.email === normalized && (excludeUserId === null || user.id !== excludeUserId))) {
    return true;
  }
  if (store.agents.some((agent) => !isStoreUserDeleted(store, agent.userId) && agent.email === normalized && (excludeUserId === null || agent.userId !== excludeUserId))) {
    return true;
  }
  if (store.nurses.some((nurse) => !isStoreUserDeleted(store, nurse.userId) && nurse.email === normalized && (excludeUserId === null || nurse.userId !== excludeUserId))) {
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
  const qualifications = Array.isArray(nurse.qualifications) ? nurse.qualifications : [];
  const qualificationNames = qualifications
    .map((item) => (item && typeof item === "object" ? item.name : item))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const experienceYears = Number.parseInt(nurse.experienceYears, 10) || 0;
  const availabilityLabel = String(
    nurse.availabilityLabel
    || nurse.availability_label
    || nurse.currentStatus
    || nurse.current_status
    || (nurse.isAvailable === false ? "Unavailable" : "Available")
    || "Available"
  ).trim();

  return {
    id: nurse.id,
    fullName: nurse.fullName,
    city: nurse.publicShowCity ? nurse.city : "Not shared",
    religion: String(nurse.religion || "").trim(),
    experienceYears: nurse.publicShowExperience ? experienceYears : null,
    experienceText: nurse.publicShowExperience ? `${experienceYears} Years` : "Not shared",
    qualifications: qualificationNames,
    qualificationPrimary: qualificationNames[0] || "Nursing",
    qualificationsText: qualificationNames.join(", "),
    skills: getPublicNurseSkills(nurse),
    languages: Array.isArray(nurse.languages) ? nurse.languages.filter(Boolean) : [],
    availability: nurse.availability || [],
    availabilityLabel,
    dutyType: String(nurse.dutyType || nurse.duty_type || "").trim() || "12 hrs / 24 hrs",
    height: String(nurse.height || nurse.heightText || nurse.height_text || "").trim(),
    weight: Number.isFinite(Number(nurse.weightKg || nurse.weight_kg || nurse.weight))
      ? Number(nurse.weightKg || nurse.weight_kg || nurse.weight)
      : null,
    gender: nurse.gender || "Not specified",
    profileImageUrl: nurse.profileImageUrl || "",
    publicBio: nurse.publicBio || "",
    uniqueId: nurse.uniqueId || "",
    profileSlug: nurse.profileSlug || "",
    profileStatus: nurse.profileStatus || nurse.profile_status || "",
    adminVisible: nurse.adminVisible === true,
    publicProfileEnabled: nurse.publicProfileEnabled === true,
    publicUrl: nurse.profileSlug ? `/nurse/${encodeURIComponent(nurse.profileSlug)}` : `/nurses/${nurse.id}`,
    isAvailable: nurse.isAvailable !== false,
    currentStatus: nurse.currentStatus || nurse.current_status || availabilityLabel,
    isVerified: nurse.isVerified === true || String(nurse.status || "").toLowerCase() === "approved",
    ratingAverage: Number.isFinite(Number(nurse.ratingAverage)) ? Number(nurse.ratingAverage) : 0,
    reviewCount: Number.parseInt(nurse.reviewCount, 10) || 0
  };
}

function buildAgentDashboardNurse(row) {
  const status = String(row.status || "Pending").trim() || "Pending";
  const emailVerified = row.email_verified === true;
  const nurse = {
    id: row.id,
    fullName: row.full_name || "Nurse",
    gender: row.gender || "Not specified",
    religion: row.religion || "",
    city: row.city || "",
    experienceYears: Number.parseInt(row.experience_years, 10) || 0,
    qualifications: Array.isArray(row.qualifications) ? row.qualifications : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    languages: Array.isArray(row.languages) ? row.languages : [],
    publicSkills: Array.isArray(row.public_skills) ? row.public_skills : [],
    availability: [],
    availabilityLabel: row.availability_label || row.current_status || (row.is_available === false ? "Unavailable" : "Available"),
    dutyType: row.duty_type || "",
    height: row.height_text || "",
    weight: Number.isFinite(Number(row.weight_kg)) ? Number(row.weight_kg) : null,
    profileImageUrl: normalizePublicImageUrl(row.profile_image_url || row.profile_image_path || ""),
    phoneNumber: row.user_phone || row.phone_number || "",
    publicBio: row.public_bio || "",
    uniqueId: row.unique_id || "",
    profileSlug: row.profile_slug || "",
    isAvailable: row.is_available !== false,
    publicShowCity: row.public_show_city !== false,
    publicShowExperience: row.public_show_experience !== false
  };

  return {
    ...buildPublicNurse(nurse),
    status,
    emailVerified,
    email_verified: emailVerified,
    canDelete: !emailVerified && status.toLowerCase() !== "approved"
  };
}

function buildPublicNurseProfileView(nurse) {
  const qualifications = Array.isArray(nurse.qualifications) ? nurse.qualifications : [];
  const qualificationDocuments = qualifications
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;

      const name = String(item.name || "").trim();
      const href = String(
        item.certificate_url
        || item.certificateUrl
        || item.document_url
        || item.documentUrl
        || item.file_url
        || item.fileUrl
        || ""
      ).trim();

      if (!name || !href) return null;

      return {
        key: `qualification-${index}`,
        label: name,
        href,
        available: true
      };
    })
    .filter(Boolean);
  const qualificationNames = qualifications
    .map((item) => (item && typeof item === "object" ? item.name : item))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const experienceYears = Number.parseInt(nurse.experienceYears, 10) || 0;
  const languages = Array.isArray(nurse.languages) ? nurse.languages.filter(Boolean) : [];
  const skills = Array.isArray(nurse.skills) ? nurse.skills.filter(Boolean) : [];
  const availabilityLabel = String(
    nurse.availabilityLabel
    || nurse.availability_label
    || nurse.currentStatus
    || (nurse.isAvailable === false ? "Unavailable" : "Available")
    || "Available"
  ).trim();
  const qualificationPrimary = qualificationNames[0] || "Nursing";
  const aadhaarFrontUrl = String(
    nurse.aadhaarFrontUrl
    || nurse.aadharFrontUrl
    || nurse.aadhaar_front_url
    || nurse.aadhar_front_url
    || nurse.aadharImageUrl
    || nurse.aadhar_image_url
    || nurse.aadhaarImageUrl
    || nurse.aadhaar_image_url
    || nurse.aadhaarCardUrl
    || nurse.aadhaar_card_url
    || ""
  ).trim();
  const aadhaarBackUrl = String(
    nurse.aadhaarBackUrl
    || nurse.aadharBackUrl
    || nurse.aadhaar_back_url
    || nurse.aadhar_back_url
    || ""
  ).trim();
  const legacyCertificateUrl = String(nurse.certificateUrl || nurse.certificate_url || "").trim();
  const medicalFitUrl = String(nurse.medicalFitUrl || nurse.medical_fit_url || "").trim();
  const documents = [];

  if (aadhaarFrontUrl) {
    documents.push({
      key: "aadhaar-front",
      label: "Aadhaar (Front)",
      href: aadhaarFrontUrl,
      available: true
    });
  }

  if (aadhaarBackUrl) {
    documents.push({
      key: "aadhaar-back",
      label: "Aadhaar (Back)",
      href: aadhaarBackUrl,
      available: true
    });
  }

  documents.push(...qualificationDocuments);

  if (legacyCertificateUrl && !documents.some((item) => item.href === legacyCertificateUrl)) {
    documents.push({
      key: "certificate",
      label: qualificationDocuments.length ? "Additional Certificate" : "Certificate",
      href: legacyCertificateUrl,
      available: true
    });
  }

  if (medicalFitUrl) {
    documents.push({
      key: "medical-fit",
      label: "Medical Fit",
      href: medicalFitUrl,
      available: true
    });
  }

  return {
    id: nurse.id,
    fullName: nurse.fullName,
    status: nurse.status || "Pending",
    isVerified: nurse.isVerified === true || String(nurse.status || "").toLowerCase() === "approved",
    gender: nurse.gender || "Not specified",
    religion: String(nurse.religion || "").trim(),
    city: nurse.publicShowCity ? nurse.city : "Not shared",
    qualificationPrimary,
    qualificationsText: qualificationNames.join(", "),
    experienceYears: nurse.publicShowExperience ? experienceYears : null,
    experienceText: nurse.publicShowExperience ? `${experienceYears} Years` : "Not shared",
    profileImageUrl: nurse.profileImageUrl || nurse.profileImagePath || "",
    uniqueId: nurse.uniqueId || "",
    profileSlug: nurse.profileSlug || "",
    profileStatus: nurse.profileStatus || nurse.profile_status || "",
    adminVisible: nurse.adminVisible === true,
    publicProfileEnabled: nurse.publicProfileEnabled === true,
    publicUrl: nurse.profileSlug ? `/nurse/${encodeURIComponent(nurse.profileSlug)}` : `/nurses/${nurse.id}`,
    isAvailable: nurse.isAvailable !== false,
    currentStatus: nurse.currentStatus || availabilityLabel,
    availabilityLabel,
    dutyType: String(nurse.dutyType || nurse.duty_type || "").trim() || "12 hrs / 24 hrs",
    height: String(nurse.height || nurse.heightText || nurse.height_text || "").trim(),
    weight: Number.isFinite(Number(nurse.weightKg || nurse.weight_kg || nurse.weight))
      ? Number(nurse.weightKg || nurse.weight_kg || nurse.weight)
      : null,
    languages,
    skills,
    aadhaarCardUrl: aadhaarFrontUrl,
    aadhaarFrontUrl,
    aadhaarBackUrl,
    certificateUrl: qualificationDocuments.length
      ? qualificationDocuments[0].href
      : legacyCertificateUrl,
    medicalFitUrl,
    documents
  };
}

function buildNurseContactContext(nurse, viewer, options = {}) {
  const viewerRole = String((viewer && viewer.role) || "").trim().toLowerCase() || "public";
  const viewerId = Number.parseInt((viewer && viewer.id) || 0, 10);
  const nurseUserId = Number.parseInt((nurse && (nurse.userId || nurse.user_id)) || 0, 10);
  const nursePhone = String((nurse && (nurse.phoneNumber || nurse.phone_number)) || "").trim();
  const forceCompanyContact = options && options.forceCompanyContact === true;
  const companyName = String((options && options.companyName) || "Prisha Home Care").trim() || "Prisha Home Care";
  const profileUrl = String((options && options.profileUrl) || "").trim();
  const nurseName = String((nurse && (nurse.fullName || nurse.full_name)) || "this nurse").trim() || "this nurse";
  const nurseUniqueId = String((nurse && (nurse.uniqueId || nurse.unique_id)) || "").trim();
  const agentContact = options && options.agent && typeof options.agent === "object" ? options.agent : null;
  const agentName = String(
    (agentContact && (agentContact.companyName || agentContact.fullName || agentContact.full_name || agentContact.email))
    || "Assigned Agent"
  ).trim() || "Assigned Agent";
  const agentPhone = String(
    (options && options.agentPhone)
    || (agentContact && (agentContact.phoneNumber || agentContact.phone_number))
    || ""
  ).trim();
  const isOwner = viewerRole === "nurse"
    && Number.isInteger(viewerId)
    && Number.isInteger(nurseUserId)
    && viewerId === nurseUserId;
  const normalizedAgentPhone = normalizePhone(agentPhone);
  const normalizedNursePhone = normalizePhone(nursePhone);
  const normalizedCompanyPhone = normalizePhone(COMPANY_PHONE);

  let selectedPhone = COMPANY_PHONE;
  let contactName = companyName;
  let phoneSource = "company";

  if (!forceCompanyContact) {
    if (viewerRole === "agent" && normalizedAgentPhone) {
      selectedPhone = agentPhone;
      contactName = agentName;
      phoneSource = "agent";
    } else if (isOwner && normalizedNursePhone) {
      selectedPhone = nursePhone;
      contactName = nurseName;
      phoneSource = "nurse";
    }
  }

  const normalizedPhone = normalizePhone(selectedPhone);
  const inquiryMessage = [
    `Hello ${contactName},`,
    "",
    `I am interested in nurse ${nurseName}${nurseUniqueId ? ` (ID: ${nurseUniqueId})` : ""}.`,
    profileUrl ? "" : null,
    profileUrl ? `Profile: ${profileUrl}` : null,
    "",
    "Please assist me with the next steps."
  ]
    .filter((line) => line !== null)
    .join("\n");
  const whatsappDigits = normalizedPhone || normalizedCompanyPhone;
  const whatsappHref = whatsappDigits
    ? `https://wa.me/91${whatsappDigits}?text=${encodeURIComponent(inquiryMessage)}`
    : "";
  const telHref = normalizedPhone ? `tel:+91${normalizedPhone}` : "";
  const actionHref = whatsappHref || telHref;

  return {
    viewerRole,
    isOwner,
    phoneSource,
    usesCompanyContact: phoneSource === "company",
    companyName,
    contactName,
    nurseName,
    nurseId: nurseUniqueId,
    profileUrl,
    inquiryMessage,
    displayPhone: selectedPhone,
    displayEmail: COMPANY_EMAIL,
    downloadPhone: phoneSource === "company" ? COMPANY_PHONE : selectedPhone,
    sharePhone: selectedPhone,
    phone: selectedPhone,
    email: COMPANY_EMAIL,
    telHref,
    whatsappHref,
    actionHref,
    openInNewTab: Boolean(whatsappHref),
    buttonLabel: "Contact"
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
    if (typeof nurse.userIsDeleted !== "boolean") {
      nurse.userIsDeleted = false;
      changed = true;
    }
    if (typeof nurse.userDeletedAt !== "string") {
      nurse.userDeletedAt = "";
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
    if (typeof nurse.currentStatus !== "string") {
      nurse.currentStatus = normalizeCurrentStatusInput(nurse.currentStatus || "");
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
    if (typeof user.isDeleted !== "boolean") {
      user.isDeleted = false;
      changed = true;
    }
    if (typeof user.deletedAt !== "string") {
      user.deletedAt = "";
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

  // Keep nurse shadow flags in sync with owning user archival state.
  store.nurses.forEach((nurse) => {
    const owner = store.users.find((user) => user.id === nurse.userId);
    const shouldBeDeleted = Boolean(owner && owner.isDeleted);
    const shouldDeletedAt = owner && typeof owner.deletedAt === "string" ? owner.deletedAt : "";
    if (nurse.userIsDeleted !== shouldBeDeleted) {
      nurse.userIsDeleted = shouldBeDeleted;
      changed = true;
    }
    if ((nurse.userDeletedAt || "") !== shouldDeletedAt) {
      nurse.userDeletedAt = shouldDeletedAt;
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

function normalizePublicImageUrl(value) {
  const imageUrl = String(value || "").trim();
  if (!imageUrl) {
    return "";
  }
  if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith("/")) {
    return imageUrl;
  }
  return `/${imageUrl}`;
}

async function getSessionUserPayload(user) {
  if (!user) {
    return null;
  }

  let profileImageUrl = "/images/default-avatar.png";
  if (user.role === "nurse") {
    try {
      const nurse = await getNurseByUserId(user.id);
      profileImageUrl = normalizePublicImageUrl((nurse && (nurse.profileImageUrl || nurse.profileImagePath)) || "/images/default-avatar.png");
    } catch (error) {
      console.error("Error loading nurse profile image for session:", error);
    }
  } else if (user.role === "agent") {
    try {
      const agent = await getAgentRecordForUser(user.id);
      profileImageUrl = normalizePublicImageUrl((agent && agent.profileImageUrl) || "/images/default-avatar.png");
    } catch (error) {
      console.error("Error loading agent profile image for session:", error);
    }
  }

  return {
    id: user.id,
    role: user.role,
    fullName: user.fullName || "",
    full_name: user.fullName || "",
    email: user.email || "",
    phoneNumber: user.phoneNumber || "",
    phone_number: user.phoneNumber || "",
    emailVerified: user.emailVerified === true,
    email_verified: user.emailVerified === true,
    profileImageUrl,
    profile_image_url: profileImageUrl
  };
}

function loadCurrentUser(req, res, next) {
  req.currentUser = null;
  const userId = req.session.userId;
  if (!userId) {
    req.session.user = null;
    return next();
  }

  // Use async query to get fresh user data from PostgreSQL
  getUserById(userId)
    .then(async (user) => {
      if (!user) {
        req.session.userId = null;
        req.session.role = null;
        req.session.user = null;
        return next();
      }

      req.currentUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        phoneNumber: user.phoneNumber || "",
        emailVerified: user.emailVerified === true,
        email_verified: user.emailVerified === true
      };
      req.session.user = await getSessionUserPayload(user);
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

async function getAgentRecordForUser(userId) {
  try {
    const result = await pool.query(
      `SELECT a.*, COALESCE(u.is_deleted, false) AS user_is_deleted
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id = $1
       LIMIT 1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row || row.user_is_deleted) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name || "",
      email: row.email || "",
      phoneNumber: row.phone_number || "",
      companyName: row.company_name || "",
      workingRegion: row.working_region || row.region || "",
      region: row.working_region || row.region || "",
      profileImageUrl: row.profile_image_url || "",
      aadhaarDocUrl: row.aadhaar_doc_url || "",
      aadhaarUrl: row.aadhaar_doc_url || "",
      uniqueId: row.unique_id || "",
      profileSlug: row.profile_slug || "",
      status: normalizeAgentStatusInput(row.status) || "pending",
      createdByAgentEmail: row.created_by_agent_email || "",
      createdAt: row.created_at
    };
  } catch (error) {
    console.error("Agent record lookup failed:", error);
    return null;
  }
}

async function loadAgentProfile(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== "agent") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }

  const agentRecord = await getAgentRecordForUser(req.currentUser.id);
  if (!agentRecord || !isApprovedAgentStatus(agentRecord.status)) {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }

  req.agentRecord = agentRecord;
  return next();
}

async function requireApprovedAgent(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== "agent") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }

  const agentRecord = await getAgentRecordForUser(req.currentUser.id);
  if (!agentRecord || !isApprovedAgentStatus(agentRecord.status)) {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }

  req.agentRecord = agentRecord;
  return next();
}

async function requireApprovedNurse(req, res, next) {
  if (!req.currentUser) {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  if (req.currentUser.role !== "nurse") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  // Only block "Rejected" or "Suspended" status - allow "Pending" through
  if (req.currentUser.status === "Rejected" || req.currentUser.status === "Suspended") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  const store = readNormalizedStore();

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
    console.warn("Fallback nurse creation failed; using temporary profile completion placeholder.");
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
      currentStatus: "",
      workLocations: [],
      currentAddress: '',
      qualifications: [],
      skills: [],
      availability: [],
      experienceYears: 0,
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
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  // Allow "Pending" status to pass through
  req.nurseRecord = nurseRecord;
  return next();
}


async function ensureAdmin() {
  const email = "vikash27907@gmail.com";
  const password = "9661611495@Rajas";

  try {
    // Check if admin exists in PostgreSQL - ONLY create if not exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' AND COALESCE(is_deleted, false) = false LIMIT 1"
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

function getRequestedReferralAgentId(req) {
  const rawValue = req.body.ref_agent ?? req.query.ref_agent;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveAgentLinkContext(req) {
  if (!req.currentUser || req.currentUser.role !== "agent") {
    return {
      agentUserId: null,
      agentEmail: ""
    };
  }

  const requestedReferralAgentId = getRequestedReferralAgentId(req);
  if (requestedReferralAgentId && requestedReferralAgentId !== req.currentUser.id) {
    const error = new Error("Invalid agent referral link.");
    error.code = "INVALID_AGENT_REFERRAL";
    throw error;
  }

  const agentRecord = await getAgentRecordForUser(req.currentUser.id);
  if (!agentRecord || !isApprovedAgentStatus(agentRecord.status)) {
    const error = new Error("Only approved agents can register nurses.");
    error.code = "AGENT_NOT_APPROVED";
    throw error;
  }

  return {
    agentUserId: req.currentUser.id,
    agentEmail: normalizeEmail(req.currentUser.email)
  };
}

async function linkNurseToAgent(agentUserId, nurseId, agentEmail) {
  if (!Number.isInteger(agentUserId) || agentUserId <= 0 || !Number.isInteger(nurseId) || nurseId <= 0) {
    return;
  }

  await pool.query(
    `INSERT INTO agent_nurse_roster (agent_id, nurse_id)
     VALUES ($1, $2)
     ON CONFLICT (agent_id, nurse_id) DO NOTHING`,
    [agentUserId, nurseId]
  );

  const normalizedAgentEmail = normalizeEmail(agentEmail);
  if (!normalizedAgentEmail) {
    return;
  }

  await pool.query(
    `UPDATE nurses
     SET agent_email = CASE
           WHEN NULLIF(BTRIM(COALESCE(agent_email, '')), '') IS NULL THEN $1
           ELSE agent_email
         END,
         agent_emails = CASE
           WHEN agent_emails IS NULL OR array_length(agent_emails, 1) IS NULL THEN ARRAY[$1]::TEXT[]
           WHEN EXISTS (
             SELECT 1
             FROM unnest(agent_emails) AS assigned(agent_email)
             WHERE LOWER(assigned.agent_email) = LOWER($1)
           ) THEN agent_emails
           ELSE array_append(agent_emails, $1::TEXT)
         END
     WHERE id = $2`,
    [normalizedAgentEmail, nurseId]
  );
}

async function createNurseUnderAgent(req, res, failRedirect, generatedOtp, otpExpiry) {
  let agentLinkContext;
  try {
    agentLinkContext = await resolveAgentLinkContext(req);
  } catch (error) {
    setFlash(req, "error", error.message || "Unable to validate the agent referral.");
    return res.redirect(failRedirect);
  }

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const isMultipartRequest = contentType.includes("multipart/form-data");
  if (isMultipartRequest) {
    try {
      await runMulterMiddleware(uploadNurseProfileFiles, req, res);
    } catch (error) {
      const uploadError = error && error.code === "LIMIT_FILE_SIZE"
        ? "Profile photo must be 2 MB or smaller."
        : (error && error.message ? error.message : "Unable to upload the nurse photo right now.");
      setFlash(req, "error", uploadError);
      return res.redirect(failRedirect);
    }
  }

  const creatorAgentEmail = agentLinkContext.agentEmail;
  const isAgentManagedRegistration = Number.isInteger(agentLinkContext.agentUserId)
    && agentLinkContext.agentUserId > 0;
  const fullName = String(req.body.fullName || "").trim();
  const emailInput = String(req.body.email || "").trim();
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || req.body.location || "").trim();
  const experienceYears = Number.parseInt(req.body.experienceYears, 10);
  const availabilityInput = String(
    req.body.availability
    || req.body.current_status
    || req.body.currentStatus
    || ""
  ).trim();
  const availabilityValue = normalizeCurrentStatusInput(availabilityInput);
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  const profileImageFile = uploadedFiles.find((file) => file && file.fieldname === "profileImage") || null;
  const imageValidation = validateAgentNurseImageFile(profileImageFile);
  if (!imageValidation.valid) {
    setFlash(req, "error", imageValidation.error);
    return res.redirect(failRedirect);
  }

  const generatedPassword = isAgentManagedRegistration ? generateTempPassword() : "";
  const password = String(req.body.password || generatedPassword);
  const confirmPassword = String(req.body.confirm_password || password);
  const gender = isAgentManagedRegistration
    ? "Not Specified"
    : String(req.body.gender || "").trim();
  const currentStatusInput = String(
    req.body.current_status
    || req.body.currentStatus
    || availabilityInput
    || ""
  ).trim();
  const currentStatus = normalizeCurrentStatusInput(currentStatusInput) || availabilityValue;
  const hasEmail = Boolean(emailInput);
  const registrationApprovalStatus = isAgentManagedRegistration ? "Approved" : "Pending";
  const requiresOtpVerification = !creatorAgentEmail
    && hasEmail
    && typeof generatedOtp === "string"
    && typeof otpExpiry === "object";

  // Validate required fields
  if (isAgentManagedRegistration) {
    if (!fullName || !phoneNumber || !city || Number.isNaN(experienceYears) || !availabilityValue) {
      setFlash(req, "error", "Please complete first name, phone number, location, experience, and availability.");
      return res.redirect(failRedirect);
    }
  } else if (!fullName || !phoneNumber || !city || !gender || !password) {
    setFlash(req, "error", "Please complete all required nurse details.");
    return res.redirect(failRedirect);
  }
  if (password.length < 6) {
    setFlash(req, "error", "Password must be at least 6 characters.");
    return res.redirect(failRedirect);
  }
  if (confirmPassword && password !== confirmPassword) {
    setFlash(req, "error", "Passwords do not match.");
    return res.redirect(failRedirect);
  }

  // Validate gender must be Male or Female
  if (!isAgentManagedRegistration && !["Male", "Female"].includes(gender)) {
    setFlash(req, "error", "Please select a valid gender.");
    return res.redirect(failRedirect);
  }
  if (isAgentManagedRegistration && (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60)) {
    setFlash(req, "error", "Experience should be between 0 and 60 years.");
    return res.redirect(failRedirect);
  }
  if (isAgentManagedRegistration && !availabilityValue) {
    setFlash(req, "error", "Please select a valid availability.");
    return res.redirect(failRedirect);
  }
  if (currentStatusInput && !currentStatus) {
    setFlash(req, "error", "Please select a valid current status.");
    return res.redirect(failRedirect);
  }

  let email = null;
  if (hasEmail) {
    const emailValidation = validateEmail(emailInput);
    if (!emailValidation.valid) {
      setFlash(req, "error", emailValidation.error);
      return res.redirect(failRedirect);
    }
    email = emailValidation.value;
  }

  // Validate India phone number
  const phoneValidation = validateIndiaPhone(phoneNumber);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect(failRedirect);
  }

  if (email) {
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      setFlash(req, "error", "This email already has a registered account.");
      return res.redirect(failRedirect);
    }
  }

  const normalizedPhone = normalizePhone(phoneValidation.value);
  const phoneExists = await pool.query(
    `SELECT 1
     FROM users
     WHERE phone_number = $1
     UNION
     SELECT 1
     FROM agents
     WHERE phone_number = $1
     LIMIT 1`,
    [normalizedPhone]
  );

  if (phoneExists.rowCount > 0) {
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
    phoneNumber: normalizedPhone,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "nurse",
    status: registrationApprovalStatus,
    createdAt: now(),
    emailVerified: false,
    otpCode: requiresOtpVerification ? generatedOtp : "",
    otpExpiry: requiresOtpVerification ? otpExpiry.toISOString() : null
  };

  let createdUser = null;
  let createdNurse = null;
  let uploadedProfileImagePath = "";

  createdUser = await createUser(user);

  if (!createdUser) {
    setFlash(req, "error", "Unable to create this account right now. Please try again.");
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
    currentStatus: currentStatus || "Available for Work",
    claimedByNurse: isAgentManagedRegistration ? false : true,
    status: registrationApprovalStatus,
    profileStatus: isAgentManagedRegistration ? "approved" : "draft",
    publicProfileEnabled: isAgentManagedRegistration,
    profileImagePath: defaultAvatar,
    createdAt: now()
  };

  createdNurse = await createNurse(nurse);
  if (!createdNurse) {
    await deleteUser(createdUser.id);
    setFlash(req, "error", "Unable to create nurse profile. Please try again.");
    return res.redirect(failRedirect);
  }

  if (isAgentManagedRegistration) {
    const nurseUpdates = {
      experienceYears,
      currentStatus: availabilityValue,
      availabilityLabel: availabilityValue,
      availability: [availabilityValue],
      isAvailable: availabilityValue !== "Not Available"
    };

    if (profileImageFile) {
      try {
        uploadedProfileImagePath = await saveAgentNurseImageFile(profileImageFile);
        nurseUpdates.profileImagePath = uploadedProfileImagePath;
      } catch (error) {
        await deleteNurse(createdNurse.id);
        await deleteUser(createdUser.id);
        setFlash(req, "error", error.message || "Unable to save the nurse photo right now.");
        return res.redirect(failRedirect);
      }
    }

    const updatedNurse = await updateNurse(createdNurse.id, nurseUpdates);
    if (!updatedNurse) {
      if (uploadedProfileImagePath) {
        await deleteLocalAsset(uploadedProfileImagePath);
      }
      await deleteNurse(createdNurse.id);
      await deleteUser(createdUser.id);
      setFlash(req, "error", "Unable to finish creating this nurse right now.");
      return res.redirect(failRedirect);
    }

    createdNurse = updatedNurse;
  }

  if (agentLinkContext.agentUserId) {
    try {
      await linkNurseToAgent(agentLinkContext.agentUserId, createdNurse.id, creatorAgentEmail);
    } catch (error) {
      console.error("Agent nurse roster link failed:", error);
      if (uploadedProfileImagePath) {
        await deleteLocalAsset(uploadedProfileImagePath);
      }
      await deleteNurse(createdNurse.id);
      await deleteUser(createdUser.id);
      setFlash(req, "error", "Unable to link this nurse to your staff roster right now.");
      return res.redirect(failRedirect);
    }
  }

  try {
    const skills = toArray(req.body.skills)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const experienceYears = Number.parseInt(req.body.experienceYears, 10);
    const experienceMonths = Number.parseInt(req.body.experienceMonths, 10);
    const adminNurseEmailResult = await sendAdminNurseSignupNotification({
      fullName,
      email: email || "Not provided",
      phone: normalizedPhone,
      city,
      experienceYears: Number.isFinite(experienceYears) ? experienceYears : 0,
      experienceMonths: Number.isFinite(experienceMonths) ? experienceMonths : 0,
      skills,
      currentStatus: currentStatus || "Available for Work"
    });

    if (adminNurseEmailResult && adminNurseEmailResult.success === false) {
      throw new Error(adminNurseEmailResult.error || "Unknown admin nurse notification email error");
    }
  } catch (error) {
    console.error(`Admin nurse signup email failed for ${email}:`, error);
  }

  // Send OTP email after both records are created successfully.
  if (!creatorAgentEmail && requiresOtpVerification) {
    await sendVerificationOtpEmail(email, fullName, generatedOtp);
  }

  if (creatorAgentEmail) {
    const successMessage = [
      `Nurse added successfully.`,
      createdNurse && createdNurse.uniqueId ? `Login ID: ${createdNurse.uniqueId}.` : "",
      isAgentManagedRegistration ? `Temporary password: ${password}.` : "",
      "More profile details can be completed later after login."
    ]
      .filter(Boolean)
      .join(" ");
    setFlash(req, "success", successMessage);
    return res.redirect("/agent/dashboard?tab=staff");
  }

  if (requiresOtpVerification) {
    setFlash(req, "success", "Account created! Please verify your email with the OTP sent to your inbox.");
    return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
  }

  req.session.userId = createdUser.id;
  req.session.role = createdUser.role;
  req.session.user = await getSessionUserPayload(createdUser);
  setFlash(req, "success", "Account created successfully.");
  return res.redirect("/nurse/dashboard");
}

async function createAgentUnderAgent(req, res, failRedirect) {
  const contentType = String(req.headers["content-type"] || "");
  console.log("[Agent Registration] Request received", {
    path: req.path,
    contentType,
    hasFile: Boolean(req.file),
    body: req.body
  });

  try {
    const fullName = String(req.body.fullName || "").trim();
    const emailInput = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const phoneNumber = String(req.body.phoneNumber || "").trim();
    const workingRegion = String(req.body.workingRegion || req.body.region || "").trim();
    const companyName = String(req.body.companyName || "").trim();

    // Validate required fields
    if (!fullName || !password || !phoneNumber || !workingRegion) {
      setFlash(req, "error", "Please complete all agent details.");
      return res.redirect(failRedirect);
    }

    // Email validation (only if email provided)
    let email = "";
    if (emailInput) {
      const emailValidation = validateEmail(emailInput);
      if (!emailValidation.valid) {
        setFlash(req, "error", emailValidation.error);
        return res.redirect(failRedirect);
      }
      email = emailValidation.value.trim();
    }

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

    const existingUserByPhone = await getUserByPhone(phoneValidation.value);
    if (existingUserByPhone) {
      setFlash(req, "error", "This phone number already has a registered account.");
      return res.redirect(failRedirect);
    }

    const creatorAgentEmail = req.currentUser && req.currentUser.role === "agent"
      ? normalizeEmail(req.currentUser.email)
      : "";

    // ============================================================
    // STEP 1: Insert into USERS table (authentication)
    // ============================================================
    const user = {
      fullName,
      email,
      phoneNumber: phoneValidation.value,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "agent",
      status: "pending",
      // Public agent registration has no OTP verification flow.
      emailVerified: true,
      createdAt: now()
    };

    const createdUser = await createUser(user);
    if (!createdUser) {
      console.error("[Agent Registration] User insert failed", {
        email,
        phoneNumber,
        workingRegion
      });
      setFlash(req, "error", "Unable to create account right now. Please try again.");
      return res.redirect(failRedirect);
    }

    // ============================================================
    // STEP 2: Insert into AGENTS table (profile data only)
    // ============================================================
    const agent = {
      userId: createdUser.id,
      fullName,
      email,
      phoneNumber: phoneValidation.value,
      companyName,
      workingRegion,
      status: "pending",
      createdByAgentEmail: creatorAgentEmail,
      createdAt: now()
    };

    const createdAgent = await createAgent(agent);
    if (!createdAgent) {
      console.error("[Agent Registration] Agent insert failed after user insert", {
        userId: createdUser.id,
        email,
        phoneNumber
      });
      await deleteUser(createdUser.id);
      setFlash(req, "error", "Unable to create agent profile right now. Please try again.");
      return res.redirect(failRedirect);
    }

    console.log("[Agent Registration] Success", {
      userId: createdUser.id,
      agentId: createdAgent.id,
      email
    });

    if (creatorAgentEmail) {
      setFlash(req, "success", "Agent account created. Admin approval is required before login.");
      return res.redirect("/agent");
    }

    setFlash(req, "success", "Agent registration submitted. Admin approval is required before login.");
    return res.redirect("/agent-registration");
  } catch (error) {
    console.error("[Agent Registration] Unexpected error:", error);
    setFlash(req, "error", "Agent registration failed due to a server error. Please try again.");
    return res.redirect(failRedirect);
  }
}

async function stagePublicAgentRegistration(req, res, failRedirect) {
  try {
    const fullName = String(req.body.fullName || req.body.full_name || "").trim();
    const emailInput = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const phoneNumber = String(req.body.phoneNumber || req.body.phone_number || "").trim();
    const workingRegion = String(req.body.workingRegion || req.body.working_region || req.body.region || "").trim();
    const companyName = String(req.body.companyName || req.body.company_name || "").trim();

    if (!fullName || !emailInput || !password || !phoneNumber || !workingRegion) {
      setFlash(req, "error", "Please complete all agent details.");
      return res.redirect(failRedirect);
    }

    if (password.length < 6) {
      setFlash(req, "error", "Password must be at least 6 characters.");
      return res.redirect(failRedirect);
    }

    const emailValidation = validateEmail(emailInput);
    if (!emailValidation.valid) {
      setFlash(req, "error", emailValidation.error);
      return res.redirect(failRedirect);
    }
    const email = emailValidation.value;

    const phoneValidation = validateIndiaPhone(phoneNumber);
    if (!phoneValidation.valid) {
      setFlash(req, "error", phoneValidation.error);
      return res.redirect(failRedirect);
    }

    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      setFlash(req, "error", "This email already has a registered account.");
      return res.redirect(failRedirect);
    }

    const existingUserByPhone = await getUserByPhone(phoneValidation.value);
    if (existingUserByPhone) {
      setFlash(req, "error", "This phone number already has a registered account.");
      return res.redirect(failRedirect);
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    req.session.agentRegistration = {
      fullName,
      email,
      phoneNumber: phoneValidation.value,
      workingRegion,
      companyName,
      passwordHash: bcrypt.hashSync(password, 10),
      otp,
      otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };

    await sendAgentVerificationOtpEmail(email, otp);

    return res.render("agent/verify-otp", {
      title: "Verify Agent Registration",
      email
    });
  } catch (error) {
    console.error("[Agent Registration OTP] Unexpected error:", error);
    setFlash(req, "error", "Agent registration failed due to a server error. Please try again.");
    return res.redirect(failRedirect);
  }
}

// Commented out seedAdmin - now using ensureAdmin() for PostgreSQL
// seedAdmin();

// Health check routes - support both /health and /healthz

function configureApp(app) {
  app.locals.version = Date.now();

  app.set("view engine", "ejs");
  app.set("views", path.join(process.cwd(), "views"));
  app.disable("x-powered-by");
  app.locals.MASTER_SKILL_OPTIONS = MASTER_SKILL_OPTIONS;
  app.locals.MASTER_QUALIFICATION_OPTIONS = PROFILE_QUALIFICATION_OPTIONS;

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(validateRequest);
  // app.use("/webhook/whatsapp", require("../routes/whatsapp"));

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "replace-this-session-secret",
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.use(express.static("public", {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }));

  app.use((req, res, next) => {
    const assetVersion = process.env.NODE_ENV === "production" ? "1.0.0" : Date.now();
    res.locals.version = assetVersion;
    res.locals.assetVersion = assetVersion;
    res.locals.environment = process.env.NODE_ENV === "production" ? "production" : "development";
    res.locals.extraStylesheets = [];
    res.locals.extraScripts = [];
    next();
  });

  app.get("/vendor/html-to-image.js", (req, res) => {
    return res.sendFile(path.join(process.cwd(), "node_modules", "html-to-image", "dist", "html-to-image.js"));
  });

  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (!req.accepts("html")) return next();

    res.vary("Cookie");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return next();
  });

  app.use(loadCurrentUser);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });

  app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.currentUser = req.currentUser;
    res.locals.currentPath = req.path;
    res.locals.flash = consumeFlash(req);
    res.locals.homeLink = getHomeLinkForUser(req.currentUser || req.session?.user || null);
    res.locals.nurseStatuses = NURSE_STATUSES;
    res.locals.agentStatuses = AGENT_STATUSES;
    res.locals.patientStatuses = PATIENT_STATUSES;
    res.locals.commissionTypes = COMMISSION_TYPES;
    res.locals.concernStatuses = CONCERN_STATUSES;
    res.locals.concernCategories = CONCERN_CATEGORIES;

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
}

module.exports = {
  readStore,
  writeStore,
  nextId,
  initializeStore,
  getPatientByRequestId,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  getUserByUniqueId,
  createUser,
  updateUser,
  deleteUser,
  getUsers,
  getNurseById,
  getNurseByUserId,
  getNurseByEmail,
  getNurseByProfileSlug,
  createNurse,
  updateNurse,
  deleteNurse,
  getNurses,
  getAgentById,
  getAgentByEmail,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgents,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  getPatients,
  getConcernById,
  createConcern,
  updateConcern,
  deleteConcern,
  getConcerns,
  sendCareRequestEmail,
  sendVerificationEmail,
  sendVerificationOtpEmail,
  sendAgentVerificationOtpEmail,
  sendResetPasswordEmail,
  sendConcernNotification,
  sendAdminCareRequestNotification,
  sendAdminNurseSignupNotification,
  initializeDatabase,
  pool,
  cloudinary,
  generateQR,
  normalizePhoneValue,
  AGENT_STATUSES,
  AVAILABILITY_OPTIONS,
  CARE_REQUEST_EARNINGS_PAYOUT_STATUSES,
  CARE_REQUEST_MARKETPLACE_TABS,
  CARE_REQUEST_PAYMENT_STATUSES,
  CARE_REQUEST_STATUSES,
  CARE_REQUEST_TRANSITIONS,
  CERTIFICATES_DIR,
  COMMISSION_TYPES,
  COMPANY_EMAIL,
  COMPANY_PHONE,
  CONCERN_CATEGORIES,
  CONCERN_STATUSES,
  EMAIL_REGEX,
  INDIA_PHONE_REGEX,
  MASTER_SKILL_OPTIONS,
  NURSE_STATUSES,
  NURSE_STATUS_INPUT_MAP,
  NURSING_SKILLS_OPTIONS,
  PATIENT_STATUSES,
  PORT,
  PROFILE_CURRENT_STATUS_OPTIONS,
  PROFILE_QUALIFICATION_OPTIONS,
  PROFILE_SKILL_OPTIONS,
  PROFILE_UPLOAD_ALLOWED_EXTENSIONS,
  PROFILE_UPLOAD_ALLOWED_MIME_TYPES,
  PROFILE_UPLOAD_MAX_BYTES,
  REFERRAL_DEFAULT_PERCENT,
  REQUEST_STATUSES,
  RESUME_DIR,
  SERVICE_SCHEDULE_OPTIONS,
  SKILLS_OPTIONS,
  UPLOAD_DIR,
  VALID_SERVICE_SCHEDULES,
  adminContextMiddleware,
  bcrypt,
  buildAgentDashboardNurse,
  buildNurseContactContext,
  buildPublicNurse,
  buildPublicNurseProfileView,
  calculateCommission,
  calculateProfileCompletion,
  canTransitionCareRequestStatus,
  clearPatientFinancials,
  collectNurseAssetUrls,
  configureApp,
  consumeFlash,
  createAgentUnderAgent,
  createNurseUnderAgent,
  crypto,
  dedupeNormalizedEmails,
  deleteCloudinaryAssetByUrl,
  deleteLocalAsset,
  deleteNurseAssets,
  ensureAdmin,
  extractCloudinaryPublicId,
  forgotPasswordRateLimiter,
  formatCareRequestDuration,
  fs,
  generateOtp,
  generateReferralCode,
  generateRequestId,
  generateTempPassword,
  generateToken,
  generateUniqueCareRequestEditToken,
  generateUniquePublicRequestCode,
  getAgentRecordForUser,
  getAllConcerns,
  getAppBaseUrl,
  getApprovedAgents,
  getConcernsByUserId,
  getHomeLinkForUser,
  getNurseAgentEmails,
  getOpenConcernsCount,
  getPublicCareRequestRecordByEditToken,
  getPublicCareRequestRecordByRequestCode,
  getPublicNurseSkills,
  getRequestedReferralAgentId,
  getSessionUserPayload,
  hasRegisteredEmail,
  hasRegisteredPhone,
  isApprovedAgentStatus,
  isPasswordLoginPhone,
  isProduction,
  isResetTokenExpired,
  isStoreUserDeleted,
  linkNurseToAgent,
  loadAgentProfile,
  loadCurrentUser,
  loginRateLimiter,
  mapPublicCareRequestRow,
  maskAadhar,
  multer,
  normalizeAgentStatusInput,
  normalizeCareRequestPaymentStatusInput,
  normalizeCareRequestPayoutStatusInput,
  normalizeCareRequestStatusInput,
  normalizeCurrentStatusInput,
  normalizeEmail,
  normalizeNurseStatusInput,
  normalizePhone,
  normalizePublicImageUrl,
  normalizeStoreShape,
  normalizeUniqueLoginId,
  now,
  nurseHasAgent,
  parseMoney,
  parseOptionalMoney,
  path,
  rateLimit,
  readNormalizedStore,
  redirectByRole,
  requireApprovedAgent,
  requireApprovedNurse,
  requireAuth,
  requireRole,
  resolveAgentLinkContext,
  runMulterMiddleware,
  sanitizeInput,
  session,
  setFlash,
  setNurseAgentEmails,
  stagePublicAgentRegistration,
  toArray,
  toBoolean,
  uploadBufferToCloudinary,
  uploadNurseProfileFiles,
  validateEmail,
  validateIndiaPhone,
  validateRequest,
  validateServiceSchedule,
};
