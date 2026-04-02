const express = require("express");
const runtime = require("../services/runtimeContext");

function createAdminController() {
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

  router.use("/admin", requireRole("admin"), adminContextMiddleware);

  router.get("/admin", requireRole("admin"), (req, res) => {
    return res.redirect("/admin/dashboard");
  });

  router.get("/admin/dashboard", requireRole("admin"), async (req, res) => {
    try {
      const requestStats = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_requests,
          COUNT(*) FILTER (WHERE status = 'assigned') AS assigned_requests,
          COUNT(*) FILTER (WHERE status = 'active') AS active_requests,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_requests,
          COUNT(*) FILTER (
            WHERE status = 'open' AND marketplace_ready = TRUE
          ) AS live_marketplace
       FROM care_requests`
      );

      const applicationStats = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_apps,
          COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_apps
       FROM care_applications`
      );

      return res.render("admin/dashboard", {
        title: "Admin Dashboard",
        user: req.session.user,
        stats: {
          ...requestStats.rows[0],
          ...applicationStats.rows[0]
        }
      });
    } catch (error) {
      console.error("Admin dashboard stats error:", error);
      return res.status(500).send("Server Error");
    }
  });

  router.get("/admin/applications", requireRole("admin"), (req, res) => {
    const status = String(req.query.status || "").trim().toLowerCase();
    if (status === "pending") {
      return res.redirect("/admin/marketplace?tab=open");
    }
    if (status === "accepted") {
      return res.redirect("/admin/care-requests?status=assigned");
    }
    return res.redirect("/admin/marketplace?tab=open");
  });

  router.get("/admin/nurses", requireRole("admin"), async (req, res) => {
    const deletedOnly = String(req.query.deleted || "").trim().toLowerCase() === "true";
    const requestedStatusFilter = String(req.query.status || "All").trim();
    const normalizedStatusFilter = requestedStatusFilter.toLowerCase();
    const statusFilter = deletedOnly
      ? "Deleted"
      : normalizedStatusFilter === "all"
        ? "All"
        : (normalizedStatusFilter === "deleted" ? "Deleted" : (normalizeNurseStatusInput(requestedStatusFilter) || "All"));
    const updatedNurseIdRaw = Number.parseInt(req.query.updatedNurseId, 10);
    const updatedNurseId = Number.isNaN(updatedNurseIdRaw) ? null : updatedNurseIdRaw;
    const visibilityUpdateRaw = String(req.query.visibility || "").trim().toLowerCase();
    const visibilityUpdate = ["public", "private"].includes(visibilityUpdateRaw)
      ? visibilityUpdateRaw
      : "";
    const [nursesFromDb, agentsFromDb] = await Promise.all([getNurses({ includeDeletedUsers: true }), getAgents()]);
    const approvedAgents = agentsFromDb.filter((item) => isApprovedAgentStatus(item.status));
    const nurseCounts = {
      totalActive: nursesFromDb.filter((item) => !item.userIsDeleted).length,
      pending: nursesFromDb.filter((item) => !item.userIsDeleted && item.status === "Pending").length,
      approved: nursesFromDb.filter((item) => !item.userIsDeleted && item.status === "Approved").length,
      rejected: nursesFromDb.filter((item) => !item.userIsDeleted && item.status === "Rejected").length,
      deleted: nursesFromDb.filter((item) => item.userIsDeleted).length
    };
    const nurses = nursesFromDb
      .filter((item) => {
        if (statusFilter === "Deleted") return item.userIsDeleted === true;
        if (item.userIsDeleted) return false;
        return statusFilter === "All" ? true : item.status === statusFilter;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return res.render("admin/nurses", {
      title: "Manage Nurses",
      statusFilter,
      nurses,
      nurseCounts,
      approvedAgents,
      updatedNurseId,
      visibilityUpdate
    });
  });

  router.post("/admin/nurses/:id/update", requireRole("admin"), async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    const requestedStatusFilter = String(req.body.statusFilter || "All").trim();
    const normalizedStatusFilter = requestedStatusFilter.toLowerCase();
    const statusFilter = normalizedStatusFilter === "all"
      ? "All"
      : (normalizedStatusFilter === "deleted" ? "Deleted" : (normalizeNurseStatusInput(requestedStatusFilter) || "All"));
    const hasStatusFilter = Boolean(req.body.statusFilter);
    const redirectTarget = hasStatusFilter
      ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}`
      : `/admin/user/view/nurse/${nurseId}`;

    if (Number.isNaN(nurseId)) {
      setFlash(req, "error", "Invalid nurse.");
      return res.redirect("/admin/nurses");
    }

    try {
      const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body, field);
      const normalizeArrayInput = (value) => {
        if (Array.isArray(value)) {
          return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
        }
        const raw = String(value || "").trim();
        if (!raw) return [];
        return raw.includes(",")
          ? [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))]
          : [raw];
      };

      const statusInput = String(req.body.statusAction || req.body.status || "").trim();
      const status = normalizeNurseStatusInput(statusInput);
      const fullName = hasField("fullName") ? String(req.body.fullName || "").trim() : undefined;
      const city = hasField("city") ? String(req.body.city || "").trim() : undefined;
      const workCity = hasField("workCity") ? String(req.body.workCity || "").trim() : undefined;
      const gender = hasField("gender") ? String(req.body.gender || "").trim() : undefined;
      const religion = hasField("religion") ? String(req.body.religion || "").trim() : undefined;
      const currentAddress = hasField("currentAddress") ? String(req.body.currentAddress || "").trim() : undefined;
      const currentStatusInput = hasField("current_status")
        ? req.body.current_status
        : (hasField("currentStatus") ? req.body.currentStatus : undefined);
      const currentStatus = typeof currentStatusInput === "undefined"
        ? undefined
        : normalizeCurrentStatusInput(currentStatusInput);
      const profileStatusInput = hasField("profileStatus") ? String(req.body.profileStatus || "").trim() : undefined;
      const referralCode = hasField("referralCode")
        ? String(req.body.referralCode || "").trim().toUpperCase()
        : undefined;
      const aadharNumber = hasField("aadharNumber")
        ? String(req.body.aadharNumber || "").replace(/\D/g, "").slice(0, 12)
        : undefined;
      const heightText = hasField("height")
        ? String(req.body.height || "").trim()
        : (hasField("heightText") ? String(req.body.heightText || "").trim() : undefined);
      const weightInput = hasField("weight")
        ? String(req.body.weight || "").trim()
        : (hasField("weightKg") ? String(req.body.weightKg || "").trim() : undefined);
      const weightKg = typeof weightInput === "undefined" || weightInput === ""
        ? undefined
        : Number.parseInt(weightInput, 10);
      const experienceYearsRaw = String(req.body.experienceYears || "").trim();
      const experienceYears = experienceYearsRaw === ""
        ? undefined
        : Number.parseInt(experienceYearsRaw, 10);
      const emailInput = hasField("email") ? normalizeEmail(req.body.email || "") : undefined;
      const phoneInput = hasField("phoneNumber") ? String(req.body.phoneNumber || "").trim() : undefined;

      const normalizedSkills = hasField("skills")
        ? (
          Array.isArray(req.body.skills)
            ? req.body.skills
            : req.body.skills
              ? [req.body.skills]
              : []
        ).map((item) => String(item || "").trim()).filter(Boolean)
        : (hasField("skillsInput") ? normalizeArrayInput(req.body.skillsInput) : undefined);
      const normalizedAvailability = hasField("availability")
        ? (
          Array.isArray(req.body.availability)
            ? req.body.availability
            : req.body.availability
              ? [req.body.availability]
              : []
        ).map((item) => String(item || "").trim()).filter(Boolean)
        : (hasField("availabilityInput") ? normalizeArrayInput(req.body.availabilityInput) : undefined);

      if (statusInput && !status) {
        setFlash(req, "error", "Invalid nurse status.");
        return res.redirect(redirectTarget);
      }
      if (typeof fullName !== "undefined" && !fullName) {
        setFlash(req, "error", "Full name is required.");
        return res.redirect(redirectTarget);
      }
      if (typeof gender !== "undefined" && gender && !["Male", "Female", "Other", "Not Specified"].includes(gender)) {
        setFlash(req, "error", "Invalid nurse gender.");
        return res.redirect(redirectTarget);
      }
      if (typeof religion !== "undefined" && religion.length > 80) {
        setFlash(req, "error", "Religion should be 80 characters or fewer.");
        return res.redirect(redirectTarget);
      }
      if (typeof heightText !== "undefined" && heightText.length > 20) {
        setFlash(req, "error", "Height should be a short value like 5'6 or 167 cm.");
        return res.redirect(redirectTarget);
      }
      if (typeof weightInput !== "undefined" && weightInput !== "" && (Number.isNaN(weightKg) || weightKg < 20 || weightKg > 250)) {
        setFlash(req, "error", "Weight must be between 20 and 250 kg.");
        return res.redirect(redirectTarget);
      }
      if (typeof currentStatusInput !== "undefined" && !currentStatus) {
        setFlash(req, "error", "Invalid current status.");
        return res.redirect(redirectTarget);
      }
      if (typeof emailInput !== "undefined" && !emailInput) {
        setFlash(req, "error", "Email cannot be empty.");
        return res.redirect(redirectTarget);
      }
      if (phoneInput) {
        const phoneValidation = validateIndiaPhone(phoneInput);
        if (!phoneValidation.valid) {
          setFlash(req, "error", phoneValidation.error);
          return res.redirect(redirectTarget);
        }
      }
      if (typeof experienceYears !== "undefined" && (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60)) {
        setFlash(req, "error", "Experience must be between 0 and 60 years.");
        return res.redirect(redirectTarget);
      }

      const nurse = await getNurseById(nurseId);
      if (!nurse) {
        setFlash(req, "error", "Nurse record not found.");
        return res.redirect(hasStatusFilter ? `/admin/nurses?status=${encodeURIComponent(statusFilter)}` : "/admin/nurses");
      }

      const existingQualifications = Array.isArray(nurse.qualifications) ? nurse.qualifications : [];
      const existingQualificationsMap = new Map(
        existingQualifications
          .filter((item) => item && typeof item.name === "string")
          .map((item) => [item.name.toLowerCase(), item])
      );
      const selectedQualificationsRaw = hasField("qualifications")
        ? (
          Array.isArray(req.body.qualifications)
            ? req.body.qualifications
            : req.body.qualifications
              ? [req.body.qualifications]
              : []
        )
        : (hasField("qualificationsInput") ? normalizeArrayInput(req.body.qualificationsInput) : undefined);
      const normalizedQualifications = typeof selectedQualificationsRaw === "undefined"
        ? undefined
        : [...new Set(selectedQualificationsRaw.map((item) => String(item || "").trim()).filter(Boolean))]
          .map((name) => {
            const existing = existingQualificationsMap.get(name.toLowerCase());
            if (existing) {
              return {
                name,
                certificate_url: existing.certificate_url || null,
                verified: Boolean(existing.verified)
              };
            }
            return { name, certificate_url: null, verified: false };
          });

      const nurseSetClauses = [];
      const nurseValues = [];
      const setNurseField = (column, value) => {
        nurseValues.push(value);
        nurseSetClauses.push(`${column} = $${nurseValues.length}`);
      };

      if (status) setNurseField("status", status);
      if (typeof fullName !== "undefined") setNurseField("full_name", fullName);
      if (typeof gender !== "undefined") setNurseField("gender", gender);
      if (typeof religion !== "undefined") setNurseField("religion", religion);
      if (typeof city !== "undefined") setNurseField("city", city);
      if (typeof workCity !== "undefined") setNurseField("work_city", workCity);
      if (typeof currentAddress !== "undefined") setNurseField("current_address", currentAddress);
      if (typeof heightText !== "undefined") setNurseField("height_text", heightText);
      if (typeof weightKg !== "undefined") setNurseField("weight_kg", weightKg);
      if (typeof experienceYears !== "undefined") setNurseField("experience_years", experienceYears);
      if (typeof currentStatus !== "undefined") setNurseField("current_status", currentStatus);
      if (typeof normalizedSkills !== "undefined") setNurseField("skills", normalizedSkills);
      if (typeof normalizedAvailability !== "undefined") setNurseField("availability", normalizedAvailability);
      if (typeof normalizedQualifications !== "undefined") {
        setNurseField("qualifications", JSON.stringify(normalizedQualifications));
      }
      if (typeof profileStatusInput !== "undefined") setNurseField("profile_status", profileStatusInput);
      if (typeof referralCode !== "undefined") setNurseField("referral_code", referralCode);
      if (typeof aadharNumber !== "undefined") setNurseField("aadhar_number", aadharNumber);

      const userSetClauses = [];
      const userValues = [];
      const setUserField = (column, value) => {
        userValues.push(value);
        userSetClauses.push(`${column} = $${userValues.length}`);
      };

      if (status) setUserField("status", status);
      if (typeof emailInput !== "undefined") setUserField("email", emailInput);
      if (typeof phoneInput !== "undefined") {
        setUserField("phone_number", phoneInput ? validateIndiaPhone(phoneInput).value : null);
      }
      if (hasField("emailVerified")) setUserField("email_verified", toBoolean(req.body.emailVerified));

      if (nurseSetClauses.length === 0 && userSetClauses.length === 0) {
        setFlash(req, "error", "No changes submitted.");
        return res.redirect(redirectTarget);
      }

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");

        if (nurseSetClauses.length > 0) {
          nurseValues.push(nurseId);
          const nurseUpdateResult = await client.query(
            `UPDATE nurses SET ${nurseSetClauses.join(", ")} WHERE id = $${nurseValues.length}`,
            nurseValues
          );
          if (nurseUpdateResult.rowCount !== 1) {
            throw new Error("Failed to update nurse record.");
          }
        }

        if (userSetClauses.length > 0) {
          userValues.push(nurse.userId);
          const userUpdateResult = await client.query(
            `UPDATE users SET ${userSetClauses.join(", ")} WHERE id = $${userValues.length}`,
            userValues
          );
          if (userUpdateResult.rowCount !== 1) {
            throw new Error("Failed to update user account details.");
          }
        }

        await client.query("COMMIT");
      } catch (transactionError) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Admin nurse update rollback error:", rollbackError);
          }
        }
        throw transactionError;
      } finally {
        if (client) {
          client.release();
        }
      }

      setFlash(req, "success", "Nurse record updated.");
      return res.redirect(redirectTarget);
    } catch (error) {
      console.error("Admin nurse update error:", error);
      setFlash(req, "error", error && error.message ? error.message : "Unable to update nurse profile right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/nurses/:id/toggle-public", requireRole("admin"), async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    const requestedStatusFilter = String(req.body.statusFilter || "All").trim();
    const normalizedStatusFilter = requestedStatusFilter.toLowerCase();
    const statusFilter = normalizedStatusFilter === "all"
      ? "All"
      : (normalizedStatusFilter === "deleted" ? "Deleted" : (normalizeNurseStatusInput(requestedStatusFilter) || "All"));
    const redirectTarget = `/admin/nurses?status=${encodeURIComponent(statusFilter)}`;

    if (Number.isNaN(nurseId)) {
      setFlash(req, "error", "Invalid nurse.");
      return res.redirect(redirectTarget);
    }

    try {
      const nurseResult = await pool.query(
        `SELECT n.id, n.public_profile_enabled
       FROM nurses n
       JOIN users u ON u.id = n.user_id
       WHERE n.id = $1
         AND COALESCE(u.is_deleted, false) = false
       LIMIT 1`,
        [nurseId]
      );

      if (!nurseResult.rows[0]) {
        setFlash(req, "error", "Nurse record not found.");
        return res.redirect(redirectTarget);
      }

      const nextIsPublic = nurseResult.rows[0].public_profile_enabled !== true;
      await pool.query(
        "UPDATE nurses SET public_profile_enabled = $1 WHERE id = $2",
        [nextIsPublic, nurseId]
      );

      setFlash(
        req,
        "success",
        nextIsPublic ? "Nurse profile is now public." : "Nurse profile is now private."
      );
      const visibilityQuery = nextIsPublic ? "public" : "private";
      const redirectWithInlineNotice = `${redirectTarget}&updatedNurseId=${encodeURIComponent(nurseId)}&visibility=${encodeURIComponent(visibilityQuery)}`;
      return res.redirect(redirectWithInlineNotice);
    } catch (error) {
      console.error("Admin nurse public visibility toggle error:", error);
      setFlash(req, "error", "Unable to update public visibility right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/nurses/:id/delete", requireRole("admin"), async (req, res) => {
    const nurseId = Number.parseInt(req.params.id, 10);
    const requestedStatusFilter = String(req.body.statusFilter || "All").trim();
    const normalizedStatusFilter = requestedStatusFilter.toLowerCase();
    const statusFilter = normalizedStatusFilter === "all"
      ? "All"
      : (normalizedStatusFilter === "deleted" ? "Deleted" : (normalizeNurseStatusInput(requestedStatusFilter) || "All"));
    const redirectTo = String(req.body.deleteRedirectTo || req.body.redirectTo || "").trim();
    const redirectTarget = redirectTo && redirectTo.startsWith("/admin/")
      ? redirectTo
      : `/admin/nurses?status=${encodeURIComponent(statusFilter)}`;

    if (Number.isNaN(nurseId)) {
      setFlash(req, "error", "Invalid nurse.");
      return res.redirect(redirectTarget);
    }

    let client;
    let assetUrls = [];
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const nurseResult = await client.query(
        `SELECT
          n.id,
          n.user_id,
          n.profile_image_url,
          n.profile_image_path,
          n.resume_url,
          n.aadhar_image_url,
          n.certificate_url,
          n.qualifications,
          u.role
       FROM nurses n
       JOIN users u ON u.id = n.user_id
       WHERE n.id = $1
       LIMIT 1
       FOR UPDATE`,
        [nurseId]
      );
      const nurse = nurseResult.rows[0];

      if (!nurse) {
        await client.query("ROLLBACK");
        setFlash(req, "error", "Nurse record not found.");
        return res.redirect(redirectTarget);
      }

      if (nurse.role !== "nurse") {
        await client.query("ROLLBACK");
        setFlash(req, "error", "Selected account is not a nurse.");
        return res.redirect(redirectTarget);
      }

      if (req.session.user && nurse.user_id === req.session.user.id) {
        await client.query("ROLLBACK");
        setFlash(req, "error", "You cannot delete your own account.");
        return res.redirect(redirectTarget);
      }

      assetUrls = collectNurseAssetUrls(nurse);

      await client.query(
        "UPDATE nurses SET referred_by_nurse_id = NULL WHERE referred_by_nurse_id = $1",
        [nurseId]
      );

      await client.query(
        `UPDATE patients
       SET nurse_id = NULL,
           referrer_nurse_id = NULL,
           preferred_nurse_id = NULL,
           preferred_nurse_name = NULL
       WHERE nurse_id = $1
          OR referrer_nurse_id = $1
          OR preferred_nurse_id = $1`,
        [nurseId]
      );

      await client.query(
        `UPDATE care_requests
       SET assigned_nurse_id = NULL,
           nurse_notified = false,
           assignment_comment = CASE
             WHEN status IN ('assigned', 'payment_pending')
             THEN 'Assigned nurse was deleted by admin.'
             ELSE assignment_comment
           END,
           status = CASE
             WHEN status IN ('assigned', 'payment_pending')
             THEN 'open'
             ELSE status
           END,
           payment_status = CASE
             WHEN status = 'payment_pending'
             THEN 'pending'
             ELSE payment_status
           END
       WHERE assigned_nurse_id = $1`,
        [nurseId]
      );

      await client.query("DELETE FROM care_request_ratings WHERE nurse_id = $1", [nurseId]);
      await client.query("DELETE FROM care_request_earnings WHERE nurse_id = $1", [nurseId]);
      await client.query("DELETE FROM care_applications WHERE nurse_id = $1", [nurseId]);
      await client.query("DELETE FROM nurses WHERE id = $1", [nurseId]);
      await client.query("DELETE FROM users WHERE id = $1", [nurse.user_id]);

      await client.query("COMMIT");

      const cache = readStore();
      cache.users = (cache.users || []).filter((item) => item.id !== nurse.user_id);
      cache.nurses = (cache.nurses || []).filter((item) => item.id !== nurseId);
      (cache.nurses || []).forEach((item) => {
        if (item.referredByNurseId === nurseId) {
          item.referredByNurseId = null;
        }
      });
      (cache.patients || []).forEach((patient) => {
        if (patient.nurseId === nurseId) patient.nurseId = null;
        if (patient.referrerNurseId === nurseId) patient.referrerNurseId = null;
        if (patient.preferredNurseId === nurseId) {
          patient.preferredNurseId = null;
          patient.preferredNurseName = "";
        }
      });

      await deleteNurseAssets(assetUrls);

      setFlash(req, "success", "Nurse deleted permanently.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin nurse delete rollback error:", rollbackError);
        }
      }
      console.error("Admin nurse delete error:", error);
      setFlash(req, "error", "Unable to delete nurse right now.");
      return res.redirect(redirectTarget);
    } finally {
      if (client) client.release();
    }
  });

  router.get("/admin/agents", requireRole("admin"), async (req, res) => {
    const requestedStatus = String(req.query.status || "pending").trim().toLowerCase();
    const statusFilter = requestedStatus === "all"
      ? "all"
      : (AGENT_STATUSES.includes(requestedStatus) ? requestedStatus : "pending");

    try {
      const result = await pool.query(
        `SELECT
          a.id,
          a.user_id,
          a.full_name,
          a.email,
          a.phone_number,
          a.company_name,
          a.working_region,
          a.status,
          a.created_by_agent_email,
          a.created_at
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE COALESCE(u.is_deleted, false) = false
         AND ($1 = 'all' OR LOWER(a.status) = $1)
       ORDER BY a.id DESC`,
        [statusFilter]
      );

      const agents = result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        fullName: row.full_name || "",
        email: row.email || "",
        phoneNumber: row.phone_number || "",
        companyName: row.company_name || "",
        workingRegion: row.working_region || "",
        region: row.working_region || "",
        status: normalizeAgentStatusInput(row.status) || "pending",
        createdByAgentEmail: row.created_by_agent_email || "",
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
      }));

      return res.render("admin/agents", {
        title: "Manage Agents",
        statusFilter,
        agents
      });
    } catch (error) {
      console.error("Admin agents list error:", error);
      setFlash(req, "error", "Unable to load agents right now.");
      return res.render("admin/agents", {
        title: "Manage Agents",
        statusFilter,
        agents: []
      });
    }
  });

  router.post("/admin/agents/:id/update", requireRole("admin"), async (req, res) => {
    const agentId = Number.parseInt(req.params.id, 10);
    const status = normalizeAgentStatusInput(req.body.status);
    const statusFilterRaw = String(req.body.statusFilter || "all").trim().toLowerCase();
    const statusFilter = statusFilterRaw === "all"
      ? "all"
      : (AGENT_STATUSES.includes(statusFilterRaw) ? statusFilterRaw : "pending");
    const redirectTarget = `/admin/agents?status=${encodeURIComponent(statusFilter)}`;

    if (Number.isNaN(agentId)) {
      setFlash(req, "error", "Invalid agent.");
      return res.redirect(redirectTarget);
    }
    if (!AGENT_STATUSES.includes(status)) {
      setFlash(req, "error", "Invalid agent status.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const agentResult = await client.query(
        `SELECT a.id, a.user_id
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
         AND COALESCE(u.is_deleted, false) = false
       LIMIT 1
       FOR UPDATE`,
        [agentId]
      );
      const agent = agentResult.rows[0];
      if (!agent) {
        await client.query("ROLLBACK");
        setFlash(req, "error", "Agent record not found.");
        return res.redirect(redirectTarget);
      }

      await client.query("UPDATE agents SET status = $1 WHERE id = $2", [status, agentId]);
      await client.query("UPDATE users SET status = $1 WHERE id = $2", [status, agent.user_id]);

      await client.query("COMMIT");
      setFlash(req, "success", "Agent record updated.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin agent update rollback error:", rollbackError);
        }
      }
      console.error("Admin agent update error:", error);
      setFlash(req, "error", "Unable to update agent status right now.");
      return res.redirect(redirectTarget);
    } finally {
      if (client) client.release();
    }
  });

  router.post("/admin/agents/:id/approve", requireRole("admin"), async (req, res) => {
    const agentId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(agentId)) {
      setFlash(req, "error", "Invalid agent.");
      return res.redirect("/admin/agents?status=pending");
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const agentResult = await client.query(
        `SELECT a.id, a.user_id
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
         AND COALESCE(u.is_deleted, false) = false
       LIMIT 1
       FOR UPDATE`,
        [agentId]
      );
      const agent = agentResult.rows[0];
      if (!agent) {
        await client.query("ROLLBACK");
        setFlash(req, "error", "Agent record not found.");
        return res.redirect("/admin/agents?status=pending");
      }

      await client.query("UPDATE agents SET status = 'approved' WHERE id = $1", [agentId]);
      await client.query("UPDATE users SET status = 'approved' WHERE id = $1", [agent.user_id]);

      await client.query("COMMIT");
      setFlash(req, "success", "Agent approved successfully.");
      return res.redirect("/admin/agents?status=pending");
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin agent approve rollback error:", rollbackError);
        }
      }
      console.error("Admin agent approve error:", error);
      setFlash(req, "error", "Unable to approve agent right now.");
      return res.redirect("/admin/agents?status=pending");
    } finally {
      if (client) client.release();
    }
  });

  router.post("/admin/agents/:id/delete", requireRole("admin"), async (req, res) => {
    const agentId = Number.parseInt(req.params.id, 10);
    const statusFilterRaw = String(req.body.statusFilter || "all").trim().toLowerCase();
    const statusFilter = statusFilterRaw === "all"
      ? "all"
      : (AGENT_STATUSES.includes(statusFilterRaw) ? statusFilterRaw : "pending");
    const redirectTarget = `/admin/agents?status=${encodeURIComponent(statusFilter)}`;

    if (Number.isNaN(agentId)) {
      setFlash(req, "error", "Invalid agent.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const agentResult = await client.query(
        `SELECT a.id, a.user_id, a.email
       FROM agents a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1
         AND COALESCE(u.is_deleted, false) = false
       LIMIT 1
       FOR UPDATE`,
        [agentId]
      );
      const agent = agentResult.rows[0];
      if (!agent) {
        await client.query("ROLLBACK");
        setFlash(req, "error", "Agent record not found.");
        return res.redirect(redirectTarget);
      }

      await client.query(
        "UPDATE patients SET agent_email = '' WHERE LOWER(COALESCE(agent_email, '')) = LOWER($1)",
        [agent.email]
      );

      await client.query(
        "UPDATE nurses SET agent_email = '' WHERE LOWER(COALESCE(agent_email, '')) = LOWER($1)",
        [agent.email]
      );

      await client.query(
        `UPDATE nurses
       SET agent_emails = (
         SELECT COALESCE(array_agg(email_item), ARRAY[]::TEXT[])
         FROM unnest(COALESCE(agent_emails, ARRAY[]::TEXT[])) AS email_item
         WHERE LOWER(email_item) <> LOWER($1)
       )
       WHERE agent_emails IS NOT NULL`,
        [agent.email]
      );

      await client.query("DELETE FROM users WHERE id = $1", [agent.user_id]);

      await client.query("COMMIT");
      setFlash(req, "success", "Agent deleted successfully.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin agent delete rollback error:", rollbackError);
        }
      }
      console.error("Admin agent delete error:", error);
      setFlash(req, "error", "Unable to delete agent right now.");
      return res.redirect(redirectTarget);
    } finally {
      if (client) client.release();
    }
  });

  router.get("/admin/patients", requireRole("admin"), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
          cr.id,
          cr.status,
          COALESCE(NULLIF(p.city, ''), '-') AS location,
          COALESCE(
            NULLIF(p.service_schedule, ''),
            CASE
              WHEN cr.duration_value IS NOT NULL AND NULLIF(cr.duration_unit, '') IS NOT NULL
              THEN CONCAT(cr.duration_value, ' ', cr.duration_unit)
              ELSE NULL
            END,
            '-'
          ) AS shift_timing,
          NULLIF(COALESCE(NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), p.budget, 0), 0) AS price_per_day,
          COALESCE(NULLIF(p.full_name, ''), 'Patient') AS full_name,
          COALESCE(apps.app_count, 0)::int AS application_count
       FROM care_requests cr
       LEFT JOIN patients p ON p.id = cr.patient_id
       LEFT JOIN (
         SELECT request_id, COUNT(*) AS app_count
         FROM care_applications
         GROUP BY request_id
       ) apps ON apps.request_id = cr.id
       ORDER BY cr.created_at DESC`
      );

      return res.render("admin/patients", {
        title: "Patient Management",
        requests: result.rows,
        user: req.session.user
      });
    } catch (error) {
      console.error("Admin patients list error:", error);
      return res.status(500).send("Server Error");
    }
  });

  router.get("/admin/care-request/:id", requireRole("admin"), (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      return res.redirect("/admin/patients");
    }
    return res.redirect(`/admin/care-requests/${requestId}/applications`);
  });

  router.get("/admin/care-request/:id/applicants", requireRole("admin"), (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      return res.redirect("/admin/patients");
    }
    return res.redirect(`/admin/care-requests/${requestId}/applications`);
  });

  router.get("/admin/request/:id/applicants", requireRole("admin"), (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      return res.redirect("/admin/patients");
    }
    return res.redirect(`/admin/requests/${requestId}/applications?tab=active`);
  });

  router.get("/admin/requests", requireRole("admin"), async (req, res) => {
    const tab = req.query.tab || "pending";
    let dbQuery = "";
    const requestSelect = `
    SELECT
      cr.*,
      COALESCE(NULLIF(p.full_name, ''), 'Unknown Patient') AS patient_name,
      COALESCE(NULLIF(p.phone_number, ''), '') AS phone_number,
      COALESCE(NULLIF(p.city, ''), '-') AS address
    FROM care_requests cr
    LEFT JOIN patients p ON p.id = cr.patient_id
  `;

    try {
      switch (tab) {
        case "pending":
          dbQuery = `
          ${requestSelect}
          WHERE cr.visibility_status = 'pending'
          ORDER BY cr.created_at DESC
        `;
          break;

        case "active":
          dbQuery = `
          ${requestSelect}
          WHERE cr.visibility_status = 'approved'
            AND cr.status = 'open'
          ORDER BY cr.created_at DESC
        `;
          break;

        case "assigned":
          dbQuery = `
          ${requestSelect}
          WHERE cr.status = 'assigned'
          ORDER BY cr.created_at DESC
        `;
          break;

        case "completed":
          dbQuery = `
          ${requestSelect}
          WHERE cr.status = 'completed'
          ORDER BY cr.created_at DESC
        `;
          break;

        default:
          dbQuery = `
          ${requestSelect}
          ORDER BY cr.created_at DESC
          LIMIT 100
        `;
      }

      const result = await pool.query(dbQuery);

      return res.render("admin/requests", {
        title: "Admin Request Center",
        requests: result.rows,
        activeTab: tab
      });
    } catch (err) {
      console.error("Dashboard Error:", err);
      return res.status(500).send("Error loading the Request Center");
    }
  });

  router.post("/admin/approve-request", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.body.id, 10);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect("/admin/requests?tab=pending");
    }

    try {
      const result = await pool.query(
        `UPDATE care_requests
       SET visibility_status = 'approved',
           marketplace_ready = TRUE
       WHERE id = $1`,
        [requestId]
      );

      if (!result.rowCount) {
        setFlash(req, "error", "Care request not found.");
      } else {
        setFlash(req, "success", "Request approved for marketplace.");
      }

      return res.redirect("/admin/requests?tab=pending");
    } catch (error) {
      console.error("Approve request center item error:", error);
      setFlash(req, "error", "Unable to approve request right now.");
      return res.redirect("/admin/requests?tab=pending");
    }
  });

  router.post("/admin/reject-request", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.body.id, 10);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect("/admin/requests?tab=pending");
    }

    try {
      const result = await pool.query(
        `UPDATE care_requests
       SET visibility_status = 'rejected',
           marketplace_ready = FALSE
       WHERE id = $1`,
        [requestId]
      );

      if (!result.rowCount) {
        setFlash(req, "error", "Care request not found.");
      } else {
        setFlash(req, "success", "Request rejected.");
      }

      return res.redirect("/admin/requests?tab=pending");
    } catch (error) {
      console.error("Reject request center item error:", error);
      setFlash(req, "error", "Unable to reject request right now.");
      return res.redirect("/admin/requests?tab=pending");
    }
  });

  router.post("/admin/delete-request", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.body.request_id, 10);
    if (Number.isNaN(requestId)) {
      return res.status(400).send("Invalid request");
    }

    try {
      await pool.query(
        "DELETE FROM care_applications WHERE request_id = $1",
        [requestId]
      );

      await pool.query(
        "DELETE FROM care_requests WHERE id = $1",
        [requestId]
      );

      return res.redirect("/admin/requests");
    } catch (err) {
      console.error("Delete Error:", err);
      return res.status(500).send("Error deleting request");
    }
  });

  router.post("/admin/request-send-back", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.body.request_id, 10);
    if (Number.isNaN(requestId)) {
      return res.status(400).send("Invalid request");
    }

    try {
      await pool.query(
        `UPDATE care_requests
       SET visibility_status = 'pending',
           status = 'open'
       WHERE id = $1`,
        [requestId]
      );

      return res.redirect("/admin/requests?tab=pending");
    } catch (err) {
      console.error("Send Back Error:", err);
      return res.status(500).send("Error updating request");
    }
  });

  router.get("/admin/pending-requests", requireRole("admin"), async (req, res) => {
    return res.redirect("/admin/requests?tab=pending");
  });

  router.get("/admin/pending-requests/legacy", requireRole("admin"), async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
          cr.id,
          COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
          COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support required') AS service_summary,
          COALESCE(NULLIF(p.city, ''), '-') AS location,
          cr.created_at
       FROM care_requests cr
       LEFT JOIN patients p ON p.id = cr.patient_id
       WHERE cr.status = 'open'
         AND COALESCE(cr.visibility_status, 'pending') = 'pending'
       ORDER BY cr.created_at DESC`
      );

      return res.render("admin/pending-requests", {
        title: "Pending Request Moderation",
        requests: result.rows
      });
    } catch (error) {
      console.error("Admin pending requests error:", error);
      setFlash(req, "error", "Unable to load pending requests right now.");
      return res.redirect("/admin");
    }
  });

  router.post("/admin/pending-requests/:id/approve", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect("/admin/requests?tab=pending");
    }

    try {
      const result = await pool.query(
        `UPDATE care_requests
       SET visibility_status = 'approved',
           marketplace_ready = TRUE
       WHERE id = $1`,
        [requestId]
      );
      if (!result.rowCount) {
        setFlash(req, "error", "Care request not found.");
      } else {
        setFlash(req, "success", "Request approved for marketplace.");
      }
      return res.redirect("/admin/requests?tab=pending");
    } catch (error) {
      console.error("Approve pending request error:", error);
      setFlash(req, "error", "Unable to approve request right now.");
      return res.redirect("/admin/requests?tab=pending");
    }
  });

  router.post("/admin/pending-requests/:id/reject", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect("/admin/requests?tab=pending");
    }

    try {
      const result = await pool.query(
        `UPDATE care_requests
       SET visibility_status = 'rejected',
           marketplace_ready = FALSE
       WHERE id = $1`,
        [requestId]
      );
      if (!result.rowCount) {
        setFlash(req, "error", "Care request not found.");
      } else {
        setFlash(req, "success", "Request rejected.");
      }
      return res.redirect("/admin/requests?tab=pending");
    } catch (error) {
      console.error("Reject pending request error:", error);
      setFlash(req, "error", "Unable to reject request right now.");
      return res.redirect("/admin/requests?tab=pending");
    }
  });

  router.post("/admin/pending-requests/:id/delete", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect("/admin/requests?tab=pending");
    }

    try {
      const deleteResult = await deleteCareRequestWithPatientCleanup(requestId);
      if (!deleteResult.deleted) {
        setFlash(req, "error", "Care request not found.");
      } else {
        setFlash(req, "success", "Care request deleted.");
      }
      return res.redirect("/admin/requests?tab=pending");
    } catch (error) {
      console.error("Delete pending request error:", error);
      setFlash(req, "error", "Unable to delete request right now.");
      return res.redirect("/admin/requests?tab=pending");
    }
  });

  router.post("/admin/patients/:id/update", requireRole("admin"), (req, res) => {
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
      const validAgent = store.agents.find((agent) => agent.email === agentEmail && isApprovedAgentStatus(agent.status));
      if (!validAgent) {
        setFlash(req, "error", "Assigned agent must be approved.");
        return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
      }
    }

    patient.status = status;
    patient.agentEmail = agentEmail;

    if (patient.nurseId) {
      const assignedNurse = store.nurses.find((nurse) => nurse.id === patient.nurseId);
      const mismatch = !assignedNurse
        || isStoreUserDeleted(store, assignedNurse.userId)
        || !nurseHasAgent(assignedNurse, agentEmail || "");
      if (mismatch) {
        clearPatientFinancials(patient);
      }
    }

    writeStore(store);
    setFlash(req, "success", "Patient record updated.");
    return res.redirect(`/admin/patients?status=${encodeURIComponent(statusFilter)}`);
  });

  function getCareRequestListRedirectTarget(rawTarget) {
    const target = String(rawTarget || "").trim();
    if (target.startsWith("/admin/requests")) return target;
    if (target.startsWith("/admin/marketplace")) return target;
    return target.startsWith("/admin/care-requests") ? target : "/admin/care-requests";
  }

  function getCareRequestApplicationsBasePath(req) {
    if (req.path.startsWith("/admin/requests")) return "/admin/requests";
    return req.path.startsWith("/admin/marketplace") ? "/admin/marketplace" : "/admin/care-requests";
  }

  function getCareRequestApplicationsRedirectUrl(req, requestId) {
    const basePath = `${getCareRequestApplicationsBasePath(req)}/${requestId}/applications`;
    if (req.path.startsWith("/admin/requests")) {
      const tab = String(req.query.tab || "active").trim().toLowerCase();
      return `${basePath}?tab=${encodeURIComponent(tab || "active")}`;
    }
    if (req.path.startsWith("/admin/marketplace")) {
      const tab = normalizeMarketplaceTabInput(req.query.tab);
      return `${basePath}?tab=${encodeURIComponent(tab)}`;
    }
    const status = normalizeCareRequestStatusFilterInput(req.query.status);
    const payment = normalizeCareRequestPaymentFilterInput(req.query.payment);
    return `${basePath}?status=${encodeURIComponent(status)}&payment=${encodeURIComponent(payment)}`;
  }

  function normalizeMarketplaceTabInput(value) {
    const tab = String(value || "").trim().toLowerCase();
    return CARE_REQUEST_MARKETPLACE_TABS.includes(tab) ? tab : "open";
  }

  function normalizeCareRequestStatusFilterInput(value) {
    const filter = String(value || "all").trim().toLowerCase();
    return filter === "all" || CARE_REQUEST_STATUSES.includes(filter) ? filter : "all";
  }

  function normalizeCareRequestPaymentFilterInput(value) {
    const filter = String(value || "all").trim().toLowerCase();
    return filter === "all" || CARE_REQUEST_PAYMENT_STATUSES.includes(filter) ? filter : "all";
  }

  function normalizeAssignmentCommentInput(value) {
    const comment = String(value || "").trim();
    return comment || null;
  }

  function assertCareRequestTransition(currentStatus, nextStatus) {
    if (!normalizeCareRequestStatusInput(currentStatus)) {
      throw new Error("Invalid current lifecycle state.");
    }
    if (!normalizeCareRequestStatusInput(nextStatus)) {
      throw new Error("Invalid lifecycle transition target.");
    }
    if (!canTransitionCareRequestStatus(currentStatus, nextStatus)) {
      throw new Error(`Cannot transition request from ${currentStatus} to ${nextStatus}.`);
    }
  }

  function buildCareRequestLifecycleActor(req, fallbackRole = "system") {
    return {
      userId: req && req.currentUser && Number.isInteger(req.currentUser.id) ? req.currentUser.id : null,
      role: req && req.currentUser && req.currentUser.role ? req.currentUser.role : fallbackRole
    };
  }

  async function insertCareRequestLifecycleLog(client, payload) {
    const metadata = payload && typeof payload.metadata === "object" && payload.metadata !== null
      ? payload.metadata
      : {};

    await client.query(
      `INSERT INTO care_request_lifecycle_logs (
        request_id,
        event_type,
        previous_status,
        next_status,
        previous_payment_status,
        next_payment_status,
        assigned_nurse_id,
        comment,
        changed_by_user_id,
        changed_by_role,
        metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        payload.requestId,
        payload.eventType || "status_update",
        payload.previousStatus || null,
        payload.nextStatus || null,
        payload.previousPaymentStatus || null,
        payload.nextPaymentStatus || null,
        typeof payload.assignedNurseId === "number" ? payload.assignedNurseId : null,
        payload.comment || null,
        typeof payload.changedByUserId === "number" ? payload.changedByUserId : null,
        payload.changedByRole || "system",
        JSON.stringify(metadata)
      ]
    );
  }

  async function deleteCareRequestWithPatientCleanup(requestId) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const requestResult = await client.query(
        `SELECT id, patient_id
       FROM care_requests
       WHERE id = $1
       FOR UPDATE`,
        [requestId]
      );
      if (!requestResult.rows.length) {
        await client.query("ROLLBACK");
        return { deleted: false };
      }

      const patientId = Number.isInteger(requestResult.rows[0].patient_id)
        ? requestResult.rows[0].patient_id
        : null;

      await client.query("DELETE FROM care_requests WHERE id = $1", [requestId]);

      if (patientId !== null) {
        const patientUsageResult = await client.query(
          "SELECT 1 FROM care_requests WHERE patient_id = $1 LIMIT 1",
          [patientId]
        );
        if (!patientUsageResult.rows.length) {
          await client.query("DELETE FROM patients WHERE id = $1", [patientId]);
        }
      }

      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Care request delete rollback error:", rollbackError);
        }
      }
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async function upsertCareRequestEarnings(client, requestId, actor, note) {
    const detailsResult = await client.query(
      `SELECT
        cr.id,
        cr.patient_id,
        cr.assigned_nurse_id,
        COALESCE(
          p.nurse_amount,
          NULLIF(cr.budget_max, 0),
          NULLIF(cr.budget_min, 0),
          p.budget,
          0
        ) AS gross_amount,
        COALESCE(p.commission_amount, 0) AS platform_fee,
        COALESCE(p.referral_commission_amount, 0) AS referral_fee,
        p.nurse_net_amount
     FROM care_requests cr
     LEFT JOIN patients p ON p.id = cr.patient_id
     WHERE cr.id = $1
     LIMIT 1`,
      [requestId]
    );
    const details = detailsResult.rows[0];
    if (!details || !details.assigned_nurse_id) {
      return null;
    }

    const grossAmount = Number.parseFloat(details.gross_amount) || 0;
    const platformFee = Number.parseFloat(details.platform_fee) || 0;
    const referralFee = Number.parseFloat(details.referral_fee) || 0;
    const rawNetAmount = details.nurse_net_amount !== null && typeof details.nurse_net_amount !== "undefined"
      ? Number.parseFloat(details.nurse_net_amount) || 0
      : grossAmount - platformFee - referralFee;
    const netAmount = Math.max(Number(rawNetAmount.toFixed(2)), 0);

    const earningsUpsertResult = await client.query(
      `INSERT INTO care_request_earnings (
        request_id,
        nurse_id,
        patient_id,
        gross_amount,
        platform_fee,
        referral_fee,
        net_amount,
        payout_status,
        notes,
        generated_by_user_id,
        generated_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,NOW(),NOW())
      ON CONFLICT (request_id)
      DO UPDATE SET
        nurse_id = EXCLUDED.nurse_id,
        patient_id = EXCLUDED.patient_id,
        gross_amount = EXCLUDED.gross_amount,
        platform_fee = EXCLUDED.platform_fee,
        referral_fee = EXCLUDED.referral_fee,
        net_amount = EXCLUDED.net_amount,
        notes = EXCLUDED.notes,
        generated_by_user_id = EXCLUDED.generated_by_user_id,
        updated_at = NOW()
      RETURNING *`,
      [
        requestId,
        details.assigned_nurse_id,
        details.patient_id || null,
        Number(grossAmount.toFixed(2)),
        Number(platformFee.toFixed(2)),
        Number(referralFee.toFixed(2)),
        netAmount,
        note || "Earnings generated on completion.",
        actor && typeof actor.userId === "number" ? actor.userId : null
      ]
    );
    const earnings = earningsUpsertResult.rows[0] || null;
    if (earnings) {
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "earnings_generated",
        previousStatus: null,
        nextStatus: null,
        previousPaymentStatus: null,
        nextPaymentStatus: null,
        assignedNurseId: details.assigned_nurse_id,
        comment: note || "Earnings generated/updated for completed request.",
        changedByUserId: actor && typeof actor.userId === "number" ? actor.userId : null,
        changedByRole: actor && actor.role ? actor.role : "system",
        metadata: {
          earningsId: earnings.id,
          grossAmount: Number(grossAmount.toFixed(2)),
          platformFee: Number(platformFee.toFixed(2)),
          referralFee: Number(referralFee.toFixed(2)),
          netAmount
        }
      });
    }

    return earnings;
  }

  router.get("/admin/care-requests", requireRole("admin"), async (req, res) => {
    const statusFilter = normalizeCareRequestStatusFilterInput(req.query.status);
    const paymentFilter = normalizeCareRequestPaymentFilterInput(req.query.payment);
    const marketplaceOnly = String(req.query.marketplace || "").trim().toLowerCase() === "true";

    try {
      const [result, statusCountsResult, paymentCountsResult] = await Promise.all([
        pool.query(
          `SELECT
            cr.id,
            cr.patient_id,
            COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS public_request_code,
            p.full_name AS patient_name,
            p.phone_number AS patient_phone_number,
            COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support required') AS patient_condition,
            COALESCE(NULLIF(p.city, ''), '-') AS location,
            NULL::text AS required_qualification,
            NULL::date AS shift_start,
            NULL::date AS shift_end,
            COALESCE(
              NULLIF(p.service_schedule, ''),
              CASE
                WHEN cr.duration_value IS NOT NULL AND NULLIF(cr.duration_unit, '') IS NOT NULL
                THEN CONCAT(cr.duration_value, ' ', cr.duration_unit)
                ELSE NULL
              END,
              '-'
            ) AS shift_timing,
            NULLIF(COALESCE(NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), p.budget, 0), 0) AS price_per_day,
            cr.marketplace_ready,
            cr.assigned_nurse_id,
            n.full_name AS assigned_nurse_name,
            cr.status,
            cr.payment_status,
            cr.assignment_comment,
            cr.nurse_notified,
            rr.rating AS nurse_rating,
            rr.feedback AS rating_feedback,
            rr.updated_at AS rating_updated_at,
            ce.gross_amount,
            ce.platform_fee,
            ce.referral_fee,
            ce.net_amount,
            ce.payout_status,
            ce.updated_at AS earnings_updated_at,
            cr.created_at,
            COALESCE(ca.total_applications, 0) AS total_applications
         FROM care_requests cr
         LEFT JOIN patients p ON p.id = cr.patient_id
         LEFT JOIN nurses n ON n.id = cr.assigned_nurse_id
         LEFT JOIN care_request_ratings rr ON rr.request_id = cr.id
         LEFT JOIN care_request_earnings ce ON ce.request_id = cr.id
         LEFT JOIN (
           SELECT request_id, COUNT(*) AS total_applications
           FROM care_applications
           GROUP BY request_id
         ) ca ON ca.request_id = cr.id
         WHERE ($1 = 'all' OR cr.status = $1)
           AND ($2 = 'all' OR cr.payment_status = $2)
           AND ($3 = FALSE OR (cr.status = 'open' AND cr.marketplace_ready = TRUE))
         ORDER BY cr.created_at DESC`,
          [statusFilter, paymentFilter, marketplaceOnly]
        ),
        pool.query(
          `SELECT status, COUNT(*)::int AS total
         FROM care_requests
         GROUP BY status`
        ),
        pool.query(
          `SELECT payment_status, COUNT(*)::int AS total
         FROM care_requests
         GROUP BY payment_status`
        )
      ]);

      const statusCounts = { all: 0 };
      CARE_REQUEST_STATUSES.forEach((status) => { statusCounts[status] = 0; });
      statusCountsResult.rows.forEach((row) => {
        const normalizedStatus = normalizeCareRequestStatusInput(row.status);
        if (normalizedStatus) {
          statusCounts[normalizedStatus] = Number.parseInt(row.total, 10) || 0;
        }
      });
      statusCounts.all = CARE_REQUEST_STATUSES.reduce(
        (sum, status) => sum + (statusCounts[status] || 0),
        0
      );

      const paymentCounts = { all: 0 };
      CARE_REQUEST_PAYMENT_STATUSES.forEach((paymentStatus) => { paymentCounts[paymentStatus] = 0; });
      paymentCountsResult.rows.forEach((row) => {
        const normalizedPaymentStatus = normalizeCareRequestPaymentStatusInput(row.payment_status);
        if (normalizedPaymentStatus) {
          paymentCounts[normalizedPaymentStatus] = Number.parseInt(row.total, 10) || 0;
        }
      });
      paymentCounts.all = CARE_REQUEST_PAYMENT_STATUSES.reduce(
        (sum, paymentStatus) => sum + (paymentCounts[paymentStatus] || 0),
        0
      );

      return res.render("admin/care-requests", {
        title: "Care Requests",
        requests: result.rows,
        statusFilter,
        paymentFilter,
        statusCounts,
        paymentCounts
      });
    } catch (error) {
      console.error("Admin care requests list error:", error);
      setFlash(req, "error", "Unable to load care requests right now.");
      return res.redirect("/admin");
    }
  });

  router.get("/admin/marketplace", requireRole("admin"), async (req, res) => {
    const activeTab = normalizeMarketplaceTabInput(req.query.tab);
    const tabLabels = {
      open: "Open",
      assigned: "Assigned",
      payment_pending: "Payment Pending",
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled"
    };

    try {
      const [result, countsResult] = await Promise.all([
        pool.query(
          `SELECT
            cr.id,
            cr.patient_id,
            COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS public_request_code,
            p.full_name AS patient_name,
            COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support required') AS patient_condition,
            COALESCE(NULLIF(p.city, ''), '-') AS location,
            NULL::text AS required_qualification,
            NULL::date AS shift_start,
            NULL::date AS shift_end,
            COALESCE(
              NULLIF(p.service_schedule, ''),
              CASE
                WHEN cr.duration_value IS NOT NULL AND NULLIF(cr.duration_unit, '') IS NOT NULL
                THEN CONCAT(cr.duration_value, ' ', cr.duration_unit)
                ELSE NULL
              END,
              '-'
            ) AS shift_timing,
            NULLIF(COALESCE(NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), p.budget, 0), 0) AS price_per_day,
            cr.marketplace_ready,
            cr.assigned_nurse_id,
            n.full_name AS assigned_nurse_name,
            cr.status,
            cr.payment_status,
            cr.assignment_comment,
            cr.nurse_notified,
            rr.rating AS nurse_rating,
            ce.net_amount,
            ce.payout_status,
            cr.created_at,
            COALESCE(ca.total_applications, 0) AS total_applications,
            COALESCE(ca.pending_applications, 0) AS pending_applications,
            COALESCE(ca.accepted_applications, 0) AS accepted_applications
         FROM care_requests cr
         LEFT JOIN patients p ON p.id = cr.patient_id
         LEFT JOIN nurses n ON n.id = cr.assigned_nurse_id
         LEFT JOIN care_request_ratings rr ON rr.request_id = cr.id
         LEFT JOIN care_request_earnings ce ON ce.request_id = cr.id
         LEFT JOIN (
           SELECT
             request_id,
             COUNT(*) AS total_applications,
             COUNT(*) FILTER (WHERE status = 'pending') AS pending_applications,
             COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_applications
           FROM care_applications
           GROUP BY request_id
         ) ca ON ca.request_id = cr.id
         WHERE cr.marketplace_ready = TRUE
           AND cr.status = $1
         ORDER BY cr.created_at DESC`,
          [activeTab]
        ),
        pool.query(
          `SELECT status, COUNT(*)::int AS total
         FROM care_requests
         WHERE marketplace_ready = TRUE
         GROUP BY status`
        )
      ]);

      const countByStatus = CARE_REQUEST_MARKETPLACE_TABS.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
      }, {});
      countsResult.rows.forEach((row) => {
        const normalizedStatus = normalizeCareRequestStatusInput(row.status);
        if (normalizedStatus) {
          countByStatus[normalizedStatus] = Number.parseInt(row.total, 10) || 0;
        }
      });
      const marketplaceTabs = CARE_REQUEST_MARKETPLACE_TABS.map((status) => ({
        value: status,
        label: tabLabels[status] || status,
        count: countByStatus[status] || 0
      }));

      return res.render("admin/marketplace", {
        title: "Care Requests Dashboard",
        requests: result.rows,
        activeTab,
        marketplaceTabs
      });
    } catch (error) {
      console.error("Admin marketplace dashboard error:", error);
      setFlash(req, "error", "Unable to load marketplace dashboard right now.");
      return res.redirect("/admin");
    }
  });

  router.post("/admin/care-requests/:id/marketplace-ready", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    const isMarketplaceReady = String(req.body.marketplace_ready || "").trim().toLowerCase() === "true";

    try {
      const updateResult = await pool.query(
        "UPDATE care_requests SET marketplace_ready = $2 WHERE id = $1",
        [requestId, isMarketplaceReady]
      );
      if (!updateResult.rowCount) {
        setFlash(req, "error", "Care request not found.");
        return res.redirect(redirectTarget);
      }

      if (isMarketplaceReady) {
        setFlash(req, "success", "Request moved to marketplace dashboard.");
      } else {
        setFlash(req, "success", "Request removed from marketplace dashboard.");
      }
      return res.redirect(redirectTarget);
    } catch (error) {
      console.error("Admin care request marketplace toggle error:", error);
      setFlash(req, "error", "Unable to update marketplace status right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.get(
    ["/admin/care-requests/:id/applications", "/admin/marketplace/:id/applications", "/admin/requests/:id/applications"],
    requireRole("admin"),
    async (req, res) => {
      const requestId = Number.parseInt(req.params.id, 10);
      const applicationsBasePath = getCareRequestApplicationsBasePath(req);
      const fallbackBackHref = applicationsBasePath === "/admin/marketplace"
        ? `/admin/marketplace?tab=${encodeURIComponent(normalizeMarketplaceTabInput(req.query.tab))}`
        : applicationsBasePath === "/admin/requests"
          ? `/admin/requests?tab=${encodeURIComponent(String(req.query.tab || "active").trim().toLowerCase() || "active")}`
          : `/admin/care-requests?status=${encodeURIComponent(normalizeCareRequestStatusFilterInput(req.query.status))}&payment=${encodeURIComponent(normalizeCareRequestPaymentFilterInput(req.query.payment))}`;
      if (Number.isNaN(requestId)) {
        setFlash(req, "error", "Invalid care request.");
        return res.redirect(fallbackBackHref);
      }

      try {
        const requestResult = await pool.query(
          `SELECT
            cr.id,
            cr.patient_id,
            COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS public_request_code,
            p.full_name AS patient_name,
            COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support required') AS patient_condition,
            COALESCE(NULLIF(p.city, ''), '-') AS location,
            NULL::text AS required_qualification,
            NULL::date AS shift_start,
            NULL::date AS shift_end,
            COALESCE(
              NULLIF(p.service_schedule, ''),
              CASE
                WHEN cr.duration_value IS NOT NULL AND NULLIF(cr.duration_unit, '') IS NOT NULL
                THEN CONCAT(cr.duration_value, ' ', cr.duration_unit)
                ELSE NULL
              END,
              '-'
            ) AS shift_timing,
            NULLIF(COALESCE(NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), p.budget, 0), 0) AS price_per_day,
            cr.marketplace_ready,
            cr.assigned_nurse_id,
            n.full_name AS assigned_nurse_name,
            cr.status,
            cr.payment_status,
            cr.assignment_comment,
            cr.nurse_notified,
            rr.rating AS nurse_rating,
            rr.feedback AS rating_feedback,
            rr.updated_at AS rating_updated_at,
            ce.id AS earnings_id,
            ce.gross_amount,
            ce.platform_fee,
            ce.referral_fee,
            ce.net_amount,
            ce.payout_status,
            ce.payout_reference,
            ce.notes AS earnings_notes,
            ce.updated_at AS earnings_updated_at,
            cr.created_at
         FROM care_requests cr
         LEFT JOIN patients p ON p.id = cr.patient_id
         LEFT JOIN nurses n ON n.id = cr.assigned_nurse_id
         LEFT JOIN care_request_ratings rr ON rr.request_id = cr.id
         LEFT JOIN care_request_earnings ce ON ce.request_id = cr.id
         WHERE cr.id = $1
         LIMIT 1`,
          [requestId]
        );

        if (!requestResult.rows.length) {
          setFlash(req, "error", "Care request not found.");
          return res.redirect(fallbackBackHref);
        }

        let backHref = fallbackBackHref;
        if (applicationsBasePath === "/admin/requests") {
          const requestStatus = normalizeCareRequestStatusInput(requestResult.rows[0].status);
          const requestCenterTab = requestStatus === "assigned" || requestStatus === "completed"
            ? requestStatus
            : "active";
          backHref = `/admin/requests?tab=${encodeURIComponent(requestCenterTab)}`;
        }

        const applicationsResult = await pool.query(
          `SELECT
            ca.id,
            ca.request_id,
            ca.nurse_id,
            ca.status,
            ca.applied_at,
            n.full_name,
            n.city,
            n.experience_years,
            n.current_status,
            u.email,
            u.phone_number
         FROM care_applications ca
         JOIN nurses n ON n.id = ca.nurse_id
         JOIN users u ON u.id = n.user_id
         WHERE ca.request_id = $1
           AND COALESCE(u.is_deleted, false) = false
         ORDER BY
           CASE ca.status
             WHEN 'accepted' THEN 0
             WHEN 'pending' THEN 1
             ELSE 2
           END,
           ca.applied_at DESC`,
          [requestId]
        );
        const lifecycleLogsResult = await pool.query(
          `SELECT
            id,
            event_type,
            previous_status,
            next_status,
            previous_payment_status,
            next_payment_status,
            assigned_nurse_id,
            comment,
            changed_by_user_id,
            changed_by_role,
            metadata,
            created_at
         FROM care_request_lifecycle_logs
         WHERE request_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 100`,
          [requestId]
        );

        return res.render("admin/care-request-applications", {
          title: "Care Request Applications",
          requestItem: requestResult.rows[0],
          applications: applicationsResult.rows,
          lifecycleLogs: lifecycleLogsResult.rows,
          backHref,
          actionBasePath: applicationsBasePath
        });
      } catch (error) {
        console.error("Admin care request applications list error:", error);
        setFlash(req, "error", "Unable to load care applications right now.");
        return res.redirect(fallbackBackHref);
      }
    }
  );

  router.post(
    [
      "/admin/care-requests/:requestId/applications/:applicationId/accept",
      "/admin/marketplace/:requestId/applications/:applicationId/accept",
      "/admin/requests/:requestId/applications/:applicationId/accept"
    ],
    requireRole("admin"),
    async (req, res) => {
      const requestId = Number.parseInt(req.params.requestId, 10);
      const applicationId = Number.parseInt(req.params.applicationId, 10);
      const applicationsBasePath = getCareRequestApplicationsBasePath(req);
      const applicationsRedirectUrl = getCareRequestApplicationsRedirectUrl(req, requestId);
      if (Number.isNaN(requestId) || Number.isNaN(applicationId)) {
        setFlash(req, "error", "Invalid application request.");
        return res.redirect(applicationsBasePath);
      }

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");

        const applicationResult = await client.query(
          `SELECT
            ca.id,
            ca.request_id,
            ca.nurse_id,
            cr.status AS request_status,
            cr.payment_status AS request_payment_status,
            cr.assigned_nurse_id AS request_assigned_nurse_id
         FROM care_applications ca
         JOIN care_requests cr ON cr.id = ca.request_id
         WHERE ca.id = $1
           AND ca.request_id = $2
         FOR UPDATE OF ca, cr`,
          [applicationId, requestId]
        );
        if (!applicationResult.rows.length) {
          throw new Error("Application not found for this care request.");
        }

        const requestStatus = normalizeCareRequestStatusInput(applicationResult.rows[0].request_status);
        if (requestStatus !== "open") {
          throw new Error("Only open requests can accept nurse applications.");
        }
        const previousPaymentStatus = normalizeCareRequestPaymentStatusInput(
          applicationResult.rows[0].request_payment_status
        ) || "pending";
        const previousAssignedNurseId = Number.isInteger(applicationResult.rows[0].request_assigned_nurse_id)
          ? applicationResult.rows[0].request_assigned_nurse_id
          : null;
        const nurseId = applicationResult.rows[0].nurse_id;
        const actor = buildCareRequestLifecycleActor(req, "admin");

        await client.query(
          "UPDATE care_applications SET status = 'rejected' WHERE request_id = $1 AND id <> $2",
          [requestId, applicationId]
        );
        await client.query(
          "UPDATE care_applications SET status = 'accepted' WHERE id = $1",
          [applicationId]
        );
        await client.query(
          `UPDATE care_requests
         SET status = 'assigned',
             assigned_nurse_id = $2,
             marketplace_ready = FALSE,
             payment_status = 'pending',
             assignment_comment = NULL,
             nurse_notified = FALSE
         WHERE id = $1`,
          [requestId, nurseId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, related_request_id)
         SELECT user_id,
                'application_accepted',
                'Application Accepted',
                'Congratulations! You have been assigned to a care request.',
                $1
         FROM nurses
         WHERE id = $2`,
          [requestId, nurseId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, related_request_id)
         SELECT n.user_id,
                'application_rejected',
                'Application Update',
                'This care request has been assigned to another nurse.',
                $1
         FROM care_applications ca
         JOIN nurses n ON ca.nurse_id = n.id
         WHERE ca.request_id = $1
           AND ca.nurse_id <> $2`,
          [requestId, nurseId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, related_request_id)
         SELECT p.user_id,
                'job_assigned',
                'Nurse Assigned',
                'A nurse has been successfully assigned to your care request.',
                $1
         FROM care_requests cr
         JOIN patients p ON p.id = cr.patient_id
         WHERE cr.id = $1
           AND p.user_id IS NOT NULL`,
          [requestId]
        );
        await insertCareRequestLifecycleLog(client, {
          requestId,
          eventType: "application_accepted",
          previousStatus: requestStatus,
          nextStatus: "assigned",
          previousPaymentStatus,
          nextPaymentStatus: "pending",
          assignedNurseId: nurseId,
          comment: "Application accepted by admin.",
          changedByUserId: actor.userId,
          changedByRole: actor.role,
          metadata: {
            applicationId,
            previousAssignedNurseId
          }
        });

        await client.query("COMMIT");
        client.release();
        client = null;

        setFlash(req, "success", "Application accepted and request marked as assigned.");
        return res.redirect(applicationsRedirectUrl);
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Admin accept application rollback error:", rollbackError);
          }
          client.release();
        }
        console.error("Admin accept application error:", error);
        setFlash(req, "error", error.message || "Unable to accept application right now.");
        return res.redirect(applicationsRedirectUrl);
      }
    }
  );

  router.post(
    [
      "/admin/care-requests/:requestId/applications/:applicationId/reject",
      "/admin/marketplace/:requestId/applications/:applicationId/reject",
      "/admin/requests/:requestId/applications/:applicationId/reject"
    ],
    requireRole("admin"),
    async (req, res) => {
      const requestId = Number.parseInt(req.params.requestId, 10);
      const applicationId = Number.parseInt(req.params.applicationId, 10);
      const applicationsBasePath = getCareRequestApplicationsBasePath(req);
      const applicationsRedirectUrl = getCareRequestApplicationsRedirectUrl(req, requestId);
      if (Number.isNaN(requestId) || Number.isNaN(applicationId)) {
        setFlash(req, "error", "Invalid application request.");
        return res.redirect(applicationsBasePath);
      }

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");

        const applicationResult = await client.query(
          `SELECT
            ca.id,
            cr.status AS request_status,
            cr.payment_status AS request_payment_status,
            cr.assigned_nurse_id AS request_assigned_nurse_id
         FROM care_applications ca
         JOIN care_requests cr ON cr.id = ca.request_id
         WHERE ca.id = $1
           AND ca.request_id = $2
         FOR UPDATE OF ca, cr`,
          [applicationId, requestId]
        );
        if (!applicationResult.rows.length) {
          throw new Error("Application not found for this care request.");
        }
        const requestStatus = normalizeCareRequestStatusInput(applicationResult.rows[0].request_status);
        if (!["open", "assigned", "payment_pending"].includes(requestStatus)) {
          throw new Error("Applications can only be modified while request is open/assigned/payment_pending.");
        }
        const previousPaymentStatus = normalizeCareRequestPaymentStatusInput(
          applicationResult.rows[0].request_payment_status
        ) || "pending";
        const previousAssignedNurseId = Number.isInteger(applicationResult.rows[0].request_assigned_nurse_id)
          ? applicationResult.rows[0].request_assigned_nurse_id
          : null;
        const actor = buildCareRequestLifecycleActor(req, "admin");
        let nextStatus = requestStatus;
        let nextPaymentStatus = previousPaymentStatus;
        let nextAssignedNurseId = previousAssignedNurseId;

        await client.query(
          "UPDATE care_applications SET status = 'rejected' WHERE id = $1",
          [applicationId]
        );

        const acceptedCountResult = await client.query(
          "SELECT COUNT(*)::int AS accepted_count FROM care_applications WHERE request_id = $1 AND status = 'accepted'",
          [requestId]
        );
        if (acceptedCountResult.rows[0].accepted_count === 0) {
          await client.query(
            `UPDATE care_requests
           SET status = 'open',
               assigned_nurse_id = NULL,
               payment_status = 'pending',
               nurse_notified = FALSE
           WHERE id = $1`,
            [requestId]
          );
          nextStatus = "open";
          nextPaymentStatus = "pending";
          nextAssignedNurseId = null;
        } else {
          const acceptedNurseResult = await client.query(
            `SELECT nurse_id
           FROM care_applications
           WHERE request_id = $1
             AND status = 'accepted'
           ORDER BY applied_at DESC
           LIMIT 1`,
            [requestId]
          );
          if (acceptedNurseResult.rows[0]) {
            await client.query(
              `UPDATE care_requests
             SET assigned_nurse_id = $2,
                 status = CASE WHEN status = 'open' THEN 'assigned' ELSE status END,
                 marketplace_ready = FALSE
             WHERE id = $1`,
              [requestId, acceptedNurseResult.rows[0].nurse_id]
            );
            nextAssignedNurseId = acceptedNurseResult.rows[0].nurse_id;
            if (requestStatus === "open") {
              nextStatus = "assigned";
            }
          }
        }
        await insertCareRequestLifecycleLog(client, {
          requestId,
          eventType: "application_rejected",
          previousStatus: requestStatus,
          nextStatus,
          previousPaymentStatus,
          nextPaymentStatus,
          assignedNurseId: typeof nextAssignedNurseId === "number" ? nextAssignedNurseId : null,
          comment: "Application rejected by admin.",
          changedByUserId: actor.userId,
          changedByRole: actor.role,
          metadata: {
            applicationId,
            previousAssignedNurseId
          }
        });

        await client.query("COMMIT");
        client.release();
        client = null;

        setFlash(req, "success", "Application rejected.");
        return res.redirect(applicationsRedirectUrl);
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Admin reject application rollback error:", rollbackError);
          }
          client.release();
        }
        console.error("Admin reject application error:", error);
        setFlash(req, "error", error.message || "Unable to reject application right now.");
        return res.redirect(applicationsRedirectUrl);
      }
    }
  );

  router.post("/admin/care-requests/create", requireRole("admin"), async (req, res) => {
    const patientCondition = String(req.body.patient_condition || "").trim();
    const location = String(req.body.location || "").trim();
    const requiredQualification = String(req.body.required_qualification || "").trim();
    const durationValueRaw = String(req.body.duration_value || "").trim();
    const durationUnit = String(req.body.duration_unit || "").trim();
    const pricePerDayRaw = String(req.body.price_per_day || "").trim();

    if (!patientCondition || !location) {
      setFlash(req, "error", "Patient condition and location are required.");
      return res.redirect("/admin/care-requests");
    }

    const pricePerDay = pricePerDayRaw === "" ? null : Number.parseFloat(pricePerDayRaw);
    const durationValue = durationValueRaw === "" ? null : Number.parseInt(durationValueRaw, 10);
    if (pricePerDayRaw !== "" && (Number.isNaN(pricePerDay) || pricePerDay < 0)) {
      setFlash(req, "error", "Price per day must be a valid non-negative number.");
      return res.redirect("/admin/care-requests");
    }

    try {
      const requestCode = await generateUniquePublicRequestCode();
      const createdRequestResult = await pool.query(
        `INSERT INTO care_requests
        (
          patient_id,
          request_code,
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, 'open', 'pending', FALSE)
       RETURNING id, status, payment_status, assigned_nurse_id`,
        [
          null,
          requestCode,
          patientCondition || requiredQualification || location || "General care support required",
          Number.isNaN(durationValue) ? null : durationValue,
          durationUnit || null,
          pricePerDay || 0,
          pricePerDay || 0
        ]
      );

      try {
        const createdRequest = createdRequestResult.rows[0];
        const actor = buildCareRequestLifecycleActor(req, "admin");
        await insertCareRequestLifecycleLog(pool, {
          requestId: createdRequest.id,
          eventType: "created_by_admin",
          previousStatus: null,
          nextStatus: createdRequest.status,
          previousPaymentStatus: null,
          nextPaymentStatus: createdRequest.payment_status,
          assignedNurseId: createdRequest.assigned_nurse_id,
          comment: "Care request created manually by admin.",
          changedByUserId: actor.userId,
          changedByRole: actor.role,
          metadata: {
            source: "admin-create"
          }
        });
      } catch (logError) {
        console.error("Care request lifecycle log creation failed (admin flow):", logError);
      }

      setFlash(req, "success", "Care request created.");
      return res.redirect("/admin/care-requests");
    } catch (error) {
      console.error("Admin care request create error:", error);
      setFlash(req, "error", "Unable to create care request right now.");
      return res.redirect("/admin/care-requests");
    }
  });

  router.post("/admin/care-requests/:id/delete", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    try {
      const deleteResult = await deleteCareRequestWithPatientCleanup(requestId);
      if (!deleteResult.deleted) {
        setFlash(req, "error", "Care request not found.");
        return res.redirect(redirectTarget);
      }
      setFlash(req, "success", "Care request deleted.");
      return res.redirect(redirectTarget);
    } catch (error) {
      console.error("Admin care request delete error:", error);
      setFlash(req, "error", "Unable to delete care request right now.");
      return res.redirect(redirectTarget);
    }
  });

  async function getCareRequestForUpdate(client, requestId) {
    const requestResult = await client.query(
      `SELECT id, status, payment_status, assigned_nurse_id
     FROM care_requests
     WHERE id = $1
     FOR UPDATE`,
      [requestId]
    );
    return requestResult.rows[0] || null;
  }

  router.post("/admin/care-requests/:id/payment-pending", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    const assignmentComment = normalizeAssignmentCommentInput(req.body.assignment_comment);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const currentRequest = await getCareRequestForUpdate(client, requestId);
      if (!currentRequest) {
        throw new Error("Care request not found.");
      }
      if (!currentRequest.assigned_nurse_id) {
        throw new Error("Assign a nurse before moving to payment pending.");
      }
      assertCareRequestTransition(currentRequest.status, "payment_pending");
      const actor = buildCareRequestLifecycleActor(req, "admin");

      await client.query(
        `UPDATE care_requests
       SET status = 'payment_pending',
           payment_status = 'pending',
           assignment_comment = COALESCE($2, assignment_comment)
       WHERE id = $1`,
        [requestId, assignmentComment]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "payment_marked_pending",
        previousStatus: currentRequest.status,
        nextStatus: "payment_pending",
        previousPaymentStatus: currentRequest.payment_status,
        nextPaymentStatus: "pending",
        assignedNurseId: currentRequest.assigned_nurse_id,
        comment: assignmentComment || "Request moved to payment_pending by admin.",
        changedByUserId: actor.userId,
        changedByRole: actor.role
      });

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Request moved to payment pending.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin payment-pending rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin payment-pending transition error:", error);
      setFlash(req, "error", error.message || "Unable to move request to payment pending.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/care-requests/:id/confirm-payment", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    const assignmentComment = normalizeAssignmentCommentInput(req.body.assignment_comment);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const currentRequest = await getCareRequestForUpdate(client, requestId);
      if (!currentRequest) {
        throw new Error("Care request not found.");
      }
      if (!currentRequest.assigned_nurse_id) {
        throw new Error("Assign a nurse before confirming payment.");
      }
      if (!["assigned", "payment_pending"].includes(currentRequest.status)) {
        throw new Error("Payment can only be confirmed for assigned/payment_pending requests.");
      }
      assertCareRequestTransition(currentRequest.status, "active");
      const actor = buildCareRequestLifecycleActor(req, "admin");

      await client.query(
        `UPDATE care_requests
       SET status = 'active',
           payment_status = 'paid',
           assignment_comment = COALESCE($2, assignment_comment),
           nurse_notified = FALSE
       WHERE id = $1`,
        [requestId, assignmentComment]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "payment_confirmed",
        previousStatus: currentRequest.status,
        nextStatus: "active",
        previousPaymentStatus: currentRequest.payment_status,
        nextPaymentStatus: "paid",
        assignedNurseId: currentRequest.assigned_nurse_id,
        comment: assignmentComment || "Payment confirmed by admin.",
        changedByUserId: actor.userId,
        changedByRole: actor.role
      });

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Payment confirmed. Request moved to active.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin confirm-payment rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin confirm-payment transition error:", error);
      setFlash(req, "error", error.message || "Unable to confirm payment right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/care-requests/:id/complete", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const currentRequest = await getCareRequestForUpdate(client, requestId);
      if (!currentRequest) {
        throw new Error("Care request not found.");
      }
      assertCareRequestTransition(currentRequest.status, "completed");
      const actor = buildCareRequestLifecycleActor(req, "admin");

      await client.query(
        `UPDATE care_requests
       SET status = 'completed'
       WHERE id = $1`,
        [requestId]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "service_completed",
        previousStatus: currentRequest.status,
        nextStatus: "completed",
        previousPaymentStatus: currentRequest.payment_status,
        nextPaymentStatus: currentRequest.payment_status,
        assignedNurseId: currentRequest.assigned_nurse_id,
        comment: "Service marked completed by admin.",
        changedByUserId: actor.userId,
        changedByRole: actor.role
      });
      await upsertCareRequestEarnings(
        client,
        requestId,
        actor,
        "Earnings generated after service completion."
      );

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Request marked as completed.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin complete rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin complete transition error:", error);
      setFlash(req, "error", error.message || "Unable to complete request right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/care-requests/:id/reassign", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    const assignmentComment = normalizeAssignmentCommentInput(req.body.assignment_comment)
      || "Reassigned by admin.";
    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const currentRequest = await getCareRequestForUpdate(client, requestId);
      if (!currentRequest) {
        throw new Error("Care request not found.");
      }
      if (!["assigned", "payment_pending", "active"].includes(currentRequest.status)) {
        throw new Error("Only assigned/payment_pending/active requests can be reassigned.");
      }
      assertCareRequestTransition(currentRequest.status, "open");
      const actor = buildCareRequestLifecycleActor(req, "admin");

      await client.query(
        `UPDATE care_requests
       SET status = 'open',
           assigned_nurse_id = NULL,
           payment_status = 'pending',
           assignment_comment = $2,
           nurse_notified = FALSE
       WHERE id = $1`,
        [requestId, assignmentComment]
      );
      await client.query(
        `UPDATE care_applications
       SET status = 'rejected'
       WHERE request_id = $1`,
        [requestId]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "request_reassigned",
        previousStatus: currentRequest.status,
        nextStatus: "open",
        previousPaymentStatus: currentRequest.payment_status,
        nextPaymentStatus: "pending",
        assignedNurseId: null,
        comment: assignmentComment,
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          previousAssignedNurseId: currentRequest.assigned_nurse_id
        }
      });

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Request reassigned and reopened for marketplace applications.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin reassign rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin reassign transition error:", error);
      setFlash(req, "error", error.message || "Unable to reassign request right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post(
    ["/admin/care-requests/:id/cancel", "/admin/care-requests/:id/close"],
    requireRole("admin"),
    async (req, res) => {
      const requestId = Number.parseInt(req.params.id, 10);
      const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
      const assignmentComment = normalizeAssignmentCommentInput(req.body.assignment_comment)
        || "Cancelled by admin.";
      if (Number.isNaN(requestId)) {
        setFlash(req, "error", "Invalid care request.");
        return res.redirect(redirectTarget);
      }

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");

        const currentRequest = await getCareRequestForUpdate(client, requestId);
        if (!currentRequest) {
          throw new Error("Care request not found.");
        }
        assertCareRequestTransition(currentRequest.status, "cancelled");
        const actor = buildCareRequestLifecycleActor(req, "admin");

        await client.query(
          `UPDATE care_requests
         SET status = 'cancelled',
             marketplace_ready = FALSE,
             assignment_comment = $2
         WHERE id = $1`,
          [requestId, assignmentComment]
        );
        await client.query(
          `UPDATE care_applications
         SET status = 'rejected'
         WHERE request_id = $1
           AND status <> 'rejected'`,
          [requestId]
        );
        await insertCareRequestLifecycleLog(client, {
          requestId,
          eventType: "request_cancelled",
          previousStatus: currentRequest.status,
          nextStatus: "cancelled",
          previousPaymentStatus: currentRequest.payment_status,
          nextPaymentStatus: currentRequest.payment_status,
          assignedNurseId: currentRequest.assigned_nurse_id,
          comment: assignmentComment,
          changedByUserId: actor.userId,
          changedByRole: actor.role
        });

        await client.query("COMMIT");
        client.release();
        client = null;
        setFlash(req, "success", "Care request cancelled.");
        return res.redirect(redirectTarget);
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Admin cancel rollback error:", rollbackError);
          }
          client.release();
        }
        console.error("Admin cancel transition error:", error);
        setFlash(req, "error", error.message || "Unable to cancel care request right now.");
        return res.redirect(redirectTarget);
      }
    }
  );

  router.post("/admin/care-requests/:id/rating", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    const rating = Number.parseInt(String(req.body.rating || "").trim(), 10);
    const feedback = String(req.body.feedback || "").trim();

    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setFlash(req, "error", "Rating must be between 1 and 5.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const requestResult = await client.query(
        `SELECT id, status, assigned_nurse_id, patient_id
       FROM care_requests
       WHERE id = $1
       FOR UPDATE`,
        [requestId]
      );
      const careRequest = requestResult.rows[0];
      if (!careRequest) {
        throw new Error("Care request not found.");
      }
      if (careRequest.status !== "completed") {
        throw new Error("Ratings can only be recorded for completed requests.");
      }
      if (!careRequest.assigned_nurse_id) {
        throw new Error("No assigned nurse found for this request.");
      }

      const actor = buildCareRequestLifecycleActor(req, "admin");

      await client.query(
        `INSERT INTO care_request_ratings (
          request_id,
          nurse_id,
          patient_id,
          rating,
          feedback,
          rated_by_user_id,
          rated_by_role,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT (request_id)
        DO UPDATE SET
          nurse_id = EXCLUDED.nurse_id,
          patient_id = EXCLUDED.patient_id,
          rating = EXCLUDED.rating,
          feedback = EXCLUDED.feedback,
          rated_by_user_id = EXCLUDED.rated_by_user_id,
          rated_by_role = EXCLUDED.rated_by_role,
          updated_at = NOW()`,
        [
          requestId,
          careRequest.assigned_nurse_id,
          careRequest.patient_id || null,
          rating,
          feedback || null,
          actor.userId,
          actor.role
        ]
      );

      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "rating_recorded",
        previousStatus: null,
        nextStatus: null,
        previousPaymentStatus: null,
        nextPaymentStatus: null,
        assignedNurseId: careRequest.assigned_nurse_id,
        comment: feedback || `Rating recorded: ${rating}/5`,
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          rating
        }
      });

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Nurse rating updated.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin rating rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin rating update error:", error);
      setFlash(req, "error", error.message || "Unable to save rating right now.");
      return res.redirect(redirectTarget);
    }
  });

  router.post("/admin/care-requests/:id/earnings/payout-status", requireRole("admin"), async (req, res) => {
    const requestId = Number.parseInt(req.params.id, 10);
    const redirectTarget = getCareRequestListRedirectTarget(req.body.redirect_to);
    const payoutStatus = normalizeCareRequestPayoutStatusInput(req.body.payout_status);
    const payoutReference = String(req.body.payout_reference || "").trim();
    const payoutNotes = String(req.body.payout_notes || "").trim();

    if (Number.isNaN(requestId)) {
      setFlash(req, "error", "Invalid care request.");
      return res.redirect(redirectTarget);
    }
    if (!payoutStatus) {
      setFlash(req, "error", "Invalid payout status.");
      return res.redirect(redirectTarget);
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const requestResult = await client.query(
        `SELECT id, status, assigned_nurse_id
       FROM care_requests
       WHERE id = $1
       FOR UPDATE`,
        [requestId]
      );
      const careRequest = requestResult.rows[0];
      if (!careRequest) {
        throw new Error("Care request not found.");
      }
      if (careRequest.status !== "completed") {
        throw new Error("Payout status can only be managed for completed requests.");
      }

      const actor = buildCareRequestLifecycleActor(req, "admin");
      const ensuredEarnings = await upsertCareRequestEarnings(
        client,
        requestId,
        actor,
        "Earnings ensured before payout status update."
      );
      if (!ensuredEarnings) {
        throw new Error("Unable to initialize earnings for this request.");
      }

      const previousPayoutStatus = String(ensuredEarnings.payout_status || "pending");

      const earningsUpdateResult = await client.query(
        `UPDATE care_request_earnings
       SET payout_status = $2,
           payout_reference = COALESCE(NULLIF($3, ''), payout_reference),
           notes = COALESCE(NULLIF($4, ''), notes),
           updated_at = NOW()
       WHERE request_id = $1
       RETURNING id, payout_status`,
        [requestId, payoutStatus, payoutReference, payoutNotes]
      );
      const earnings = earningsUpdateResult.rows[0];

      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "payout_status_updated",
        previousStatus: null,
        nextStatus: null,
        previousPaymentStatus: null,
        nextPaymentStatus: null,
        assignedNurseId: careRequest.assigned_nurse_id,
        comment: payoutNotes || `Payout status updated to ${payoutStatus}.`,
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          earningsId: earnings && earnings.id ? earnings.id : null,
          previousPayoutStatus,
          nextPayoutStatus: earnings && earnings.payout_status ? earnings.payout_status : payoutStatus,
          payoutReference: payoutReference || null
        }
      });

      await client.query("COMMIT");
      client.release();
      client = null;
      setFlash(req, "success", "Payout status updated.");
      return res.redirect(redirectTarget);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Admin payout status rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Admin payout status update error:", error);
      setFlash(req, "error", error.message || "Unable to update payout status right now.");
      return res.redirect(redirectTarget);
    }
  });


  return router;
}

module.exports = createAdminController;
