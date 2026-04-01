const express = require("express");
const runtime = require("../services/runtimeContext");

function createNurseSupportController() {
  const router = express.Router();
  const {
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
    PROFILE_DIR,
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
    certificateStorage,
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
    profileStorage,
    rateLimit,
    readNormalizedStore,
    redirectByRole,
    requireApprovedAgent,
    requireApprovedNurse,
    requireAuth,
    requireRole,
    resolveAgentLinkContext,
    resumeStorage,
    runMulterMiddleware,
    sanitizeInput,
    session,
    setFlash,
    setNurseAgentEmails,
    stagePublicAgentRegistration,
    toArray,
    toBoolean,
    uploadBufferToCloudinary,
    uploadCertificate,
    uploadNurseProfileFiles,
    uploadProfileImage,
    uploadResume,
    validateEmail,
    validateIndiaPhone,
    validateRequest,
    validateServiceSchedule,
  } = runtime;

const UNIFIED_NURSE_ASSET_DIR = path.join(UPLOAD_DIR, "nurse-assets");
const UNIFIED_NURSE_PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const UNIFIED_NURSE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const UNIFIED_NURSE_PROFILE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const UNIFIED_NURSE_PROFILE_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const UNIFIED_NURSE_DOCUMENT_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const UNIFIED_NURSE_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

fs.mkdirSync(UNIFIED_NURSE_ASSET_DIR, { recursive: true });

function getManagedNurseOwnershipSql(alias, emailParamRef, userIdParamRef) {
  return `(
    LOWER(COALESCE(${alias}.agent_email, '')) = LOWER(${emailParamRef})
    OR EXISTS (
      SELECT 1
      FROM unnest(COALESCE(${alias}.agent_emails, ARRAY[]::text[])) AS ae(agent_email)
      WHERE LOWER(agent_email) = LOWER(${emailParamRef})
    )
    OR EXISTS (
      SELECT 1
      FROM agent_nurse_roster anr
      WHERE anr.nurse_id = ${alias}.id
        AND anr.agent_id = ${userIdParamRef}
    )
  )`;
}

function canEditManagedNurse(currentUser, nurse) {
  if (!currentUser || !nurse) return false;
  if (currentUser.role === "admin") return true;
  if (currentUser.role === "nurse") {
    return Number(nurse.userId || nurse.user_id) === Number(currentUser.id);
  }
  if (currentUser.role === "agent") {
    return nurseHasAgent(nurse, currentUser.email);
  }
  return false;
}

async function getEditableNurseRecord(currentUser, nurseId, client = pool) {
  if (!currentUser || !Number.isInteger(nurseId) || nurseId <= 0) {
    return null;
  }

  if (currentUser.role === "admin") {
    const result = await client.query(
      `SELECT
          n.id,
          n.user_id,
          COALESCE(n.profile_image_url, '') AS profile_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_image_url'), '') AS aadhar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_image_url'), '') AS aadhaar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_card_url'), '') AS aadhaar_card_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_card_url'), '') AS aadhar_card_url
       FROM nurses n
       WHERE n.id = $1
       LIMIT 1
       FOR UPDATE`,
      [nurseId]
    );
    return result.rows[0] || null;
  }

  if (currentUser.role === "nurse") {
    const result = await client.query(
      `SELECT
          n.id,
          n.user_id,
          COALESCE(n.profile_image_url, '') AS profile_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_image_url'), '') AS aadhar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_image_url'), '') AS aadhaar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_card_url'), '') AS aadhaar_card_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_card_url'), '') AS aadhar_card_url
       FROM nurses n
       WHERE n.id = $1
         AND n.user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [nurseId, currentUser.id]
    );
    return result.rows[0] || null;
  }

  if (currentUser.role === "agent") {
    const result = await client.query(
      `SELECT
          n.id,
          n.user_id,
          COALESCE(n.profile_image_url, '') AS profile_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_image_url'), '') AS aadhar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_image_url'), '') AS aadhaar_image_url,
          COALESCE((to_jsonb(n) ->> 'aadhaar_card_url'), '') AS aadhaar_card_url,
          COALESCE((to_jsonb(n) ->> 'aadhar_card_url'), '') AS aadhar_card_url
       FROM nurses n
       WHERE n.id = $1
         AND ${getManagedNurseOwnershipSql("n", "$2", "$3")}
       LIMIT 1
       FOR UPDATE`,
      [nurseId, normalizeEmail(currentUser.email), currentUser.id]
    );
    return result.rows[0] || null;
  }

  return null;
}

const unifiedNurseAssetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UNIFIED_NURSE_ASSET_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const prefix = file.fieldname === "profileImage" ? "nurse-profile" : "nurse-document";
    cb(null, `${prefix}-${uniqueSuffix}${extension}`);
  }
});

const unifiedNurseAssetUpload = multer({
  storage: unifiedNurseAssetStorage,
  limits: { fileSize: UNIFIED_NURSE_DOCUMENT_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const mimetype = String(file.mimetype || "").toLowerCase();

    if (file.fieldname === "profileImage") {
      if (
        UNIFIED_NURSE_PROFILE_ALLOWED_EXTENSIONS.has(extension)
        && UNIFIED_NURSE_PROFILE_ALLOWED_MIME_TYPES.has(mimetype)
      ) {
        return cb(null, true);
      }
      return cb(new Error("Profile image must be JPG, PNG, or WEBP."));
    }

    if (file.fieldname === "aadhaarDoc") {
      if (
        UNIFIED_NURSE_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)
        && UNIFIED_NURSE_DOCUMENT_ALLOWED_MIME_TYPES.has(mimetype)
      ) {
        return cb(null, true);
      }
      return cb(new Error("Document must be JPG, PNG, WEBP, or PDF."));
    }

    return cb(new Error("Unsupported upload field."));
  }
}).fields([
  { name: "profileImage", maxCount: 1 },
  { name: "aadhaarDoc", maxCount: 1 }
]);

function unifiedNurseAssetUploadMiddleware(req, res, next) {
  unifiedNurseAssetUpload(req, res, async (error) => {
    if (!error) {
      const profileImageFile = req.files && req.files.profileImage ? req.files.profileImage[0] : null;
      if (profileImageFile && Number(profileImageFile.size || 0) > UNIFIED_NURSE_PROFILE_IMAGE_MAX_BYTES) {
        await deleteLocalAsset(`/uploads/nurse-assets/${profileImageFile.filename}`);
        setFlash(req, "error", "Profile image must be 5MB or smaller.");
        return res.redirect(req.get("referer") || "/nurse/profile");
      }
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      setFlash(req, "error", "Uploaded file is too large. Maximum allowed size is 5MB.");
      return res.redirect(req.get("referer") || "/nurse/profile");
    }

    setFlash(req, "error", error.message || "Unable to upload the selected file right now.");
    return res.redirect(req.get("referer") || "/nurse/profile");
  });
}

router.get("/nurse/profile", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const store = readNormalizedStore();
  const nurse = await getNurseByUserId(req.currentUser.id);
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  const assignedAgents = getNurseAgentEmails(nurse).map((agentEmail) => {
    const agent = store.agents.find((item) => normalizeEmail(item.email) === agentEmail);
    return {
      email: agentEmail,
      name: agent ? agent.fullName : "Unknown Agent",
      workingRegion: agent ? (agent.workingRegion || agent.region || "-") : "-",
      region: agent ? (agent.workingRegion || agent.region || "-") : "-"
    };
  });
  const referredNurses = store.nurses
    .filter((item) => item.referredByNurseId === nurse.id && !isStoreUserDeleted(store, item.userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const referralPatients = store.patients
    .filter((patient) => patient.referrerNurseId === nurse.id && typeof patient.referralCommissionAmount === "number")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const referralTotal = referralPatients.reduce((sum, patient) => sum + (patient.referralCommissionAmount || 0), 0);

  return res.render("nurse/profile", {
    title: "Nurse Profile",
    nurse,
    role: req.session.user.role,
    canEdit: canEditManagedNurse(req.currentUser, nurse),
    assetsUpdateAction: `/nurse/${nurse.id}/update-assets`,
    assetsRedirectTo: "/nurse/profile",
    contactContext: buildNurseContactContext(nurse, req.currentUser),
    assignedAgents,
    referredNurses,
    referralPatients,
    referralTotal: Number(referralTotal.toFixed(2)),
    referralLink: `/agent/nurses/new?ref=${encodeURIComponent(nurse.referralCode || "")}`
  });
});

router.get("/nurse/dashboard", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  try {
    const nurseResult = await pool.query(
      "SELECT id, COALESCE(claimed_by_nurse, FALSE) AS claimed_by_nurse FROM nurses WHERE user_id = $1",
      [req.session.user.id]
    );

    if (!nurseResult.rows.length) {
      return res.status(403).send("Nurse profile not found");
    }

    const nurseId = nurseResult.rows[0].id;
    const showOwnershipBanner = nurseResult.rows[0].claimed_by_nurse !== true;
    const nurseProfile = await getNurseById(nurseId);
    const statsResult = await pool.query(
      `SELECT
          (SELECT COUNT(*)
           FROM care_applications
           WHERE nurse_id = $1
             AND status = 'pending') AS pending_apps,
          (SELECT COUNT(*)
           FROM care_requests
           WHERE assigned_nurse_id = $1
             AND status IN ('assigned', 'payment_pending', 'active')) AS assigned_jobs,
          (SELECT COUNT(*)
           FROM care_requests
           WHERE assigned_nurse_id = $1
             AND status = 'completed') AS completed_jobs,
          (SELECT COUNT(*)
           FROM care_requests
           WHERE status = 'open'
             AND COALESCE(visibility_status, 'pending') = 'approved') AS marketplace_open`,
      [nurseId]
    );

    return res.render("nurse/dashboard", {
      title: "Nurse Dashboard",
      user: req.session.user,
      stats: statsResult.rows[0],
      profileCard: nurseProfile
        ? buildPublicNurseProfileView({
          ...nurseProfile,
          ratingAverage: nurseProfile.ratingAverage || 0,
          reviewCount: nurseProfile.reviewCount || 0
        })
        : null,
      showOwnershipBanner,
      pendingEmailVerification: String(req.session.pendingNurseEmailVerification || "").trim()
    });
  } catch (error) {
    console.error("Nurse dashboard stats error:", error);
    return res.status(500).send("Server Error");
  }
});

router.post("/nurse/request-email-otp", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const emailInput = String(req.body.new_email || "").trim();
  const emailValidation = validateEmail(emailInput);

  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect("/nurse/dashboard");
  }

  const email = emailValidation.value;

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser && existingUser.id !== req.currentUser.id) {
      setFlash(req, "error", "Email already in use.");
      return res.redirect("/nurse/dashboard");
    }

   
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await updateUser(req.currentUser.id, {
      otpCode,
      otpExpiry
    });

    req.session.pendingNurseEmailVerification = email;

    const nurse = await getNurseByUserId(req.currentUser.id);
    await sendVerificationOtpEmail(email, (nurse && nurse.fullName) || req.currentUser.fullName || "Nurse", otpCode);

    setFlash(req, "success", "OTP sent to your email.");
    return res.redirect("/nurse/dashboard");
  } catch (error) {
    console.error("Nurse email OTP request error:", error);
    setFlash(req, "error", "Unable to send OTP right now.");
    return res.redirect("/nurse/dashboard");
  }
});

router.post("/nurse/verify-email-otp", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const pendingEmail = String(req.session.pendingNurseEmailVerification || "").trim();
  const otp = String(req.body.otp || "").trim();

  if (!pendingEmail) {
    setFlash(req, "error", "Start email verification again.");
    return res.redirect("/nurse/dashboard");
  }

  if (!/^\d{6}$/.test(otp)) {
    setFlash(req, "error", "Enter a valid 6-digit OTP.");
    return res.redirect("/nurse/dashboard");
  }

  try {
    const user = await getUserById(req.currentUser.id);
    if (!user || !user.otpCode || String(user.otpCode).trim() !== otp || new Date() > new Date(user.otpExpiry)) {
      setFlash(req, "error", "Invalid or expired OTP.");
      return res.redirect("/nurse/dashboard");
    }

    const updatedUser = await updateUser(req.currentUser.id, {
      email: pendingEmail,
      emailVerified: true,
      otpCode: "",
      otpExpiry: null
    });

    const nurse = await getNurseByUserId(req.currentUser.id);
    if (nurse && nurse.claimedByNurse !== true) {
      await updateNurse(nurse.id, {
        claimedByNurse: true
      });
    }

    delete req.session.pendingNurseEmailVerification;
    req.session.user = await getSessionUserPayload(updatedUser || user);

    setFlash(req, "success", "Email verified successfully.");
    return res.redirect("/nurse/dashboard");
  } catch (error) {
    console.error("Nurse email OTP verify error:", error);
    setFlash(req, "error", "Unable to verify OTP right now.");
    return res.redirect("/nurse/dashboard");
  }
});

router.get("/verify-email", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  try {
    const nurse = await getNurseByUserId(req.currentUser.id);
    if (!nurse) {
      setFlash(req, "error", "Nurse profile not found.");
      return res.redirect("/nurse/dashboard");
    }

    if (nurse.claimedByNurse === true) {
      setFlash(req, "success", "Your account is already verified and claimed.");
      return res.redirect("/nurse/dashboard");
    }

    if (!req.currentUser.email) {
      setFlash(req, "error", "Add your email first to continue verification.");
      return res.redirect("/nurse/dashboard");
    }

    if (!req.currentUser.emailVerified) {
      
      const generatedOtp = crypto.randomInt(1000, 10000).toString();
      const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await updateUser(req.currentUser.id, {
        otpCode: generatedOtp,
        otpExpiry: otpExpiry.toISOString()
      });

      try {
        await sendVerificationOtpEmail(req.currentUser.email, nurse.fullName || req.currentUser.fullName || "Nurse", generatedOtp);
      } catch (error) {
        console.error(`Ownership verification OTP email failed for ${req.currentUser.email}:`, error);
      }

      setFlash(req, "success", "Verification OTP sent to your email.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(req.currentUser.email)}`);
    }

    await updateNurse(nurse.id, {
      claimedByNurse: true
    });

    req.session.user = await getSessionUserPayload(req.currentUser);
    setFlash(req, "success", "You now have full control of your account.");
    return res.redirect("/nurse/dashboard");
  } catch (error) {
    console.error("Nurse ownership verification error:", error);
    setFlash(req, "error", "Unable to complete verification right now.");
    return res.redirect("/nurse/dashboard");
  }
});

router.get("/nurse/applications", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  return res.redirect("/nurse/care-requests#pending");
});

router.post("/nurse/password/change", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    setFlash(req, "error", "Please fill all password fields.");
    return res.redirect("/nurse/profile");
  }
  if (newPassword.length < 8) {
    setFlash(req, "error", "New password must be at least 8 characters.");
    return res.redirect("/nurse/profile");
  }
  if (newPassword !== confirmPassword) {
    setFlash(req, "error", "New password and confirmation do not match.");
    return res.redirect("/nurse/profile");
  }

  const user = await getUserById(req.currentUser.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    setFlash(req, "error", "Current password is incorrect.");
    return res.redirect("/nurse/profile");
  }
  if (bcrypt.compareSync(newPassword, user.passwordHash)) {
    setFlash(req, "error", "New password must be different from current password.");
    return res.redirect("/nurse/profile");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updatedUser = await updateUser(req.currentUser.id, { passwordHash });
  if (!updatedUser) {
    setFlash(req, "error", "Unable to update password right now.");
    return res.redirect("/nurse/profile");
  }

  setFlash(req, "success", "Password updated successfully.");
  return res.redirect("/nurse/profile");
});

router.post(
  "/nurse/:id/update-assets",
  requireAuth,
  unifiedNurseAssetUploadMiddleware,
  async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    const redirectTo = String(req.body.redirectTo || "").startsWith("/")
      ? String(req.body.redirectTo)
      : (req.currentUser && req.currentUser.role === "admin"
        ? `/admin/user/view/nurse/${req.params.id}`
        : (req.currentUser && req.currentUser.role === "agent"
          ? `/agent/nurses/${req.params.id}`
          : "/nurse/profile"));
    const profileImageFile = req.files && req.files.profileImage ? req.files.profileImage[0] : null;
    const aadhaarDocFile = req.files && req.files.aadhaarDoc ? req.files.aadhaarDoc[0] : null;
    const nextProfileImageUrl = profileImageFile ? `/uploads/nurse-assets/${profileImageFile.filename}` : "";
    const nextAadhaarDocUrl = aadhaarDocFile ? `/uploads/nurse-assets/${aadhaarDocFile.filename}` : "";
    const uploadedAssetUrls = [nextProfileImageUrl, nextAadhaarDocUrl].filter(Boolean);

    if (Number.isNaN(nurseId) || nurseId <= 0) {
      await Promise.all(uploadedAssetUrls.map((assetUrl) => deleteLocalAsset(assetUrl)));
      setFlash(req, "error", "Invalid nurse.");
      return res.redirect(redirectTo);
    }

    if (!profileImageFile && !aadhaarDocFile) {
      setFlash(req, "error", "Please choose a file to upload.");
      return res.redirect(redirectTo);
    }

    let client;
    let updatedNurseUserId = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const editableNurse = await getEditableNurseRecord(req.currentUser, nurseId, client);
      if (!editableNurse) {
        throw new Error("Unauthorized");
      }

      updatedNurseUserId = Number(editableNurse.user_id) || null;
      const previousProfileImageUrl = String(editableNurse.profile_image_url || "").trim();
      const previousAadhaarDocUrl = String(
        editableNurse.aadhar_image_url
        || editableNurse.aadhaar_image_url
        || editableNurse.aadhaar_card_url
        || editableNurse.aadhar_card_url
        || ""
      ).trim();

      await client.query(
        `UPDATE nurses
         SET profile_image_url = COALESCE($1, profile_image_url),
             aadhar_image_url = COALESCE($2, aadhar_image_url)
         WHERE id = $3`,
        [
          nextProfileImageUrl || null,
          nextAadhaarDocUrl || null,
          nurseId
        ]
      );

      await client.query("COMMIT");

      await Promise.all([
        nextProfileImageUrl && previousProfileImageUrl && previousProfileImageUrl !== nextProfileImageUrl
          ? deleteLocalAsset(previousProfileImageUrl)
          : Promise.resolve(),
        nextAadhaarDocUrl && previousAadhaarDocUrl && previousAadhaarDocUrl !== nextAadhaarDocUrl
          ? deleteLocalAsset(previousAadhaarDocUrl)
          : Promise.resolve()
      ]);

      if (req.currentUser.role === "nurse" && updatedNurseUserId === req.currentUser.id) {
        const refreshedUser = await getUserById(req.currentUser.id);
        req.session.user = await getSessionUserPayload(refreshedUser);
      }

      setFlash(req, "success", "Profile assets updated successfully.");
      return res.redirect(redirectTo);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Unified nurse asset upload rollback error:", rollbackError);
        }
      }
      await Promise.all(uploadedAssetUrls.map((assetUrl) => deleteLocalAsset(assetUrl)));
      console.error("Unified nurse asset upload error:", error);
      setFlash(req, "error", error.message === "Unauthorized" ? "Unauthorized" : (error.message || "Unable to update profile assets right now."));
      return res.redirect(redirectTo);
    } finally {
      if (client) client.release();
    }
  }
);

// Nurse Profile Edit GET route
router.get("/nurse/profile/edit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  return res.render("nurse/profile-edit", {
    title: "Update Profile",
    nurse,
    profileSkillOptions: PROFILE_SKILL_OPTIONS,
    qualificationOptions: PROFILE_QUALIFICATION_OPTIONS,
    currentStatusOptions: PROFILE_CURRENT_STATUS_OPTIONS
  });
});

// Nurse Profile Edit POST route with Cloudinary file uploads
router.post("/nurse/profile/edit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
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

  const currentStatusInput = String(
    req.body.current_status
    || req.body.currentStatus
    || ""
  ).trim();
  const currentStatus = normalizeCurrentStatusInput(currentStatusInput);
  if (!currentStatus) {
    setFlash(req, "error", "Please select a valid current status.");
    return res.redirect("/nurse/profile/edit");
  }
  const heightText = String(req.body.height || req.body.heightText || "").trim();
  if (heightText && heightText.length > 20) {
    setFlash(req, "error", "Height should be a short value like 5'4\".");
    return res.redirect("/nurse/profile/edit");
  }

  const weightInput = String(req.body.weight || req.body.weightKg || "").trim();
  const weightKg = weightInput === "" ? undefined : Number.parseInt(weightInput, 10);
  if (typeof weightKg !== "undefined" && (Number.isNaN(weightKg) || weightKg < 20 || weightKg > 250)) {
    setFlash(req, "error", "Weight must be between 20 and 250 kg.");
    return res.redirect("/nurse/profile/edit");
  }

  const dutyType = String(req.body.dutyType || req.body.duty_type || "").trim();
  if (dutyType && dutyType.length > 80) {
    setFlash(req, "error", "Duty type is too long.");
    return res.redirect("/nurse/profile/edit");
  }

  const availabilityLabel = String(req.body.availabilityLabel || req.body.availability_label || "").trim();
  if (availabilityLabel && availabilityLabel.length > 50) {
    setFlash(req, "error", "Availability label is too long.");
    return res.redirect("/nurse/profile/edit");
  }

  const languagesRaw = String(req.body.languagesRaw || "").trim();
  const languages = languagesRaw
    ? [...new Set(languagesRaw.split(",").map((item) => String(item || "").trim()).filter(Boolean))]
    : normalizeArray(req.body.languages).map((item) => String(item || "").trim()).filter(Boolean);
  if (languages.length > 10) {
    setFlash(req, "error", "Please keep languages to 10 items or fewer.");
    return res.redirect("/nurse/profile/edit");
  }

  const selectedSkills = normalizeArray(req.body.skills)
    .map((item) => String(item || "").trim())
    .filter((item) => PROFILE_SKILL_OPTIONS.includes(item));

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
  setIfDefined("current_status", currentStatus);
  setIfDefined("availability_label", availabilityLabel || currentStatus);
  setIfDefined("experience_years", experienceYears);
  setIfDefined("experience_months", experienceMonths);
  setIfDefined("aadhaar_number", aadhaarDigits);
  setIfDefined("height_text", heightText);
  setIfDefined("weight_kg", weightKg);
  setIfDefined("languages", languages);
  setIfDefined("duty_type", dutyType);
  setIfDefined("is_verified", String(nurse.status || "").toLowerCase() === "approved");
  setIfDefined("skills", selectedSkills);
  setIfDefined("work_locations", normalizedWorkLocations);

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
    if (files.medicalFit && files.medicalFit[0]) {
      const uploadedMedicalFit = await uploadBufferToCloudinary(files.medicalFit[0], "home-care/nurses/medical-fit");
      setIfDefined("medical_fit_url", uploadedMedicalFit.secure_url);
    }
    if (files.highestCert && files.highestCert[0]) {
      const uploadedHighest = await uploadBufferToCloudinary(files.highestCert[0], "home-care/nurses/highest-cert");

    }
    if (files.tenthCert && files.tenthCert[0]) {
      const uploadedTenth = await uploadBufferToCloudinary(files.tenthCert[0], "home-care/nurses/tenth-cert");

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

    // 1. Fetch current nurse row from database
    const { rows: existingRows } = await pool.query(
      "SELECT * FROM nurses WHERE id = $1",
      [nurse.id]
    );
    const existingNurse = existingRows[0] || {};

    // Helper to safely sort arrays for comparison
    const safeSort = (arr) => (Array.isArray(arr) ? [...arr].sort() : []);

    // 2. Determine if any HARD fields changed (handling nulls and array order)
    const hardFieldChanged =
      (existingNurse.aadhaar_number || "") !== aadhaarDigits ||
      (existingNurse.experience_years || 0) !== experienceYears ||
      (existingNurse.experience_months || 0) !== experienceMonths ||
      JSON.stringify(safeSort(existingNurse.skills)) !== JSON.stringify(safeSort(selectedSkills)) ||
      (existingNurse.height_text || "") !== heightText ||
      Number(existingNurse.weight_kg || 0) !== Number(weightKg || 0) ||
      (existingNurse.duty_type || "") !== dutyType;

    // 3. Apply cooldown and status lock
    if (existingNurse.profile_status === "approved" && hardFieldChanged) {
      if (existingNurse.last_edit_request) {
        const daysSinceLastEdit =
          (new Date() - new Date(existingNurse.last_edit_request)) / (1000 * 60 * 60 * 24);

        if (daysSinceLastEdit < 7) {
          setFlash(
            req,
            "error",
            "You can request profile changes only once every 7 days after approval."
          );
          return res.redirect("/nurse/profile/edit");
        }
      }

      await pool.query(
        "UPDATE nurses SET profile_status = $1, last_edit_request = NOW() WHERE id = $2",
        ["pending", nurse.id]
      );
    }

    if (profilePicDbColumn === "profile_pic_url") {
      await pool.query(
        `UPDATE nurses SET
          city = COALESCE($1, city),
          current_address = COALESCE($2, current_address),
          current_status = COALESCE($3, current_status),
          experience_years = COALESCE($4, experience_years),
          experience_months = COALESCE($5, experience_months),
          aadhaar_number = COALESCE($6, aadhaar_number),
          skills = COALESCE($7, skills),
          work_locations = COALESCE($8, work_locations),
          qualifications = COALESCE($9, qualifications),
          resume_url = COALESCE($10, resume_url),
          profile_pic_url = COALESCE($11, profile_pic_url),
          height_text = COALESCE($12, height_text),
          weight_kg = COALESCE($13, weight_kg),
          languages = COALESCE($14, languages),
          duty_type = COALESCE($15, duty_type),
          availability_label = COALESCE($16, availability_label),
          is_verified = COALESCE($17, is_verified),
          medical_fit_url = COALESCE($18, medical_fit_url)
        WHERE id = $19`,
        [
          pickValue("city"),
          pickValue("current_address"),
          pickValue("current_status"),
          pickValue("experience_years"),
          pickValue("experience_months"),
          pickValue("aadhaar_number"),
          pickValue("skills"),
          pickValue("work_locations"),
          pickValue("qualifications"),
          pickValue("resume_url"),
          pickValue("profile_pic_url"),
          pickValue("height_text"),
          pickValue("weight_kg"),
          pickValue("languages"),
          pickValue("duty_type"),
          pickValue("availability_label"),
          pickValue("is_verified"),
          pickValue("medical_fit_url"),
          nurse.id
        ]
      );
    } else {
      await pool.query(
        `UPDATE nurses SET
          city = COALESCE($1, city),
          current_address = COALESCE($2, current_address),
          current_status = COALESCE($3, current_status),
          experience_years = COALESCE($4, experience_years),
          experience_months = COALESCE($5, experience_months),
          aadhaar_number = COALESCE($6, aadhaar_number),
          skills = COALESCE($7, skills),
          work_locations = COALESCE($8, work_locations),
          qualifications = COALESCE($9, qualifications),
          resume_url = COALESCE($10, resume_url),
          profile_image_path = COALESCE($11, profile_image_path),
          height_text = COALESCE($12, height_text),
          weight_kg = COALESCE($13, weight_kg),
          languages = COALESCE($14, languages),
          duty_type = COALESCE($15, duty_type),
          availability_label = COALESCE($16, availability_label),
          is_verified = COALESCE($17, is_verified),
          medical_fit_url = COALESCE($18, medical_fit_url)
        WHERE id = $19`,
        [
          pickValue("city"),
          pickValue("current_address"),
          pickValue("current_status"),
          pickValue("experience_years"),
          pickValue("experience_months"),
          pickValue("aadhaar_number"),
          pickValue("skills"),
          pickValue("work_locations"),
          pickValue("qualifications"),
          pickValue("resume_url"),
          pickValue("profile_image_path"),
          pickValue("height_text"),
          pickValue("weight_kg"),
          pickValue("languages"),
          pickValue("duty_type"),
          pickValue("availability_label"),
          pickValue("is_verified"),
          pickValue("medical_fit_url"),
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

  setFlash(req, "success", "Profile updated successfully.");
  return res.redirect("/nurse/profile");
});

router.post("/nurse/profile/submit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  const nurse = await getNurseById(req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  try {
    const nurseResult = await pool.query(
      `SELECT
         (to_jsonb(n) ->> 'aadhaar_card_url') AS aadhaar_card_url,
         (to_jsonb(n) ->> 'aadhar_image_url') AS aadhar_image_url,
         (to_jsonb(n) ->> 'aadhaar_image_url') AS aadhaar_image_url,
         (to_jsonb(n) ->> 'aadhar_card_url') AS aadhar_card_url,
         (to_jsonb(n) ->> 'aadhar_number') AS aadhar_number,
         (to_jsonb(n) ->> 'aadhaar_number') AS aadhaar_number,
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

    const aadharNumber = String(nurseRow.aadhar_number || nurseRow.aadhaar_number || "").replace(/\D/g, "");
    const aadhaarCardUrl = String(
      nurseRow.aadhar_image_url
      || nurseRow.aadhaar_card_url
      || nurseRow.aadhaar_image_url
      || nurseRow.aadhar_card_url
      || ""
    ).trim();
    const skills = Array.isArray(nurseRow.skills) ? nurseRow.skills : [];

    if (aadharNumber && !aadhaarCardUrl) {
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

router.post("/nurse/profile/skills", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  try {
    const nurse = await getNurseById(req.nurseRecord.id);
    if (!nurse) {
      return res.status(404).json({ error: "Nurse not found" });
    }

    const rawSkills = Array.isArray(req.body && req.body.skills)
      ? req.body.skills
      : (req.body && typeof req.body.skills !== "undefined" ? [req.body.skills] : []);

    const cleanedSkills = (rawSkills || [])
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0);

    if (cleanedSkills.length < 3) {
      return res.status(400).json({ error: "Minimum 3 skills required" });
    }

    if (cleanedSkills.length > 20) {
      return res.status(400).json({ error: "Maximum 20 skills allowed." });
    }

    const { rows } = await pool.query(
      "SELECT skills, profile_status, last_edit_request FROM nurses WHERE id = $1",
      [nurse.id]
    );

    const existing = rows[0] || {};
    const safeSort = (arr) => (Array.isArray(arr) ? [...arr].sort() : []);

    const changed =
      JSON.stringify(safeSort(existing.skills)) !==
      JSON.stringify(safeSort(cleanedSkills));

    if (existing.profile_status === "approved" && changed) {
      if (existing.last_edit_request) {
        const days =
          (new Date() - new Date(existing.last_edit_request)) /
          (1000 * 60 * 60 * 24);
        if (days < 7) {
          return res.status(400).json({
            error:
              "You can request hard field changes only once every 7 days."
          });
        }
      }

      await pool.query(
        "UPDATE nurses SET profile_status = $1, last_edit_request = NOW() WHERE id = $2",
        ["pending", nurse.id]
      );
    }

    await pool.query(
      "UPDATE nurses SET skills = $1 WHERE id = $2",
      [cleanedSkills, nurse.id]
    );

    const { rows: updatedRows } = await pool.query(
      "SELECT * FROM nurses WHERE id = $1",
      [nurse.id]
    );

    const updatedNurse = updatedRows[0];
    const completion = calculateProfileCompletion(updatedNurse);

    await pool.query(
      "UPDATE nurses SET profile_completion = $1 WHERE id = $2",
      [completion, nurse.id]
    );

    return res.json({ success: true, skills: cleanedSkills });
  } catch (error) {
    console.error("Skills update error:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/nurse/profile/public", requireRole("nurse"), requireApprovedNurse, (req, res) => {
  const store = readNormalizedStore();
  const nurse = store.nurses.find((item) => item.id === req.nurseRecord.id);
  if (!nurse) {
    setFlash(req, "error", "Nurse profile not found.");
    return res.redirect("/nurse/profile");
  }

  nurse.profileImageUrl = String(req.body.profileImageUrl || "").trim();
  nurse.publicBio = String(req.body.publicBio || "").trim();
  nurse.publicShowCity = toBoolean(req.body.publicShowCity);
  nurse.publicShowExperience = toBoolean(req.body.publicShowExperience);
  nurse.publicSkills = toArray(req.body.publicSkills).filter((skill) => SKILLS_OPTIONS.includes(skill));

  writeStore(store);
  setFlash(req, "success", "Public profile settings updated.");
  return res.redirect("/nurse/profile");
});

// Complete Nurse Profile Route
router.post("/nurse/profile/complete", requireRole("nurse"), requireApprovedNurse, (req, res) => {
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
    "8 Hour Shift",
    "12 Hour Shift (Day)",
    "12 Hour Shift (Night)",
    "24 Hour Live-In",
    "One-Time / Few Visits"
  ];
  nurse.availability = toArray(req.body.availability).filter((avail) => newAvailabilityOptions.includes(avail));

  // Update current status (optional)
  const normalizedCurrentStatus = normalizeCurrentStatusInput(
    req.body.current_status || req.body.currentStatus || ""
  );
  if (normalizedCurrentStatus) {
    nurse.currentStatus = normalizedCurrentStatus;
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
router.get("/verify-email/:token", (req, res) => {
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
router.get("/forgot-password", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("auth/forgot-password", {
    title: "Forgot Password",
    prefillEmail: String(req.query.email || "").trim()
  });
});

// Request password reset OTP
router.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
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
        AND COALESCE(u.is_deleted, false) = false
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
router.get("/forgot-password/verify", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }

  return res.render("auth/verify-reset-otp", {
    title: "Verify Reset OTP",
    email: String(req.query.email || "").trim()
  });
});

// Verify reset OTP and enable password reset session
router.post("/forgot-password/verify", async (req, res) => {
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
         AND COALESCE(is_deleted, false) = false
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
router.get("/reset-password", (req, res) => {
  if (!req.session.canResetPassword || !req.session.resetUserId) {
    setFlash(req, "error", "Unauthorized password reset attempt.");
    return res.redirect("/forgot-password");
  }
  return res.render("auth/reset-password", {
    title: "Reset Password"
  });
});

// Process password reset (OTP session protected)
router.post("/reset-password", async (req, res) => {
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
       WHERE id = $2
         AND COALESCE(is_deleted, false) = false`,
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
router.get("/reset-password/:token", (req, res) => {
  setFlash(req, "error", "Reset link flow is disabled. Please request a 6-digit OTP.");
  return res.redirect("/forgot-password");
});

router.post("/reset-password/:token", (req, res) => {
  setFlash(req, "error", "Unauthorized password reset attempt.");
  return res.redirect("/forgot-password");
});

// ============================================================
// CONCERN SYSTEM ROUTES
// ============================================================

// Raise concern page (for logged in users)
router.get("/concern/new", requireAuth, (req, res) => {
  return res.render("public/raise-concern", { title: "Raise Concern" });
});

// Submit concern
router.post("/concern/new", requireAuth, async (req, res) => {
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
router.get("/my-concerns", requireAuth, (req, res) => {
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
router.get("/admin/concerns", requireRole("admin"), (req, res) => {
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
router.post("/admin/concerns/:id/update", requireRole("admin"), (req, res) => {
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

  if (!isProduction) {
    console.log(`OTP generated for request ${requestId} in local mode.`);
  }

  // Simulate successful OTP sending
  return { success: true };
}

// Step 1: Request OTP for editing a request
router.get("/edit-request/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();

  try {
    const requestRecord = await getPublicCareRequestRecordByEditToken(token);
    if (!requestRecord) {
      setFlash(req, "error", "Invalid edit link.");
      return res.redirect("/track-request");
    }

    return res.render("public/request-edit", {
      title: "Edit Request",
      request: requestRecord,
      serviceScheduleOptions: SERVICE_SCHEDULE_OPTIONS
    });
  } catch (error) {
    console.error("Public edit request page error:", error);
    setFlash(req, "error", "Unable to load your request right now.");
    return res.redirect("/track-request");
  }
});

router.post("/edit-request/:requestId/send-otp", loginRateLimiter, async (req, res) => {
  return res.redirect("/track-request");
});

router.get("/edit-request/:requestId/verify", (req, res) => {
  return res.redirect("/track-request");
});

router.post("/edit-request/:requestId/verify", (req, res) => {
  return res.redirect("/track-request");
});

router.get("/edit-request/:requestId/form", (req, res) => {
  return res.redirect("/track-request");
});

router.post("/edit-request/:requestId/update", (req, res) => {
  return res.redirect("/track-request");
});

// ============================================================
// ADMIN USER MANAGEMENT ROUTES
// ============================================================

// Admin view user profile
router.get("/admin/user/view/:role/:id", requireRole("admin"), async (req, res) => {
  const role = String(req.params.role || "");
  const userId = Number.parseInt(req.params.id, 10);

  if (!["nurse", "agent"].includes(role) || Number.isNaN(userId)) {
    return res.status(404).render("shared/not-found", { title: "Not Found" });
  }

  if (role === "nurse") {
    const nurse = await getNurseById(userId, { includeDeletedUsers: true });
    if (!nurse) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    return res.render("admin/view-nurse", {
      title: "View Nurse",
      nurse,
      role: req.session.user.role,
      canEdit: canEditManagedNurse(req.currentUser, nurse),
      assetsUpdateAction: `/nurse/${nurse.id}/update-assets`,
      assetsRedirectTo: `/admin/user/view/nurse/${nurse.id}`,
      contactContext: buildNurseContactContext(nurse, req.currentUser)
    });
  }

  if (role === "agent") {
    const agent = await getAgentById(userId, { includeDeletedUsers: true });
    if (!agent) {
      return res.status(404).render("shared/not-found", { title: "Agent Not Found" });
    }
    const user = await getUserById(agent.userId);
    const concerns = (await getConcerns()).filter((item) => item.userId === agent.userId);

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
router.post("/admin/user/:id/reset-password", requireRole("admin"), async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  const redirectTo = String(req.body.redirectTo || "").startsWith("/")
    ? String(req.body.redirectTo)
    : null;

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
    return res.redirect(redirectTo || "/admin/nurses");
  }

  setFlash(req, "success", "Password reset complete.");
  if (redirectTo) {
    return res.redirect(redirectTo);
  }

  // Redirect based on role
  if (user.role === "nurse") return res.redirect("/admin/nurses");
  if (user.role === "agent") return res.redirect("/admin/agents");
  return res.redirect("/admin");
});

router.post("/admin/user/:id/change-password", requireRole("admin"), async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  const newPassword = String(req.body.newPassword || "");
  const redirectTo = String(req.body.redirectTo || "").startsWith("/")
    ? String(req.body.redirectTo)
    : null;

  if (Number.isNaN(userId)) {
    setFlash(req, "error", "Invalid user.");
    return res.redirect("/admin/nurses");
  }
  if (!newPassword || newPassword.length < 8) {
    setFlash(req, "error", "Password must be at least 8 characters.");
    return res.redirect(redirectTo || "/admin/nurses");
  }

  const user = await getUserById(userId);
  if (!user) {
    setFlash(req, "error", "User not found.");
    return res.redirect("/admin/nurses");
  }
  if (user.isDeleted) {
    setFlash(req, "error", "Archived users cannot be modified.");
    return res.redirect("/admin/nurses?status=Deleted");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updatedUser = await updateUser(userId, { passwordHash });
  if (!updatedUser) {
    setFlash(req, "error", "Unable to change password right now.");
    return res.redirect(redirectTo || "/admin/nurses");
  }

  setFlash(req, "success", "Password changed successfully.");
  if (redirectTo) {
    return res.redirect(redirectTo);
  }
  if (user.role === "nurse") return res.redirect("/admin/nurses");
  if (user.role === "agent") return res.redirect("/admin/agents");
  return res.redirect("/admin");
});

// Admin toggle email verification
router.post("/admin/user/:id/verify-email", requireRole("admin"), (req, res) => {
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

// Admin archive user account (soft delete)
router.post("/admin/user/:id/delete", requireRole("admin"), async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);

  if (Number.isNaN(userId)) {
    setFlash(req, "error", "Invalid user.");
    return res.redirect("/admin/nurses");
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const userResult = await client.query(
      `SELECT id, role, COALESCE(is_deleted, false) AS is_deleted
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      setFlash(req, "error", "User not found.");
      return res.redirect("/admin/nurses");
    }
    if (user.role === "admin") {
      await client.query("ROLLBACK");
      setFlash(req, "error", "Cannot archive admin account.");
      return res.redirect("/admin");
    }
    if (user.is_deleted) {
      await client.query("ROLLBACK");
      setFlash(req, "success", "User account is already archived.");
      if (user.role === "nurse") return res.redirect("/admin/nurses?status=Deleted");
      if (user.role === "agent") return res.redirect("/admin/agents");
      return res.redirect("/admin");
    }

    const archiveResult = await client.query(
      `UPDATE users
       SET is_deleted = true,
           deleted_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    if (archiveResult.rowCount !== 1) {
      throw new Error("Unable to archive user account.");
    }

    await client.query("COMMIT");

    const cache = readStore();
    const cacheUser = cache.users.find((item) => item.id === userId);
    if (cacheUser) {
      cacheUser.isDeleted = true;
      cacheUser.deletedAt = now();
    }
    cache.nurses.forEach((nurse) => {
      if (nurse.userId === userId) {
        nurse.userIsDeleted = true;
        nurse.userDeletedAt = cacheUser ? cacheUser.deletedAt : now();
      }
    });

    setFlash(req, "success", "User account archived successfully.");
    if (user.role === "nurse") return res.redirect("/admin/nurses?status=Deleted");
    if (user.role === "agent") return res.redirect("/admin/agents");
    return res.redirect("/admin");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Admin user archive rollback error:", rollbackError);
      }
    }
    console.error("Admin user archive error:", error);
    setFlash(req, "error", "Unable to archive user account right now.");
    return res.redirect("/admin/nurses");
  } finally {
    if (client) client.release();
  }
});

  return router;
}

module.exports = createNurseSupportController;


