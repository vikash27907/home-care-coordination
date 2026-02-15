
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { readStore, writeStore, nextId } = require("./src/store");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const NURSE_STATUSES = ["Pending", "Approved", "Rejected"];
const AGENT_STATUSES = ["Pending", "Approved", "Rejected"];
const PATIENT_STATUSES = ["New", "In Progress", "Closed"];
const COMMISSION_TYPES = ["Percent", "Flat"];
const DEFAULT_ADMIN_EMAIL = "admin@homecare.local";
const DEFAULT_ADMIN_PASSWORD = "Admin@123";

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

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.disable("x-powered-by");

if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "replace-this-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION,
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

function parseBudgetRange(budgetMinRaw, budgetMaxRaw) {
  const budgetMinParsed = parseOptionalMoney(budgetMinRaw);
  const budgetMaxParsed = parseOptionalMoney(budgetMaxRaw);

  if (Number.isNaN(budgetMinParsed) || Number.isNaN(budgetMaxParsed)) {
    return { error: "Please enter a valid budget range." };
  }
  const oneMissing = (budgetMinParsed === null && budgetMaxParsed !== null)
    || (budgetMinParsed !== null && budgetMaxParsed === null);
  if (oneMissing) {
    return { error: "Budget range is optional, but when used both minimum and maximum are required." };
  }
  if (budgetMinParsed !== null && (budgetMinParsed < 0 || budgetMaxParsed < 0 || budgetMaxParsed < budgetMinParsed)) {
    return { error: "Please enter a valid budget range." };
  }

  return {
    budgetMin: budgetMinParsed === null ? null : Number(budgetMinParsed.toFixed(2)),
    budgetMax: budgetMaxParsed === null ? null : Number(budgetMaxParsed.toFixed(2))
  };
}

function now() {
  return new Date().toISOString();
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
  return "/";
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
  });

  store.patients.forEach((patient) => {
    if (typeof patient.email === "string") {
      const normalizedEmail = normalizeEmail(patient.email);
      if (patient.email !== normalizedEmail) {
        patient.email = normalizedEmail;
        changed = true;
      }
    }

    if (typeof patient.budgetMin === "undefined") {
      patient.budgetMin = null;
      changed = true;
    }
    if (typeof patient.budgetMax === "undefined") {
      patient.budgetMax = null;
      changed = true;
    }
    if (patient.budgetMin === "" || Number.isNaN(patient.budgetMin)) {
      patient.budgetMin = null;
      changed = true;
    }
    if (patient.budgetMax === "" || Number.isNaN(patient.budgetMax)) {
      patient.budgetMax = null;
      changed = true;
    }
    if (patient.budgetMin !== null && typeof patient.budgetMin !== "number") {
      const parsedMin = Number.parseFloat(patient.budgetMin);
      patient.budgetMin = Number.isNaN(parsedMin) ? null : Number(parsedMin.toFixed(2));
      changed = true;
    }
    if (patient.budgetMax !== null && typeof patient.budgetMax !== "number") {
      const parsedMax = Number.parseFloat(patient.budgetMax);
      patient.budgetMax = Number.isNaN(parsedMax) ? null : Number(parsedMax.toFixed(2));
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

  const store = readNormalizedStore();
  const user = store.users.find((item) => item.id === userId);
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
    if (role !== "admin" && req.currentUser.status !== "Approved") {
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

function requireApprovedNurse(req, res, next) {
  if (!req.currentUser || req.currentUser.role !== "nurse") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
  const store = readNormalizedStore();
  const nurseRecord = store.nurses.find((item) => item.userId === req.currentUser.id);
  if (!nurseRecord || nurseRecord.status !== "Approved") {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }
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
  return next();
});

function seedAdmin() {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const store = readNormalizedStore();
  const exists = store.users.find((user) => user.email === adminEmail && user.role === "admin");
  if (exists) {
    return;
  }

  const userId = nextId(store, "user");
  store.users.push({
    id: userId,
    fullName: "System Admin",
    email: adminEmail,
    phoneNumber: "",
    passwordHash: bcrypt.hashSync(adminPassword, 10),
    role: "admin",
    status: "Approved",
    createdAt: now()
  });
  writeStore(store);

  if (IS_PRODUCTION && adminPassword === DEFAULT_ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn("Security warning: default admin password is active in production.");
  }
}

function createNurseUnderAgent(req, res, failRedirect) {
  const creatorAgentEmail = req.currentUser && req.currentUser.role === "agent" ? normalizeEmail(req.currentUser.email) : "";
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const skills = toArray(req.body.skills);
  const availability = toArray(req.body.availability);
  const experienceYears = Number.parseInt(req.body.experienceYears, 10);
  const profileImageUrl = String(req.body.profileImageUrl || "").trim();
  const publicBio = String(req.body.publicBio || "").trim();
  const isAvailable = creatorAgentEmail ? toBoolean(req.body.isAvailable) : true;
  const publicShowCity = creatorAgentEmail ? toBoolean(req.body.publicShowCity) : true;
  const publicShowExperience = creatorAgentEmail ? toBoolean(req.body.publicShowExperience) : true;
  const referredByCode = String(req.body.referredByCode || "").trim().toUpperCase();

  if (!fullName || !email || !password || !phoneNumber || !city || Number.isNaN(experienceYears)) {
    setFlash(req, "error", "Please complete all required nurse details.");
    return res.redirect(failRedirect);
  }
  if (!normalizePhone(phoneNumber)) {
    setFlash(req, "error", "Please enter a valid phone number.");
    return res.redirect(failRedirect);
  }

  const store = readNormalizedStore();
  if (hasRegisteredEmail(store, email)) {
    setFlash(req, "error", "This email already has a registered account.");
    return res.redirect(failRedirect);
  }
  if (hasRegisteredPhone(store, phoneNumber)) {
    setFlash(req, "error", "This phone number already has a registered account.");
    return res.redirect(failRedirect);
  }

  let referredByNurseId = null;
  if (referredByCode) {
    const referrer = store.nurses.find((nurse) => String(nurse.referralCode || "").toUpperCase() === referredByCode);
    if (!referrer) {
      setFlash(req, "error", "Referral code not found.");
      return res.redirect(failRedirect);
    }
    referredByNurseId = referrer.id;
  }

  const userId = nextId(store, "user");
  store.users.push({
    id: userId,
    fullName,
    email,
    phoneNumber,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "nurse",
    status: "Pending",
    createdAt: now()
  });

  const nurseId = nextId(store, "nurse");
  const usedCodes = new Set(store.nurses.map((nurse) => String(nurse.referralCode || "").toUpperCase()).filter(Boolean));
  const nurse = {
    id: nurseId,
    userId,
    fullName,
    email,
    phoneNumber,
    city,
    skills,
    publicSkills: [],
    availability,
    experienceYears,
    status: "Pending",
    agentEmail: creatorAgentEmail,
    agentEmails: creatorAgentEmail ? [creatorAgentEmail] : [],
    profileImageUrl,
    publicBio,
    isAvailable,
    publicShowCity,
    publicShowExperience,
    referralCode: generateReferralCode(usedCodes),
    referredByNurseId,
    referralCommissionPercent: REFERRAL_DEFAULT_PERCENT,
    createdAt: now()
  };
  store.nurses.push(nurse);

  writeStore(store);
  if (creatorAgentEmail) {
    setFlash(req, "success", "Nurse profile created under your account. Admin approval is required before nurse login.");
    return res.redirect("/agent");
  }

  setFlash(req, "success", "Nurse signup submitted. Admin approval is required before login.");
  return res.redirect("/nurse-signup");
}

function createAgentUnderAgent(req, res, failRedirect) {
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const region = String(req.body.region || "").trim();

  if (!fullName || !email || !password || !phoneNumber || !region) {
    setFlash(req, "error", "Please complete all agent details.");
    return res.redirect(failRedirect);
  }
  if (!normalizePhone(phoneNumber)) {
    setFlash(req, "error", "Please enter a valid phone number.");
    return res.redirect(failRedirect);
  }

  const store = readNormalizedStore();
  if (hasRegisteredEmail(store, email)) {
    setFlash(req, "error", "This email already has a registered account.");
    return res.redirect(failRedirect);
  }
  if (hasRegisteredPhone(store, phoneNumber)) {
    setFlash(req, "error", "This phone number already has a registered account.");
    return res.redirect(failRedirect);
  }

  const userId = nextId(store, "user");
  store.users.push({
    id: userId,
    fullName,
    email,
    phoneNumber,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "agent",
    status: "Pending",
    createdAt: now()
  });

  const agentId = nextId(store, "agent");
  const creatorAgentEmail = req.currentUser && req.currentUser.role === "agent" ? normalizeEmail(req.currentUser.email) : "";
  store.agents.push({
    id: agentId,
    userId,
    fullName,
    email,
    phoneNumber,
    region,
    status: "Pending",
    createdByAgentEmail: creatorAgentEmail,
    createdAt: now()
  });

  writeStore(store);
  if (creatorAgentEmail) {
    setFlash(req, "success", "Agent account created. Admin approval is required before login.");
    return res.redirect("/agent");
  }

  setFlash(req, "success", "Agent registration submitted. Admin approval is required before login.");
  return res.redirect("/agent-registration");
}

seedAdmin();

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

app.post("/request-care", (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const careRequirement = String(req.body.careRequirement || "").trim();
  const duration = String(req.body.duration || "").trim();
  const budget = parseBudgetRange(req.body.budgetMin, req.body.budgetMax);
  const preferredNurseIdRaw = String(req.body.preferredNurseId || "").trim();

  if (!fullName || !email || !phoneNumber || !city || !careRequirement || !duration) {
    setFlash(req, "error", "Please complete all required fields.");
    return res.redirect("/request-care");
  }
  if (!normalizePhone(phoneNumber)) {
    setFlash(req, "error", "Please enter a valid phone number.");
    return res.redirect("/request-care");
  }
  if (budget.error) {
    setFlash(req, "error", budget.error);
    return res.redirect("/request-care");
  }

  const preferredNurseId = preferredNurseIdRaw ? Number.parseInt(preferredNurseIdRaw, 10) : Number.NaN;

  const store = readNormalizedStore();
  let preferredNurseName = "";
  let preferredNurseValue = null;
  if (!Number.isNaN(preferredNurseId)) {
    const preferredNurse = store.nurses.find(
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
  store.patients.push({
    id: patientId,
    fullName,
    email,
    phoneNumber,
    city,
    careRequirement,
    duration,
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
    status: "New",
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
    createdAt: now()
  });
  writeStore(store);

  setFlash(req, "success", "Request submitted. Our team will coordinate your care manually.");
  return res.redirect("/request-care");
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

app.post("/nurse-signup", (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/nurses/new");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return createNurseUnderAgent(req, res, "/nurse-signup");
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

app.post("/agent-registration", (req, res) => {
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

app.post("/login", (req, res) => {
  const identifierRaw = String(req.body.identifier || req.body.email || "").trim();
  const password = String(req.body.password || "");
  const normalizedEmail = normalizeEmail(identifierRaw);
  const normalizedPhone = normalizePhone(identifierRaw);
  const store = readNormalizedStore();
  const user = store.users.find(
    (item) => item.email === normalizedEmail || (normalizedPhone && normalizePhone(item.phoneNumber) === normalizedPhone)
  );

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    setFlash(req, "error", "Invalid credentials.");
    return res.redirect("/login");
  }

  if (user.role !== "admin" && user.status !== "Approved") {
    setFlash(req, "error", `Your account is ${user.status}. Admin approval is required.`);
    return res.redirect("/login");
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  setFlash(req, "success", `Welcome, ${user.fullName}.`);
  return res.redirect(redirectByRole(user.role));
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
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
    pendingAgents: store.agents.filter((item) => item.status === "Pending").length
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

app.post("/admin/nurses/:id/update", requireRole("admin"), (req, res) => {
  const nurseId = Number.parseInt(req.params.id, 10);
  const status = String(req.body.status || "").trim();
  const statusFilter = String(req.body.statusFilter || "All");
  const agentEmails = dedupeNormalizedEmails(toArray(req.body.agentEmails));
  const isAvailable = toBoolean(req.body.isAvailable);

  if (!NURSE_STATUSES.includes(status)) {
    setFlash(req, "error", "Invalid nurse status.");
    return res.redirect(`/admin/nurses?status=${encodeURIComponent(statusFilter)}`);
  }

  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === nurseId);
  if (!nurse) {
    setFlash(req, "error", "Nurse record not found.");
    return res.redirect(`/admin/nurses?status=${encodeURIComponent(statusFilter)}`);
  }

  const invalidAgent = agentEmails.find(
    (email) => !store.agents.some((agent) => normalizeEmail(agent.email) === email && agent.status === "Approved")
  );
  if (invalidAgent) {
    setFlash(req, "error", "All assigned agents must be approved.");
    return res.redirect(`/admin/nurses?status=${encodeURIComponent(statusFilter)}`);
  }

  nurse.status = status;
  nurse.isAvailable = isAvailable;
  setNurseAgentEmails(nurse, agentEmails);
  const user = store.users.find((item) => item.id === nurse.userId);
  if (user) {
    user.status = status;
  }

  store.patients.forEach((patient) => {
    if (patient.nurseId !== nurse.id) {
      return;
    }
    const agentMismatch = !nurseHasAgent(nurse, patient.agentEmail || "");
    const nurseUnavailable = nurse.status !== "Approved" || nurse.isAvailable === false;
    if (agentMismatch || nurseUnavailable) {
      clearPatientFinancials(patient);
    }
  });

  writeStore(store);
  setFlash(req, "success", "Nurse record updated.");
  return res.redirect(`/admin/nurses?status=${encodeURIComponent(statusFilter)}`);
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
    .filter((item) => normalizeEmail(item.agentEmail) === agentEmail)
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

app.post("/agent/patients/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = normalizeEmail(req.body.email);
  const phoneNumber = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const careRequirement = String(req.body.careRequirement || "").trim();
  const duration = String(req.body.duration || "").trim();
  const budget = parseBudgetRange(req.body.budgetMin, req.body.budgetMax);

  if (!fullName || !email || !phoneNumber || !city || !careRequirement || !duration) {
    setFlash(req, "error", "Please complete all required patient fields.");
    return res.redirect("/agent/patients/new");
  }
  if (!normalizePhone(phoneNumber)) {
    setFlash(req, "error", "Please enter a valid phone number.");
    return res.redirect("/agent/patients/new");
  }
  if (budget.error) {
    setFlash(req, "error", budget.error);
    return res.redirect("/agent/patients/new");
  }

  const store = readNormalizedStore();
  const patientId = nextId(store, "patient");
  store.patients.push({
    id: patientId,
    fullName,
    email,
    phoneNumber,
    city,
    careRequirement,
    duration,
    budgetMin: budget.budgetMin,
    budgetMax: budget.budgetMax,
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
  });
  writeStore(store);

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
  if (typeof patient.budgetMax === "number" && roundedNurseAmount > patient.budgetMax) {
    setFlash(req, "error", "Nurse amount should be within patient budget range.");
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

app.post("/agent/nurses/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return createNurseUnderAgent(req, res, "/agent/nurses/new");
});

app.get("/agent/agents/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.render("agent/add-agent", { title: "Add Agent" });
});

app.post("/agent/agents/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return createAgentUnderAgent(req, res, "/agent/agents/new");
});

app.get("/nurse/profile", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === req.nurseRecord.id);
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
    referralLink: `/agent/nurses/new?ref=${encodeURIComponent(nurse.referralCode)}`
  });
});

// Nurse Dashboard route - redirects to /nurse/profile
app.get("/nurse/dashboard", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  return res.redirect("/nurse/profile");
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

app.use((req, res) => {
  return res.status(404).render("shared/not-found", { title: "Page Not Found" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Prisha Home Care running on http://localhost:${PORT}`);
});
