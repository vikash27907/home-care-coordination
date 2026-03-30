const express = require("express");
const runtime = require("../services/runtimeContext");

function createSessionController() {
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

router.get(["/agent-registration", "/agent/register"], (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/dashboard");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("public/agent-registration", {
    title: "Agent Registration"
  });
});

router.post(["/agent-registration", "/agent/register"], async (req, res) => {
  if (req.currentUser) {
    if (req.currentUser.role === "agent") {
      return res.redirect("/agent/dashboard");
    }
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return stagePublicAgentRegistration(req, res, "/agent/register");
});

router.get("/login", (req, res) => {
  if (req.currentUser) {
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.render("auth/login", { title: "Login" });
});

// OLD LOGIN OTP SYSTEM (disabled)
/*
router.post("/agent/login", async (req, res) => {
  const phoneInput = String(req.body.phone_number || req.body.phoneNumber || "").trim();
  const phoneValidation = validateIndiaPhone(phoneInput);

  if (!phoneValidation.valid) {
    return res.send("Agent not found or not approved");
  }

  try {
    const result = await pool.query(
      `SELECT a.id, a.user_id, a.full_name, a.phone_number
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.phone_number = $1
         AND a.status = 'approved'
         AND u.role = 'agent'
         AND COALESCE(u.is_deleted, false) = false
       LIMIT 1`,
      [phoneValidation.value]
    );

    if (result.rows.length === 0) {
      return res.send("Agent not found or not approved");
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    await pool.query(
      `UPDATE users
       SET otp_code = $1,
           otp_expiry = NOW() + INTERVAL '5 minutes'
       WHERE id = $2`,
      [otp, result.rows[0].user_id]
    );

    if (!isProduction) {
      console.log("Agent OTP generated for local testing.");
    }

    return res.send("OTP sent. Submit phone_number and otp to /agent/verify-otp.");
  } catch (error) {
    console.error("Agent login OTP generation failed:", error);
    return res.send("Error generating OTP");
  }
});
*/

// OLD LOGIN OTP VERIFICATION (disabled)
/*
router.post("/agent/verify-otp", async (req, res) => {
  const phoneInput = String(req.body.phone_number || req.body.phoneNumber || "").trim();
  const otp = String(req.body.otp || "").trim();
  const phoneValidation = validateIndiaPhone(phoneInput);

  if (!phoneValidation.valid || !otp) {
    return res.send("Invalid or expired OTP");
  }

  try {
    const result = await pool.query(
      `SELECT a.id AS agent_id,
              a.user_id,
              a.full_name,
              a.phone_number
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.phone_number = $1
         AND a.status = 'approved'
         AND u.role = 'agent'
         AND COALESCE(u.is_deleted, false) = false
         AND u.otp_code = $2
         AND u.otp_expiry > NOW()
       LIMIT 1`,
      [phoneValidation.value, otp]
    );

    if (result.rows.length === 0) {
      return res.send("Invalid or expired OTP");
    }

    const agent = result.rows[0];

    req.session.userId = agent.user_id;
    req.session.role = "agent";
    req.session.user = {
      id: agent.user_id,
      agentId: agent.agent_id,
      role: "agent",
      fullName: agent.full_name || "",
      full_name: agent.full_name || "",
      profileImageUrl: "",
      profile_image_url: "",
      phoneNumber: agent.phone_number || "",
      phone_number: agent.phone_number || ""
    };

    await pool.query(
      `UPDATE users
       SET otp_code = NULL,
           otp_expiry = NULL
       WHERE id = $1`,
      [agent.user_id]
    );

    return res.redirect("/agent/dashboard");
  } catch (error) {
    console.error("Agent OTP verification failed:", error);
    return res.send("Error verifying OTP");
  }
});
*/

router.post("/agent/verify-otp", async (req, res) => {
  const otp = String(req.body.otp || "").trim();
  const data = req.session.agentRegistration;

  if (!data) {
    return res.redirect("/agent/register");
  }

  const isExpired = !data.otpExpiresAt || new Date() > new Date(data.otpExpiresAt);
  if (!otp || otp !== String(data.otp) || isExpired) {
    return res.send("Invalid OTP");
  }

  try {
    const existingUserByEmail = await getUserByEmail(data.email);
    if (existingUserByEmail) {
      delete req.session.agentRegistration;
      return res.send("Registration error");
    }

    const [users, nurses, agents] = await Promise.all([
      getUsers(),
      getNurses(),
      getAgents()
    ]);
    const normalizedPhone = normalizePhone(data.phoneNumber);
    const hasRegisteredPhone = users.some((item) => normalizePhone(item.phoneNumber) === normalizedPhone)
      || nurses.some((item) => normalizePhone(item.phoneNumber) === normalizedPhone)
      || agents.some((item) => normalizePhone(item.phoneNumber) === normalizedPhone);

    if (hasRegisteredPhone) {
      delete req.session.agentRegistration;
      return res.send("Registration error");
    }

    const createdUser = await createUser({
      email: data.email,
      phoneNumber: data.phoneNumber,
      passwordHash: data.passwordHash,
      role: "agent",
      status: "pending",
      emailVerified: true,
      createdAt: now()
    });

    if (!createdUser) {
      return res.send("Registration error");
    }

    const createdAgent = await createAgent({
      userId: createdUser.id,
      fullName: data.fullName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      workingRegion: data.workingRegion,
      companyName: data.companyName,
      status: "pending",
      createdAt: now()
    });

    if (!createdAgent) {
      await deleteUser(createdUser.id);
      return res.send("Registration error");
    }

    req.session.userId = createdUser.id;
    req.session.role = "agent";
    req.session.user = {
      id: createdUser.id,
      role: "agent",
      fullName: data.fullName,
      full_name: data.fullName,
      profileImageUrl: "/images/default-avatar.png",
      profile_image_url: "/images/default-avatar.png",
      phoneNumber: data.phoneNumber,
      phone_number: data.phoneNumber
    };

    delete req.session.agentRegistration;

    return res.redirect("/agent/dashboard");
  } catch (error) {
    console.error("Agent registration verification failed:", error);
    return res.send("Registration error");
  }
});

router.post("/login", loginRateLimiter, async (req, res) => {
  const identifierRaw = String(req.body.identifier || req.body.email || "").trim();
  const password = String(req.body.password || "");
  const normalizedPhone = normalizePhone(identifierRaw);
  const normalizedUniqueId = normalizeUniqueLoginId(identifierRaw);
  const emailLooksValid = Boolean(identifierRaw) && validateEmail(identifierRaw).valid;
  if (!identifierRaw || !password) {
    setFlash(req, "error", "Please enter your login details.");
    return res.redirect("/login");
  }

  if (!isPasswordLoginPhone(normalizedPhone) && !normalizedUniqueId && !emailLooksValid) {
    setFlash(req, "error", "Use a 10-digit mobile number, unique ID, or verified email.");
    return res.redirect("/login");
  }

  let user = null;
  if (isPasswordLoginPhone(normalizedPhone)) {
    user = await getUserByPhone(normalizedPhone);
  } else if (normalizedUniqueId) {
    user = await getUserByUniqueId(normalizedUniqueId);
  } else if (emailLooksValid) {
    user = await getUserByEmail(identifierRaw);
    if (user && !user.emailVerified) {
      setFlash(req, "error", "Please verify your email before logging in.");
      return res.redirect("/login");
    }
  }

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    setFlash(req, "error", "Invalid credentials.");
    return res.redirect("/login");
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.user = await getSessionUserPayload(user);

  if (!user.emailVerified && user.role === "nurse") {
    setFlash(req, "success", "Welcome back. Verify your email to take full control of this account.");
    return res.redirect("/nurse/dashboard");
  }

  setFlash(req, "success", `Welcome, ${user.fullName || user.email}.`);
  return res.redirect(redirectByRole(user.role));
});

router.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

router.get("/admin/profile", requireRole("admin"), (req, res) => {
  return res.redirect("/admin/dashboard");
});

router.get("/agent/profile", requireRole("agent"), loadAgentProfile, (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const store = readNormalizedStore();

  const nurses = store.nurses
    .filter((item) => !isStoreUserDeleted(store, item.userId) && nurseHasAgent(item, agentEmail))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const requests = store.patients
    .filter((item) => normalizeEmail(item.agentEmail) === agentEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const completedJobs = requests.filter((request) => {
    const status = String(request.status || "").trim().toLowerCase();
    return status === "closed" || status === "completed";
  }).length;

  const featuredNurses = nurses
    .filter((nurse) => String(nurse.status || "").toLowerCase() === "approved")
    .slice(0, 2);

  return res.render("agent/profile", {
    title: "Agent Profile",
    agent: req.agentRecord,
    stats: {
      nursesManaged: nurses.length,
      completedJobs,
      rating: "4.8"
    },
    featuredNurses
  });
});

router.get("/user/profile", requireAuth, (req, res) => {
  if (req.currentUser.role !== "user") {
    return res.redirect(redirectByRole(req.currentUser.role));
  }
  return res.redirect("/");
});

router.get("/dashboard", requireAuth, (req, res) => {
  return res.redirect(redirectByRole(req.currentUser.role));
});

router.get("/notifications", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(rawLimit)
      ? 20
      : Math.max(1, Math.min(rawLimit, 50));
    const result = await pool.query(
      `SELECT id, type, title, message, related_request_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.session.user.id, limit]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Notifications list error:", error);
    return res.status(500).send("Server Error");
  }
});

router.get("/notifications-page", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, title, message, related_request_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.currentUser.id]
    );
    return res.render("notifications", {
      title: "Notifications",
      notifications: result.rows
    });
  } catch (error) {
    console.error("Notifications page load error:", error);
    return res.status(500).send("Server Error");
  }
});

router.get("/notifications/unread-count", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE user_id = $1
         AND is_read = FALSE`,
      [req.session.user.id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("Notifications unread count error:", error);
    return res.status(500).send("Server Error");
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Unauthorized");
  }

  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).send("Invalid ID");
  }

  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1
         AND user_id = $2`,
      [id, req.session.user.id]
    );
    return res.json({ success: true });
  } catch (error) {
    console.error("Notification mark-read error:", error);
    return res.status(500).send("Server Error");
  }
});


  return router;
}

module.exports = createSessionController;


