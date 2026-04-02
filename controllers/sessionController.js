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
    uploadResume,
    validateEmail,
    validateIndiaPhone,
    validateRequest,
    validateServiceSchedule,
  } = runtime;

  const AGENT_PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
  const AGENT_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
  const AGENT_PROFILE_IMAGE_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  const AGENT_PROFILE_IMAGE_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const AGENT_DOCUMENT_ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
  const AGENT_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
  ]);

  async function uploadProfileImageToCloudinary(file) {
    if (!file) return "";

    const uploadedAsset = await uploadBufferToCloudinary(file, "home-care/profile");

    return String(uploadedAsset?.secure_url || "").trim();
  }

  const agentProfileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AGENT_DOCUMENT_MAX_BYTES },
    fileFilter: (req, file, cb) => {
      const extension = path.extname(String(file.originalname || "")).toLowerCase();
      const mimetype = String(file.mimetype || "").toLowerCase();

      if (file.fieldname === "profileImage") {
        if (
          AGENT_PROFILE_IMAGE_ALLOWED_EXTENSIONS.has(extension)
          && AGENT_PROFILE_IMAGE_ALLOWED_MIME_TYPES.has(mimetype)
        ) {
          return cb(null, true);
        }
        return cb(new Error("Profile image must be JPG, PNG, or WEBP."));
      }

      if (file.fieldname === "aadhaarDoc") {
        if (
          AGENT_DOCUMENT_ALLOWED_EXTENSIONS.has(extension)
          && AGENT_DOCUMENT_ALLOWED_MIME_TYPES.has(mimetype)
        ) {
          return cb(null, true);
        }
        return cb(new Error("Aadhaar document must be JPG, PNG, WEBP, or PDF."));
      }

      return cb(new Error("Unsupported upload field."));
    }
  }).fields([
    { name: "profileImage", maxCount: 1 },
    { name: "aadhaarDoc", maxCount: 1 }
  ]);

  function agentProfileUploadMiddleware(req, res, next) {
    agentProfileUpload(req, res, async (error) => {
      if (!error) {
        const profileImageFile = req.files && req.files.profileImage ? req.files.profileImage[0] : null;
        if (profileImageFile && Number(profileImageFile.size || 0) > AGENT_PROFILE_IMAGE_MAX_BYTES) {
          setFlash(req, "error", "Profile image must be 2MB or smaller.");
          return res.redirect("/agent/profile");
        }
        return next();
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        setFlash(req, "error", "Uploaded file is too large. Aadhaar document must be 4MB or smaller.");
        return res.redirect("/agent/profile");
      }

      setFlash(req, "error", error.message || "Unable to upload the selected files right now.");
      return res.redirect("/agent/profile");
    });
  }

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

    return Promise.all([
      getNurses(),
      pool.query(
        `SELECT COUNT(*)::int AS completed_jobs
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
         AND cr.status = 'completed'`,
        [agentEmail]
      )
    ])
      .then(([nurses, completedJobsResult]) => {
        const ownedNurses = nurses
          .filter((item) => nurseHasAgent(item, agentEmail))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        const featuredNurses = ownedNurses
          .filter((nurse) => String(nurse.status || "").toLowerCase() === "approved")
          .slice(0, 3);
        const completedJobs = Number.parseInt(completedJobsResult.rows[0]?.completed_jobs, 10) || 0;
        const approvalBreakdown = ownedNurses.reduce((acc, nurse) => {
          const key = String(nurse.status || "Pending").trim().toLowerCase();
          if (key === "approved") acc.approved += 1;
          else if (key === "rejected") acc.rejected += 1;
          else acc.pending += 1;
          return acc;
        }, { approved: 0, pending: 0, rejected: 0 });

        return res.render("agent/profile", {
          title: "Agent Profile",
          agent: req.agentRecord,
          stats: {
            nursesManaged: ownedNurses.length,
            completedJobs,
            rating: "4.8",
            approvedNurses: approvalBreakdown.approved,
            pendingNurses: approvalBreakdown.pending,
            rejectedNurses: approvalBreakdown.rejected
          },
          featuredNurses,
          profileShareUrl: ""
        });
      })
      .catch((error) => {
        console.error("Agent profile load error:", error);
        return res.render("agent/profile", {
          title: "Agent Profile",
          agent: req.agentRecord,
          stats: {
            nursesManaged: 0,
            completedJobs: 0,
            rating: "4.8",
            approvedNurses: 0,
            pendingNurses: 0,
            rejectedNurses: 0
          },
          featuredNurses: [],
          profileShareUrl: ""
        });
      });
  });

  router.post("/agent/profile/update", requireRole("agent"), loadAgentProfile, agentProfileUploadMiddleware, async (req, res) => {
    const fullName = String(req.body.fullName || "").trim();
    const emailInput = String(req.body.email || "").trim();
    const phoneInput = String(req.body.phoneNumber || "").trim();
    const companyName = String(req.body.companyName || "").trim();
    const workingRegion = String(req.body.workingRegion || "").trim();
    const profileImageFile = req.files && req.files.profileImage ? req.files.profileImage[0] : null;
    const aadhaarDocFile = req.files && req.files.aadhaarDoc ? req.files.aadhaarDoc[0] : null;
    let nextProfileImageUrl = "";
    let nextAadhaarDocUrl = "";
    const previousProfileImageUrl = String(req.agentRecord.profileImageUrl || "").trim();
    const previousAadhaarDocUrl = String(req.agentRecord.aadhaarDocUrl || req.agentRecord.aadhaarUrl || "").trim();
    const createdCloudinaryAssetUrls = [];
    let hasPersistedProfileChanges = false;

    if (!fullName || !emailInput || !phoneInput || !workingRegion) {
      setFlash(req, "error", "Please complete all required profile fields.");
      return res.redirect("/agent/profile");
    }

    const emailValidation = validateEmail(emailInput);
    if (!emailValidation.valid) {
      setFlash(req, "error", emailValidation.error);
      return res.redirect("/agent/profile");
    }

    const phoneValidation = validateIndiaPhone(phoneInput);
    if (!phoneValidation.valid) {
      setFlash(req, "error", phoneValidation.error);
      return res.redirect("/agent/profile");
    }

    const normalizedEmailInput = emailValidation.value;
    const normalizedPhoneInput = normalizePhone(phoneValidation.value);

    try {
      const duplicateEmailResult = await pool.query(
        `SELECT 1
       FROM users
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)
         AND id <> $2
       UNION
       SELECT 1
       FROM agents
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)
         AND user_id <> $2
       LIMIT 1`,
        [normalizedEmailInput, req.currentUser.id]
      );
      if (duplicateEmailResult.rowCount > 0) {
        setFlash(req, "error", "That email address is already in use.");
        return res.redirect("/agent/profile");
      }

      const duplicatePhoneResult = await pool.query(
        `SELECT 1
       FROM users
       WHERE phone_number = $1
         AND id <> $2
       UNION
       SELECT 1
       FROM agents
       WHERE phone_number = $1
         AND user_id <> $2
       LIMIT 1`,
        [normalizedPhoneInput, req.currentUser.id]
      );
      if (duplicatePhoneResult.rowCount > 0) {
        setFlash(req, "error", "That phone number is already in use.");
        return res.redirect("/agent/profile");
      }

      if (profileImageFile) {
        nextProfileImageUrl = await uploadProfileImageToCloudinary(profileImageFile);
        if (!nextProfileImageUrl) {
          throw new Error("Unable to upload profile image right now.");
        }
        createdCloudinaryAssetUrls.push(nextProfileImageUrl);
      }

      if (aadhaarDocFile) {
        const docRes = await uploadBufferToCloudinary(aadhaarDocFile, "home-care/agents/aadhar");
        nextAadhaarDocUrl = docRes.secure_url;
        createdCloudinaryAssetUrls.push(nextAadhaarDocUrl);
      }

      const agentUpdates = {
        fullName,
        email: normalizedEmailInput,
        phoneNumber: normalizedPhoneInput,
        companyName,
        workingRegion
      };

      if (nextProfileImageUrl) {
        agentUpdates.profileImageUrl = nextProfileImageUrl;
      }

      if (nextAadhaarDocUrl) {
        agentUpdates.aadhaarDocUrl = nextAadhaarDocUrl;
      }

      const [updatedUser, updatedAgent] = await Promise.all([
        updateUser(req.currentUser.id, {
          email: normalizedEmailInput,
          phoneNumber: normalizedPhoneInput
        }),
        updateAgent(req.agentRecord.id, agentUpdates)
      ]);

      if (!updatedUser || !updatedAgent) {
        throw new Error("Unable to save your profile right now.");
      }
      hasPersistedProfileChanges = true;

      try {
        await Promise.all([
          nextProfileImageUrl && previousProfileImageUrl && previousProfileImageUrl !== nextProfileImageUrl
            ? Promise.all([
              deleteCloudinaryAssetByUrl(previousProfileImageUrl),
              deleteLocalAsset(previousProfileImageUrl)
            ])
            : Promise.resolve(),
          nextAadhaarDocUrl && previousAadhaarDocUrl && previousAadhaarDocUrl !== nextAadhaarDocUrl
            ? deleteLocalAsset(previousAadhaarDocUrl)
            : Promise.resolve()
        ]);
      } catch (cleanupError) {
        console.error("Agent profile cleanup error:", cleanupError);
      }

      const refreshedUser = await getUserById(req.currentUser.id);
      req.session.user = await getSessionUserPayload(refreshedUser);
      setFlash(req, "success", "Profile updated successfully.");
      return res.redirect("/agent/profile");
    } catch (error) {
      if (!hasPersistedProfileChanges) {
        await Promise.all(createdCloudinaryAssetUrls.map((url) => deleteCloudinaryAssetByUrl(url)));
      }
      console.error("Agent profile update error:", error);
      setFlash(req, "error", error.message || "Unable to save your profile right now.");
      return res.redirect("/agent/profile");
    }
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
