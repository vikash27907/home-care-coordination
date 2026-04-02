const express = require("express");
const runtime = require("../services/runtimeContext");

function createPublicController() {
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
    uploadCertificate,
    uploadNurseProfileFiles,
    validateEmail,
    validateIndiaPhone,
    validateRequest,
    validateServiceSchedule,
  } = runtime;

  async function resolveAgentByIdentifier(agentIdentifier) {
    const rawIdentifier = String(agentIdentifier || "").trim();
    if (!rawIdentifier) {
      return null;
    }

    const numericId = Number.parseInt(rawIdentifier, 10);
    if (String(numericId) === rawIdentifier && Number.isInteger(numericId) && numericId > 0) {
      const agentById = await getAgentById(numericId);
      if (agentById) {
        return agentById;
      }
    }

    const normalizedIdentifier = normalizeEmail(rawIdentifier);
    const compactIdentifier = rawIdentifier.toUpperCase().replace(/-/g, "");
    const slugIdentifier = rawIdentifier.toLowerCase();
    const agents = await getAgents();

    return agents.find((agent) => {
      const uniqueId = String(agent.uniqueId || "").trim().toUpperCase().replace(/-/g, "");
      const profileSlug = String(agent.profileSlug || "").trim().toLowerCase();
      const normalizedEmail = normalizeEmail(agent.email);

      return (uniqueId && uniqueId === compactIdentifier)
        || (profileSlug && profileSlug === slugIdentifier)
        || (normalizedIdentifier && normalizedEmail === normalizedIdentifier);
    }) || null;
  }

  function buildLeadWhatsAppHref(phoneDigits, contactName, nurseName, nurseId, profileUrl) {
    const normalizedDigits = normalizePhoneValue(phoneDigits);
    if (!normalizedDigits) {
      return "";
    }

    const whatsappPhone = normalizedDigits.startsWith("91") ? normalizedDigits : `91${normalizedDigits}`;
    const message = [
      `Hello ${contactName},`,
      `I am interested in nurse ${nurseName}${nurseId ? ` (ID: ${nurseId})` : ""}.`,
      "Please assist me.",
      `Profile: ${profileUrl}`
    ].join("\n");

    return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
  }

  async function buildPublicNurseProfilePageModel(req, nurse, options = {}) {
    const ratingsResult = await pool.query(
      `SELECT
          COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::numeric(3,1) AS average_rating,
          COUNT(*)::int AS review_count
       FROM care_request_ratings
       WHERE nurse_id = $1`,
      [nurse.id]
    );
    const ratingRow = ratingsResult.rows[0] || {};
    const publicNurse = {
      ...buildPublicNurseProfileView(nurse),
      ratingAverage: Number.parseFloat(ratingRow.average_rating) || 0,
      reviewCount: Number.parseInt(ratingRow.review_count, 10) || 0
    };
    const isVerified = nurse.status === "Approved";
    const profileUrl = new URL(req.originalUrl || publicNurse.publicUrl, `${getAppBaseUrl(req)}/`).toString();
    const defaultContactContext = buildNurseContactContext(nurse, req.currentUser, {
      forceCompanyContact: true,
      profileUrl
    });

    let contactOwner = "company";
    let contactName = "Prisha Home Care";
    let contactPhone = normalizePhoneValue(COMPANY_PHONE) || COMPANY_PHONE;
    let contactContext = {
      ...defaultContactContext
    };

    if (options.agent) {
      const agent = options.agent;
      const agentPhone = normalizePhoneValue(agent.phoneNumber || agent.phone_number || "");
      const agentName = String(agent.fullName || agent.full_name || agent.companyName || "Assigned Agent").trim() || "Assigned Agent";
      const whatsappHref = buildLeadWhatsAppHref(
        agentPhone,
        agentName,
        publicNurse.fullName,
        publicNurse.uniqueId,
        profileUrl
      );

      contactOwner = "agent";
      contactName = agentName;
      contactPhone = agentPhone || contactPhone;
      contactContext = {
        ...defaultContactContext,
        phoneSource: "agent",
        usesCompanyContact: false,
        companyName: agentName,
        nurseName: publicNurse.fullName,
        nurseId: publicNurse.uniqueId,
        profileUrl,
        displayPhone: contactPhone,
        downloadPhone: contactPhone,
        sharePhone: contactPhone,
        phone: contactPhone,
        telHref: contactPhone ? `tel:+91${contactPhone}` : "",
        whatsappHref,
        actionHref: whatsappHref || (contactPhone ? `tel:+91${contactPhone}` : ""),
        openInNewTab: Boolean(whatsappHref),
        buttonLabel: "Contact"
      };
    }

    publicNurse.phoneNumber = contactPhone;
    publicNurse.whatsappLink = contactContext.whatsappHref;

    return {
      publicNurse,
      isVerified,
      contactContext,
      contactOwner,
      contactName
    };
  }

  function isApprovedProfileStatus(value) {
    return String(value || "").trim().toLowerCase() === "approved";
  }

  function isNurseDirectProfileVisible(nurse) {
    if (!nurse) {
      return false;
    }

    const profileStatus = nurse.profileStatus || nurse.profile_status || "";

    // ✅ ONLY approval matters for direct access (QR, link, card)
    return isApprovedProfileStatus(profileStatus);
  }

  function isNurseListedPublicly(nurse) {
    const profileStatus = nurse.profileStatus || nurse.profile_status || "";

    // ✅ For listing: must be approved + public enabled
    return (
      isApprovedProfileStatus(profileStatus) &&
      nurse.publicProfileEnabled === true
    );
  }

  router.get("/health", (req, res) => {
    res.status(200).json({ ok: true, service: "home-care-coordination", ts: now() });
  });

  router.get("/healthz", (req, res) => {
    res.status(200).json({ ok: true, service: "home-care-coordination", ts: now() });
  });

  router.get("/", (req, res) => {
    res.render("public/home", { title: "Prisha Home Care" });
  });

  router.get("/nurses", async (req, res) => {
    const includeUnavailable = String(req.query.show || "").trim().toLowerCase() === "all";
    const nursesFromDb = await getNurses();

    const nurses = nursesFromDb
      .filter((nurse) => isNurseListedPublicly(nurse))
      .filter((nurse) => (includeUnavailable ? true : nurse.isAvailable !== false))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((nurse) => buildPublicNurse(nurse));

    return res.render("public/nurses", {
      title: "Find Nurses",
      nurses,
      includeUnavailable
    });
  });

  router.get("/nurses/:id", async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(nurseId)) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    const nurse = await getNurseById(nurseId);
    const isVisiblePublicly = isNurseDirectProfileVisible(nurse);
    if (!isVisiblePublicly) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    return res.render("public/nurse-profile", {
      title: `${nurse.fullName} | Public Nurse Profile`,
      nurse: buildPublicNurse(nurse)
    });
  });

  router.get("/agent/:agentIdentifier/nurse/:slug([a-z0-9-]+-phcn-?[0-9]+)", async (req, res) => {
    const agentIdentifier = String(req.params.agentIdentifier || "").trim();
    const slug = String(req.params.slug || "").trim();
    if (!agentIdentifier || !slug) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    const [agent, nurse] = await Promise.all([
      resolveAgentByIdentifier(agentIdentifier),
      getNurseByProfileSlug(slug)
    ]);

    const isVisiblePublicly = isNurseDirectProfileVisible(nurse);
    const agentHasContactPhone = agent && Boolean(normalizePhoneValue(agent.phoneNumber || agent.phone_number || ""));
    const agentCanAccessNurse = agent
      && isApprovedAgentStatus(agent.status)
      && nurse
      && agentHasContactPhone
      && nurseHasAgent(nurse, agent.email);

    if (!agent || !isVisiblePublicly || !agentCanAccessNurse) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    const {
      publicNurse,
      isVerified,
      contactContext,
      contactOwner,
      contactName
    } = await buildPublicNurseProfilePageModel(req, nurse, { agent });

    return res.render("public-nurse-profile", {
      title: publicNurse.fullName,
      metaTitle: `${publicNurse.fullName} | ${isVerified ? "Verified" : "Verification Pending"} Nurse | Prisha Home Care`,
      metaDescription: `View the public profile for ${publicNurse.fullName} at Prisha Home Care.`,
      nurse: publicNurse,
      isVerified,
      contactContext,
      contactOwner,
      contactName
    });
  });

  router.get("/nurse/:slug([a-z0-9-]+-phcn-?[0-9]+)", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    const nurse = await getNurseByProfileSlug(slug);
    if (!nurse) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }
    const isVisiblePublicly = isNurseDirectProfileVisible(nurse);
    if (!isVisiblePublicly) {
      return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
    }

    const {
      publicNurse,
      isVerified,
      contactContext,
      contactOwner,
      contactName
    } = await buildPublicNurseProfilePageModel(req, nurse);

    return res.render("public-nurse-profile", {
      title: publicNurse.fullName,
      metaTitle: `${publicNurse.fullName} | ${isVerified ? "Verified" : "Verification Pending"} Nurse | Prisha Home Care`,
      metaDescription: `View the public profile for ${publicNurse.fullName} at Prisha Home Care.`,
      nurse: publicNurse,
      isVerified,
      contactContext,
      contactOwner,
      contactName
    });
  });

  router.get("/api/nurse/:id/qr", async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(nurseId)) {
      return res.status(404).send("Not found");
    }

    const nurse = await getNurseById(nurseId);
    const isVisiblePublicly = isNurseDirectProfileVisible(nurse);
    if (!nurse || !nurse.profileSlug || !isVisiblePublicly) {
      return res.status(404).send("Not found");
    }

    const url = new URL(`/nurse/${nurse.profileSlug}`, `${getAppBaseUrl(req)}/`).toString();
    const qr = await generateQR(url);
    const qrBase64 = qr.replace(/^data:image\/png;base64,/, "");

    return res.type("png").send(Buffer.from(qrBase64, "base64"));
  });

  router.get("/request-care", async (req, res) => {
    const preferredNurseId = Number.parseInt(req.query.nurseId, 10);
    const user = req.session?.user || null;
    let preferredNurse = null;
    if (!Number.isNaN(preferredNurseId)) {
      const nurse = await getNurseById(preferredNurseId);
      const isVisiblePublicly = isNurseDirectProfileVisible(nurse);
      if (isVisiblePublicly && nurse.isAvailable !== false) {
        preferredNurse = buildPublicNurse(nurse);
      }
    }

    try {
      let nurseId = null;
      if (user && user.role === "nurse") {
        const nurseResult = await pool.query(
          "SELECT id FROM nurses WHERE user_id = $1 LIMIT 1",
          [user.id]
        );
        nurseId = nurseResult.rows[0] ? nurseResult.rows[0].id : null;
      }

      const [requestsResult, appliedResult] = await Promise.all([
        pool.query(
          `SELECT
            cr.id,
            COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
            COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support required') AS service_summary,
            COALESCE(NULLIF(p.city, ''), '-') AS location,
            COALESCE(app.total_interested, 0) AS total_interested,
            cr.created_at
         FROM care_requests cr
         LEFT JOIN patients p ON p.id = cr.patient_id
         LEFT JOIN (
           SELECT request_id, COUNT(*)::int AS total_interested
           FROM care_applications
           WHERE status IN ('pending', 'accepted')
           GROUP BY request_id
         ) app ON app.request_id = cr.id
         WHERE cr.status = 'open'
           AND COALESCE(cr.visibility_status, 'pending') = 'approved'
         ORDER BY cr.created_at DESC
         LIMIT 50`
        ),
        nurseId
          ? pool.query(
            `SELECT request_id
             FROM care_applications
             WHERE nurse_id = $1`,
            [nurseId]
          )
          : Promise.resolve({ rows: [] })
      ]);

      return res.render("public/request-care", {
        title: "Request Care",
        preferredNurse,
        requests: requestsResult.rows,
        user,
        appliedRequestIds: appliedResult.rows.map((row) => row.request_id),
        showRequestForm: Boolean(preferredNurse || (res.locals.flash && res.locals.flash.type === "error"))
      });
    } catch (error) {
      console.error("Request care page load error:", error);
      return res.render("public/request-care", {
        title: "Request Care",
        preferredNurse,
        requests: [],
        user,
        appliedRequestIds: [],
        showRequestForm: true
      });
    }
  });


  router.post("/request-care", async (req, res) => {
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

    if (!durationUnit || !["days", "weeks", "months"].includes(durationUnit)) {
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
        (item) => item.id === preferredNurseId
          && item.status === "Approved"
          && item.isPublic === true
          && item.isAvailable !== false
      );
      if (!preferredNurse) {
        setFlash(req, "error", "Selected nurse is no longer available.");
        return res.redirect("/request-care");
      }
      preferredNurseName = preferredNurse.fullName;
      preferredNurseValue = preferredNurse.id;
    }

    const patientId = nextId(store, "patient");
    const referenceId = await generateUniquePublicRequestCode();
    const editToken = await generateUniqueCareRequestEditToken();
    const serviceScheduleLabel = req.app.locals.serviceScheduleOptions?.find((s) => s.value === serviceSchedule)?.label || serviceSchedule;
    const preferredDate = String(req.body.preferredDate || "").trim();
    const patientCondition = String(req.body.patientCondition || req.body.notes || "").trim();
    const agentEmail = req.currentUser && req.currentUser.role === "agent"
      ? normalizeEmail(req.currentUser.email)
      : "";

    // Default status is "Requested"
    const defaultStatus = "New";

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
      agentEmail,
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

    let createdPatient = null;
    try {
      createdPatient = await createPatient(patient);
      const createdCareRequestResult = await pool.query(
        `INSERT INTO care_requests
        (
          patient_id,
          request_code,
          edit_token,
          care_type,
          duration_value,
          duration_unit,
          budget_min,
          budget_max,
          marketplace_ready,
          status,
          payment_status,
          nurse_notified
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'open', 'pending', FALSE)
       RETURNING id, status, payment_status, assigned_nurse_id`,
        [
          createdPatient.id,
          referenceId,
          editToken,
          patientCondition || serviceScheduleLabel || "General care support required",
          durationValue,
          durationUnit,
          budget,
          budget
        ]
      );

      try {
        const createdCareRequest = createdCareRequestResult.rows[0];
        const actor = buildCareRequestLifecycleActor(req, "patient");
        await insertCareRequestLifecycleLog(pool, {
          requestId: createdCareRequest.id,
          eventType: "created_by_patient",
          previousStatus: null,
          nextStatus: createdCareRequest.status,
          previousPaymentStatus: null,
          nextPaymentStatus: createdCareRequest.payment_status,
          assignedNurseId: createdCareRequest.assigned_nurse_id,
          comment: "Care request created by patient/user submission.",
          changedByUserId: actor.userId,
          changedByRole: actor.role,
          metadata: {
            source: "request-care",
            patientId: createdPatient.id || null
          }
        });
      } catch (logError) {
        console.error("Care request lifecycle log creation failed (patient flow):", logError);
      }
    } catch (error) {
      if (createdPatient && createdPatient.id) {
        try {
          await deletePatient(createdPatient.id);
        } catch (rollbackError) {
          console.error("Patient rollback after care request insert failure:", rollbackError);
        }
      }
      console.error("Request care persistence error:", error);
      setFlash(req, "error", "Unable to submit care request right now. Please try again.");
      return res.redirect("/request-care");
    }

    // Send confirmation email asynchronously (do not block request submission).
    const userEmail = email;

    try {
      const emailResult = await sendCareRequestEmail(
        userEmail,
        referenceId,
        editToken
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

    return res.redirect(`/request-success?requestId=${encodeURIComponent(referenceId)}`);
  });

  router.get("/request-success", (req, res) => {
    const { requestId } = req.query;
    if (!requestId) {
      return res.redirect("/request-care");
    }
    res.render("public/request-success", {
      title: "Request Submitted",
      requestId
    });
  });

  router.get("/track-request", async (req, res) => {
    const { requestId } = req.query;

    const renderData = {
      title: "Track Request",
      requestId: requestId || ""
    };

    if (!requestId) {
      return res.render("public/track-request", renderData);
    }

    try {
      const requestRecord = await getPublicCareRequestRecordByRequestCode(requestId.trim());

      if (!requestRecord) {
        renderData.error = "Request not found.";
      } else {
        delete requestRecord.editToken;
        renderData.request = requestRecord;
      }
    } catch (error) {
      console.error("Track request error:", error);
      renderData.error = "Something went wrong. Please try again.";
    }

    return res.render("public/track-request", renderData);
  });
  router.post("/update-request", async (req, res) => {
    const token = String(req.body.token || "").trim();
    const fullName = String(req.body.fullName || "").trim();
    const phoneNumber = String(req.body.phoneNumber || "").trim();
    const city = String(req.body.city || "").trim();
    const serviceSchedule = String(req.body.serviceSchedule || "").trim();
    const durationUnit = String(req.body.durationUnit || "").trim();
    const durationValue = Number.parseInt(req.body.durationValue, 10);
    const budget = Number.parseFloat(req.body.budget);
    const notes = String(req.body.notes || "").trim();

    if (!token) {
      setFlash(req, "error", "Invalid edit link.");
      return res.redirect("/track-request");
    }
    if (!fullName || !phoneNumber || !city || !serviceSchedule) {
      setFlash(req, "error", "Please complete all required fields.");
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    const phoneValidation = validateIndiaPhone(phoneNumber);
    if (!phoneValidation.valid) {
      setFlash(req, "error", phoneValidation.error);
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    const scheduleValidation = validateServiceSchedule(serviceSchedule);
    if (!scheduleValidation.valid) {
      setFlash(req, "error", scheduleValidation.error);
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    if (!durationUnit || !["days", "weeks", "months"].includes(durationUnit)) {
      setFlash(req, "error", "Please select a valid duration unit.");
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    if (Number.isNaN(durationValue) || durationValue < 1) {
      setFlash(req, "error", "Please enter a valid duration value.");
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    if (Number.isNaN(budget) || budget <= 0) {
      setFlash(req, "error", "Please enter a valid budget.");
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    }

    let client;
    try {
      const requestRecord = await getPublicCareRequestRecordByEditToken(token);
      if (!requestRecord || !requestRecord.careRequestId || !requestRecord.patientId) {
        setFlash(req, "error", "Invalid edit link.");
        return res.redirect("/track-request");
      }

      const duration = `${durationValue} ${durationUnit}`;
      const serviceScheduleLabel = req.app.locals.serviceScheduleOptions?.find((item) => item.value === serviceSchedule)?.label || serviceSchedule;
      const careType = notes || serviceScheduleLabel || "General care support required";

      client = await pool.connect();
      await client.query("BEGIN");

      await client.query(
        `UPDATE patients
       SET full_name = $1,
           phone_number = $2,
           city = $3,
           service_schedule = $4,
           duration = $5,
           duration_unit = $6,
           duration_value = $7,
           budget = $8,
           notes = $9
       WHERE id = $10`,
        [
          fullName,
          phoneValidation.value,
          city,
          serviceSchedule,
          duration,
          durationUnit,
          durationValue,
          budget,
          notes,
          requestRecord.patientId
        ]
      );

      await client.query(
        `UPDATE care_requests
       SET care_type = $1,
           duration_value = $2,
           duration_unit = $3,
           budget_min = $4,
           budget_max = $5
       WHERE id = $6`,
        [
          careType,
          durationValue,
          durationUnit,
          budget,
          budget,
          requestRecord.careRequestId
        ]
      );

      await client.query("COMMIT");
      setFlash(req, "success", "Request updated successfully.");
      return res.redirect(`/track-request?requestId=${encodeURIComponent(requestRecord.requestId)}`);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Request edit rollback error:", rollbackError);
        }
      }
      console.error("Public request update error:", error);
      setFlash(req, "error", "Unable to update this request right now.");
      return res.redirect(`/edit-request/${encodeURIComponent(token)}`);
    } finally {
      if (client) client.release();
    }
  });

  function renderNurseSignupView(req, res, options = {}) {
    return res.render("public/nurse-signup", {
      title: options.title || "Nurse Signup",
      formAction: options.formAction || "/nurse-signup",
      refAgentId: options.refAgentId || "",
      skillsOptions: SKILLS_OPTIONS,
      availabilityOptions: AVAILABILITY_OPTIONS
    });
  }

  router.get("/nurse-signup", (req, res) => {
    if (req.currentUser) {
      if (req.currentUser.role === "agent") {
        return res.redirect("/agent/nurses/new");
      }
      return res.redirect(redirectByRole(req.currentUser.role));
    }
    return renderNurseSignupView(req, res);
  });

  router.post("/nurse-signup", async (req, res) => {
    if (req.currentUser) {
      if (req.currentUser.role === "agent") {
        return res.redirect("/agent/nurses/new");
      }
      return res.redirect(redirectByRole(req.currentUser.role));
    }

    // Generate 4-digit OTP for email verification

    const generatedOtp = crypto.randomInt(1000, 10000).toString();
    const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for testing

    // Add OTP to request body for createNurseUnderAgent to use
    req.body.generatedOtp = generatedOtp;
    req.body.otpExpiry = otpExpiry;

    return createNurseUnderAgent(req, res, "/nurse-signup", generatedOtp, otpExpiry);
  });

  router.get("/nurse/register", async (req, res) => {
    if (req.currentUser && req.currentUser.role !== "agent") {
      return res.redirect(redirectByRole(req.currentUser.role));
    }

    if (req.currentUser && req.currentUser.role === "agent") {
      const requestedReferralAgentId = getRequestedReferralAgentId(req);
      if (requestedReferralAgentId && requestedReferralAgentId !== req.currentUser.id) {
        setFlash(req, "error", "Invalid agent referral link.");
        return res.redirect("/agent/dashboard?tab=staff");
      }

      const agentRecord = await getAgentRecordForUser(req.currentUser.id);
      if (!agentRecord || !isApprovedAgentStatus(agentRecord.status)) {
        return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
      }

      return renderNurseSignupView(req, res, {
        title: "Register Nurse",
        formAction: "/nurse/register",
        refAgentId: String(req.currentUser.id)
      });
    }

    return renderNurseSignupView(req, res, {
      title: "Register Nurse",
      formAction: "/nurse/register"
    });
  });

  router.post("/nurse/register", async (req, res) => {
    if (req.currentUser && req.currentUser.role && req.currentUser.role !== "agent") {
      return res.redirect(redirectByRole(req.currentUser.role));
    }

    const requestedReferralAgentId = getRequestedReferralAgentId(req);
    const failRedirect = requestedReferralAgentId
      ? `/nurse/register?ref_agent=${encodeURIComponent(requestedReferralAgentId)}`
      : "/nurse/register";

    if (req.currentUser && req.currentUser.role === "agent") {
      return createNurseUnderAgent(req, res, failRedirect);
    }


    const generatedOtp = crypto.randomInt(1000, 10000).toString();
    const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    req.body.generatedOtp = generatedOtp;
    req.body.otpExpiry = otpExpiry;

    return createNurseUnderAgent(req, res, failRedirect, generatedOtp, otpExpiry);
  });

  router.get("/verify-otp", (req, res) => {
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

  router.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;

    // Fetch user directly from database for fresh data
    const user = await getUserByEmail(email);

    if (!user) {
      setFlash(req, "error", "User not found. Please try again.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }

    // Fix 1: Type safety - force both to strings and trim
    // Fix 2: Date safety - ensure proper date comparison
    if (!user || !user.otpCode || String(user.otpCode).trim() !== String(otp).trim() || new Date() > new Date(user.otpExpiry)) {
      setFlash(req, "error", "Invalid or expired OTP. Please try again.");
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }

    // OTP is valid - clear it and set email_verified = true
    await updateUser(user.id, {
      emailVerified: true,
      otpCode: '',
      otpExpiry: null
    });

    if (user.role === "nurse") {
      const verifiedNurse = await getNurseByUserId(user.id);
      if (verifiedNurse && verifiedNurse.claimedByNurse !== true) {
        await updateNurse(verifiedNurse.id, {
          claimedByNurse: true
        });
      }
    }

    // Set session
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.user = await getSessionUserPayload(user);

    setFlash(req, "success", "Email verified successfully! Welcome to your dashboard.");
    return res.redirect(user.role === "nurse" ? "/nurse/dashboard" : redirectByRole(user.role));
  });


  return router;
}

module.exports = createPublicController;
