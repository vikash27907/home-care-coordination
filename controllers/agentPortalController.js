const express = require("express");
const runtime = require("../services/runtimeContext");

function createAgentPortalController() {
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

function normalizeDashboardRequestStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "open";
  if (CARE_REQUEST_STATUSES.includes(normalized)) return normalized;
  if (normalized === "new" || normalized === "requested") return "open";
  if (normalized === "in progress" || normalized === "active job") return "active";
  if (normalized === "closed" || normalized === "resolved") return "completed";
  return "open";
}

function getAgentStoreSlice(agentEmail) {
  const store = readNormalizedStore();
  const patients = store.patients
    .filter((item) => normalizeEmail(item.agentEmail) === agentEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const nurses = store.nurses
    .filter((item) => !isStoreUserDeleted(store, item.userId) && nurseHasAgent(item, agentEmail))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { store, patients, nurses };
}

function getAgentNurseOwnershipSql(alias, emailParamRef, userIdParamRef) {
  const rosterSql = userIdParamRef
    ? `
    OR EXISTS (
      SELECT 1
      FROM agent_nurse_roster anr
      WHERE anr.nurse_id = ${alias}.id
        AND anr.agent_id = ${userIdParamRef}
    )`
    : "";

  return `(
    LOWER(COALESCE(${alias}.agent_email, '')) = LOWER(${emailParamRef})
    OR EXISTS (
      SELECT 1
      FROM unnest(COALESCE(${alias}.agent_emails, ARRAY[]::text[])) AS ae(agent_email)
      WHERE LOWER(agent_email) = LOWER(${emailParamRef})
    )${rosterSql}
  )`;
}

router.get("/agent", requireRole("agent"), (req, res) => {
  return res.redirect("/agent/dashboard");
});

router.get("/agent/dashboard", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const agentUserId = req.currentUser.id;
  const requestedTab = String(req.query.tab || "jobs").trim().toLowerCase();
  const activeTab = requestedTab === "staff" ? "staff" : "jobs";

  try {
    let jobs = [];
    let staff = [];
    let assignableNurses = [];

    if (activeTab === "jobs") {
      const [jobsResult, nursesResult] = await Promise.all([
        pool.query(
          `SELECT
              cr.id,
              COALESCE(NULLIF(p.full_name, ''), CONCAT('Patient ', cr.id::text)) AS patient_name,
              COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General care support') AS service_required,
              COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
              COALESCE(NULLIF(p.city, ''), '-') AS address,
              COALESCE(cr.status, 'open') AS status,
              cr.assigned_nurse_id,
              COALESCE(NULLIF(assigned_nurse.full_name, ''), '-') AS assigned_nurse_name,
              cr.created_at
           FROM care_requests cr
           LEFT JOIN patients p ON p.id = cr.patient_id
           LEFT JOIN nurses assigned_nurse ON assigned_nurse.id = cr.assigned_nurse_id
           WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
           ORDER BY cr.created_at DESC`,
          [agentEmail]
        ),
        pool.query(
          `SELECT
              n.id,
              n.full_name,
              COALESCE(NULLIF(n.unique_id, ''), CONCAT('PHCN-', LPAD(n.id::text, 3, '0'))) AS unique_id
           FROM nurses n
           LEFT JOIN users u ON u.id = n.user_id
           WHERE (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
             AND LOWER(COALESCE(n.status, 'pending')) = 'approved'
             AND COALESCE(n.is_available, TRUE) = TRUE
             AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}
           ORDER BY n.created_at DESC`,
          [agentEmail, agentUserId]
        )
      ]);

      jobs = jobsResult.rows;
      assignableNurses = nursesResult.rows;
    }

    if (activeTab === "staff") {
      const staffResult = await pool.query(
        `SELECT
            n.id,
            n.full_name,
            n.unique_id,
            COALESCE(NULLIF(n.city, ''), 'Not shared') AS city,
            COALESCE(n.experience_years, 0) AS experience_years,
            COALESCE(n.skills, ARRAY[]::text[]) AS skills,
            COALESCE(n.public_skills, ARRAY[]::text[]) AS public_skills,
            COALESCE(n.qualifications, '[]'::jsonb) AS qualifications,
            COALESCE(n.profile_image_url, '') AS profile_image_url,
            COALESCE(n.profile_image_path, '') AS profile_image_path,
            COALESCE(n.public_bio, '') AS public_bio,
            n.profile_slug,
            COALESCE(NULLIF(n.status, ''), 'Pending') AS status,
            COALESCE(u.email_verified, FALSE) AS email_verified,
            COALESCE(n.is_available, TRUE) AS is_available,
            COALESCE(n.public_show_city, TRUE) AS public_show_city,
            COALESCE(n.public_show_experience, TRUE) AS public_show_experience,
            n.created_at
         FROM nurses n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
           AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}
         ORDER BY n.created_at DESC`,
        [agentEmail, agentUserId]
      );

      staff = staffResult.rows.map((row) => buildAgentDashboardNurse(row));
    }

    return res.render("agent/dashboard", {
      title: "Agent Dashboard",
      agent: req.agentRecord,
      user: req.currentUser,
      jobs,
      assignableNurses,
      staff,
      activeTab
    });
  } catch (error) {
    console.error("Agent dashboard error:", error);
    return res.status(500).send("Server error");
  }
});

router.post("/agent/nurse/delete", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const redirectTarget = "/agent/dashboard?tab=staff";
  const nurseId = Number.parseInt(req.body.nurseId, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);
  const agentUserId = req.currentUser.id;

  if (Number.isNaN(nurseId) || nurseId <= 0) {
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
          n.status,
          n.profile_image_url,
          n.profile_image_path,
          n.resume_url,
          n.aadhar_image_url,
          n.certificate_url,
          n.qualifications
       FROM nurses n
       WHERE n.id = $3
         AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}
       LIMIT 1`,
      [agentEmail, agentUserId, nurseId]
    );
    const nurse = nurseResult.rows[0];

    if (!nurse) {
      await client.query("ROLLBACK");
      setFlash(req, "error", "You can only delete nurses in your own roster.");
      return res.redirect(redirectTarget);
    }

    let emailVerified = false;
    let userRole = "";
    if (Number.isInteger(nurse.user_id)) {
      const userResult = await client.query(
        `SELECT email_verified, role
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [nurse.user_id]
      );
      const linkedUser = userResult.rows[0];
      emailVerified = linkedUser ? linkedUser.email_verified === true : false;
      userRole = linkedUser ? String(linkedUser.role || "").trim().toLowerCase() : "";
    }

    const normalizedStatus = String(nurse.status || "Pending").trim().toLowerCase();
    if (emailVerified || normalizedStatus === "approved") {
      await client.query("ROLLBACK");
      setFlash(req, "error", "This nurse is locked and cannot be deleted.");
      return res.redirect(redirectTarget);
    }

    const activeAssignmentsResult = await client.query(
      `SELECT id
       FROM care_requests
       WHERE assigned_nurse_id = $1
         AND LOWER(COALESCE(status, 'open')) NOT IN ('completed', 'cancelled')
       LIMIT 1`,
      [nurseId]
    );
    if (activeAssignmentsResult.rowCount > 0) {
      await client.query("ROLLBACK");
      setFlash(req, "error", "Cannot delete nurse assigned to active jobs.");
      return res.redirect(redirectTarget);
    }

    if (userRole && userRole !== "nurse") {
      await client.query("ROLLBACK");
      setFlash(req, "error", "Selected account is not a nurse.");
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
             THEN 'Assigned nurse was deleted by agent before activation.'
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

    if (Number.isInteger(nurse.user_id)) {
      await client.query("DELETE FROM users WHERE id = $1", [nurse.user_id]);
    }

    await client.query("COMMIT");

    const cache = readStore();
    if (Number.isInteger(nurse.user_id)) {
      cache.users = (cache.users || []).filter((item) => item.id !== nurse.user_id);
    }
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

    try {
      await deleteNurseAssets(assetUrls);
    } catch (assetError) {
      console.error("Agent nurse asset cleanup error:", assetError);
    }

    setFlash(req, "success", "Nurse deleted successfully.");
    return res.redirect(redirectTarget);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Agent nurse delete rollback error:", rollbackError);
      }
    }
    console.error("DELETE ERROR:", error);
    setFlash(req, "error", "Unable to delete nurse right now.");
    return res.redirect(redirectTarget);
  } finally {
    if (client) client.release();
  }
});

router.get("/agent/dashboard/stats", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const agentUserId = req.currentUser.id;

  try {
    const [requestsResult, nursesResult, revenueResult] = await Promise.all([
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE cr.status IN ('open', 'assigned', 'payment_pending'))::int AS pending_requests,
            COUNT(*) FILTER (WHERE cr.status = 'active')::int AS active_jobs
         FROM care_requests cr
         JOIN patients p ON p.id = cr.patient_id
         WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)`,
        [agentEmail]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS available_nurses
         FROM nurses n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
           AND LOWER(COALESCE(n.status, 'pending')) = 'approved'
           AND COALESCE(n.is_available, TRUE) = TRUE
           AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}`,
        [agentEmail, agentUserId]
      ),
      pool.query(
        `SELECT
            COALESCE(SUM(e.platform_fee), 0)::numeric(12,2) AS revenue
         FROM care_request_earnings e
         JOIN care_requests cr ON cr.id = e.request_id
         JOIN patients p ON p.id = cr.patient_id
         WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)`,
        [agentEmail]
      )
    ]);

    const requestRow = requestsResult.rows[0] || {};
    const nurseRow = nursesResult.rows[0] || {};
    const revenueRow = revenueResult.rows[0] || {};

    return res.json({
      pendingRequests: Number.parseInt(requestRow.pending_requests, 10) || 0,
      activeJobs: Number.parseInt(requestRow.active_jobs, 10) || 0,
      availableNurses: Number.parseInt(nurseRow.available_nurses, 10) || 0,
      revenue: Number.parseFloat(revenueRow.revenue) || 0
    });
  } catch (error) {
    console.error("Agent dashboard stats query error:", error);
    const { patients, nurses } = getAgentStoreSlice(agentEmail);
    const pendingRequests = patients.filter((patient) => normalizeDashboardRequestStatus(patient.status) === "open").length;
    const activeJobs = patients.filter((patient) => normalizeDashboardRequestStatus(patient.status) === "active").length;
    const availableNurses = nurses.filter(
      (nurse) => String(nurse.status || "").toLowerCase() === "approved" && nurse.isAvailable !== false
    ).length;
    const revenue = patients.reduce((sum, patient) => sum + (Number(patient.commissionAmount) || 0), 0);
    return res.json({
      pendingRequests,
      activeJobs,
      availableNurses,
      revenue: Number(revenue.toFixed(2))
    });
  }
});

router.get("/agent/requests", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);

  try {
    const result = await pool.query(
      `SELECT
          cr.id,
          COALESCE(NULLIF(p.full_name, ''), CONCAT('Patient ', cr.id::text)) AS patient,
          COALESCE(NULLIF(p.city, ''), '-') AS city,
          COALESCE(NULLIF(cr.care_type, ''), NULLIF(p.notes, ''), 'General Care') AS care_type,
          cr.status,
          cr.payment_status,
          cr.created_at
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
       ORDER BY cr.created_at DESC
       LIMIT 100`,
      [agentEmail]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Agent requests query error:", error);
    const { patients } = getAgentStoreSlice(agentEmail);
    const fallbackRows = patients.slice(0, 100).map((patient) => ({
      id: patient.requestId || patient.id,
      patient: patient.fullName || "Patient",
      city: patient.city || "-",
      care_type: patient.careRequirement || patient.notes || "General Care",
      status: normalizeDashboardRequestStatus(patient.status),
      payment_status: "pending",
      created_at: patient.createdAt || now()
    }));
    return res.json(fallbackRows);
  }
});

router.get("/agent/applications", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);

  try {
    const result = await pool.query(
      `SELECT
          ca.id,
          ca.request_id,
          ca.nurse_id,
          n.full_name AS nurse_name,
          COALESCE(NULLIF(n.city, ''), '-') AS city,
          COALESCE(NULLIF(cr.care_type, ''), 'General Care') AS care_type,
          ca.status,
          ca.applied_at
       FROM care_applications ca
       JOIN care_requests cr ON cr.id = ca.request_id
       JOIN patients p ON p.id = cr.patient_id
       JOIN nurses n ON n.id = ca.nurse_id
       JOIN users u ON u.id = n.user_id
       WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
         AND COALESCE(u.is_deleted, FALSE) = FALSE
       ORDER BY ca.applied_at DESC
       LIMIT 100`,
      [agentEmail]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Agent applications query error:", error);
    return res.json([]);
  }
});

router.get("/agent/nurses", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const agentUserId = req.currentUser.id;

  try {
    const result = await pool.query(
      `SELECT
          n.id,
          n.full_name,
          COALESCE(NULLIF(n.city, ''), '-') AS city,
          COALESCE(n.experience_years, 0) AS experience_years,
          COALESCE(LOWER(n.status), 'pending') AS status,
          COALESCE(n.is_available, TRUE) AS is_available,
          COALESCE(active_jobs.total_jobs, 0)::int AS active_jobs
       FROM nurses n
       LEFT JOIN users u ON u.id = n.user_id
       LEFT JOIN (
         SELECT
           cr.assigned_nurse_id,
           COUNT(*) AS total_jobs
         FROM care_requests cr
         JOIN patients p ON p.id = cr.patient_id
         WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
           AND cr.status IN ('assigned', 'payment_pending', 'active')
         GROUP BY cr.assigned_nurse_id
       ) active_jobs ON active_jobs.assigned_nurse_id = n.id
       WHERE (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
         AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}
       ORDER BY n.created_at DESC
       LIMIT 100`,
      [agentEmail, agentUserId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Agent nurses query error:", error);
    const { nurses } = getAgentStoreSlice(agentEmail);
    const fallbackRows = nurses.slice(0, 100).map((nurse) => ({
      id: nurse.id,
      full_name: nurse.fullName || "Nurse",
      city: nurse.city || "-",
      experience_years: Number.parseInt(nurse.experienceYears, 10) || 0,
      status: String(nurse.status || "pending").toLowerCase(),
      is_available: nurse.isAvailable !== false,
      active_jobs: 0
    }));
    return res.json(fallbackRows);
  }
});

router.get("/agent/financials", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);

  try {
    const [summaryResult, rowsResult] = await Promise.all([
      pool.query(
        `SELECT
            COALESCE(SUM(e.gross_amount), 0)::numeric(12,2) AS gross_amount,
            COALESCE(SUM(e.platform_fee), 0)::numeric(12,2) AS platform_fee,
            COALESCE(SUM(e.net_amount), 0)::numeric(12,2) AS nurse_payout
         FROM care_request_earnings e
         JOIN care_requests cr ON cr.id = e.request_id
         JOIN patients p ON p.id = cr.patient_id
         WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)`,
        [agentEmail]
      ),
      pool.query(
        `SELECT
            e.request_id,
            COALESCE(NULLIF(p.full_name, ''), CONCAT('Patient ', e.request_id::text)) AS patient_name,
            COALESCE(NULLIF(n.full_name, ''), '-') AS nurse_name,
            COALESCE(e.gross_amount, 0)::numeric(12,2) AS gross_amount,
            COALESCE(e.platform_fee, 0)::numeric(12,2) AS platform_fee,
            COALESCE(e.net_amount, 0)::numeric(12,2) AS nurse_payout,
            e.payout_status,
            e.updated_at
         FROM care_request_earnings e
         JOIN care_requests cr ON cr.id = e.request_id
         JOIN patients p ON p.id = cr.patient_id
         LEFT JOIN nurses n ON n.id = e.nurse_id
         WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
         ORDER BY e.updated_at DESC NULLS LAST, e.generated_at DESC
         LIMIT 50`,
        [agentEmail]
      )
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    const grossAmount = Number.parseFloat(summaryRow.gross_amount) || 0;
    const platformFee = Number.parseFloat(summaryRow.platform_fee) || 0;
    const nursePayout = Number.parseFloat(summaryRow.nurse_payout) || 0;

    return res.json({
      summary: {
        grossAmount,
        platformFee,
        agentMargin: platformFee,
        nursePayout
      },
      rows: rowsResult.rows
    });
  } catch (error) {
    console.error("Agent financials query error:", error);
    const { patients } = getAgentStoreSlice(agentEmail);
    const fallbackRows = patients
      .filter((patient) => typeof patient.nurseAmount === "number" || typeof patient.budget === "number")
      .slice(0, 50)
      .map((patient) => {
        const gross = typeof patient.nurseAmount === "number"
          ? patient.nurseAmount
          : (typeof patient.budget === "number" ? patient.budget : 0);
        const platformFee = Number(patient.commissionAmount) || 0;
        const nursePayout = typeof patient.nurseNetAmount === "number"
          ? patient.nurseNetAmount
          : Math.max(gross - platformFee, 0);
        return {
          request_id: patient.requestId || patient.id,
          patient_name: patient.fullName || "Patient",
          nurse_name: patient.preferredNurseName || "-",
          gross_amount: Number(gross.toFixed(2)),
          platform_fee: Number(platformFee.toFixed(2)),
          nurse_payout: Number(nursePayout.toFixed(2)),
          payout_status: "pending",
          updated_at: patient.createdAt || now()
        };
      });
    const grossAmount = fallbackRows.reduce((sum, row) => sum + (row.gross_amount || 0), 0);
    const platformFee = fallbackRows.reduce((sum, row) => sum + (row.platform_fee || 0), 0);
    const nursePayout = fallbackRows.reduce((sum, row) => sum + (row.nurse_payout || 0), 0);
    return res.json({
      summary: {
        grossAmount: Number(grossAmount.toFixed(2)),
        platformFee: Number(platformFee.toFixed(2)),
        agentMargin: Number(platformFee.toFixed(2)),
        nursePayout: Number(nursePayout.toFixed(2))
      },
      rows: fallbackRows
    });
  }
});

router.get("/agent/dashboard/monthly", requireRole("agent"), loadAgentProfile, async (req, res) => {
  const agentEmail = normalizeEmail(req.currentUser.email);
  try {
    const result = await pool.query(
      `SELECT
          date_trunc('month', cr.created_at) AS month_start,
          COALESCE(SUM(e.platform_fee), 0)::numeric(12,2) AS revenue,
          COUNT(*) FILTER (WHERE cr.status = 'completed')::int AS completed_jobs,
          COUNT(DISTINCT cr.assigned_nurse_id) FILTER (
            WHERE cr.status IN ('active', 'completed')
              AND cr.assigned_nurse_id IS NOT NULL
          )::int AS active_nurses
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       LEFT JOIN care_request_earnings e ON e.request_id = cr.id
       WHERE LOWER(COALESCE(p.agent_email, '')) = LOWER($1)
         AND cr.created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
       GROUP BY date_trunc('month', cr.created_at)
       ORDER BY month_start ASC`,
      [agentEmail]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("Agent monthly metrics query error:", error);
    return res.json([]);
  }
});

router.post("/agent/requests/:id/actions", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);
  const action = String(req.body.action || "").trim().toLowerCase();
  const agentEmail = normalizeEmail(req.currentUser.email);
  const agentUserId = req.currentUser.id;
  const acceptsJson = String(req.headers.accept || "").includes("application/json");

  if (Number.isNaN(requestId) || requestId <= 0) {
    if (!acceptsJson) {
      setFlash(req, "error", "Invalid request ID.");
      return res.redirect("/agent/dashboard?tab=jobs");
    }
    return res.status(400).json({ error: "Invalid request ID." });
  }
  if (!["assign", "start", "complete"].includes(action)) {
    if (!acceptsJson) {
      setFlash(req, "error", "Invalid action.");
      return res.redirect("/agent/dashboard?tab=jobs");
    }
    return res.status(400).json({ error: "Invalid action." });
  }

  let client = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT
          cr.id,
          cr.status,
          cr.payment_status,
          cr.assigned_nurse_id
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE cr.id = $1
         AND LOWER(COALESCE(p.agent_email, '')) = LOWER($2)
       LIMIT 1`,
      [requestId, agentEmail]
    );
    const careRequest = requestResult.rows[0];
    if (!careRequest) {
      await client.query("ROLLBACK");
      client.release();
      client = null;
      if (!acceptsJson) {
        setFlash(req, "error", "Request not found in your assigned records.");
        return res.redirect("/agent/dashboard?tab=jobs");
      }
      return res.status(404).json({ error: "Request not found in your assigned records." });
    }

    const currentStatus = normalizeCareRequestStatusInput(careRequest.status);
    const currentPaymentStatus = normalizeCareRequestPaymentStatusInput(careRequest.payment_status);
    const actor = buildCareRequestLifecycleActor(req, "agent");
    let responseMessage = "";

    if (action === "assign") {
      const nurseId = Number.parseInt(req.body.nurseId, 10);
      if (Number.isNaN(nurseId) || nurseId <= 0) {
        throw new Error("Nurse ID is required for assign action.");
      }

      const nurseResult = await client.query(
        `SELECT
            n.id,
            n.full_name,
            n.status,
            COALESCE(n.is_available, TRUE) AS is_available
         FROM nurses n
         LEFT JOIN users u ON u.id = n.user_id
         WHERE n.id = $2
           AND (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
           AND ${getAgentNurseOwnershipSql("n", "$1", "$3")}
         LIMIT 1`,
        [agentEmail, nurseId, agentUserId]
      );
      const nurse = nurseResult.rows[0];
      if (!nurse) {
        throw new Error("Selected nurse is not assigned under your account.");
      }
      if (String(nurse.status || "").toLowerCase() !== "approved" || nurse.is_available === false) {
        throw new Error("Selected nurse must be approved and available.");
      }

      const previousStatus = currentStatus || "open";
      if (previousStatus !== "assigned") {
        assertCareRequestTransition(previousStatus, "assigned");
      }

      await client.query(
        `UPDATE care_requests
         SET assigned_nurse_id = $2,
             status = 'assigned',
             payment_status = 'pending',
             nurse_notified = TRUE,
             assignment_comment = $3
         WHERE id = $1`,
        [requestId, nurseId, `Assigned from agent dashboard by ${agentEmail}`]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "agent_nurse_assigned",
        previousStatus,
        nextStatus: "assigned",
        previousPaymentStatus: currentPaymentStatus || "pending",
        nextPaymentStatus: "pending",
        assignedNurseId: nurseId,
        comment: "Nurse assigned from agent dashboard.",
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          source: "agent_dashboard",
          nurseId
        }
      });
      responseMessage = "Nurse assigned successfully.";
    }

    if (action === "start") {
      if (!["assigned", "payment_pending"].includes(currentStatus)) {
        throw new Error("Only assigned requests can be started.");
      }
      if (!careRequest.assigned_nurse_id) {
        throw new Error("Assign a nurse before starting the job.");
      }
      assertCareRequestTransition(currentStatus, "active");

      await client.query(
        `UPDATE care_requests
         SET status = 'active',
             payment_status = 'paid'
         WHERE id = $1`,
        [requestId]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "agent_job_started",
        previousStatus: currentStatus,
        nextStatus: "active",
        previousPaymentStatus: currentPaymentStatus || "pending",
        nextPaymentStatus: "paid",
        assignedNurseId: careRequest.assigned_nurse_id,
        comment: "Job started from agent dashboard.",
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          source: "agent_dashboard"
        }
      });
      responseMessage = "Job started.";
    }

    if (action === "complete") {
      if (currentStatus !== "active") {
        throw new Error("Only active jobs can be completed.");
      }
      assertCareRequestTransition(currentStatus, "completed");

      await client.query(
        `UPDATE care_requests
         SET status = 'completed',
             payment_status = 'paid'
         WHERE id = $1`,
        [requestId]
      );
      await insertCareRequestLifecycleLog(client, {
        requestId,
        eventType: "agent_job_completed",
        previousStatus: "active",
        nextStatus: "completed",
        previousPaymentStatus: currentPaymentStatus || "paid",
        nextPaymentStatus: "paid",
        assignedNurseId: careRequest.assigned_nurse_id,
        comment: "Job completed from agent dashboard.",
        changedByUserId: actor.userId,
        changedByRole: actor.role,
        metadata: {
          source: "agent_dashboard"
        }
      });
      await upsertCareRequestEarnings(client, requestId, actor, "Earnings updated from agent dashboard completion.");
      responseMessage = "Job marked as completed.";
    }

    await client.query(
      `INSERT INTO notifications (user_id, type, title, message, related_request_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.currentUser.id,
        "agent_dashboard_action",
        "Dashboard Action Applied",
        responseMessage || "Action completed from dashboard.",
        requestId
      ]
    );

    await client.query("COMMIT");
    client.release();
    client = null;
    if (!acceptsJson) {
      setFlash(req, "success", responseMessage);
      return res.redirect("/agent/dashboard?tab=jobs");
    }
    return res.json({ success: true, message: responseMessage });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Agent request action rollback error:", rollbackError);
      }
      client.release();
    }
    console.error("Agent request action error:", error);
    if (!acceptsJson) {
      setFlash(req, "error", error.message || "Unable to apply action right now.");
      return res.redirect("/agent/dashboard?tab=jobs");
    }
    return res.status(400).json({ error: error.message || "Unable to apply action right now." });
  }
});

router.get("/agent/patients/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.render("agent/add-patient", { title: "Add Patient" });
});

router.post("/agent/patients/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
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

router.post("/agent/patients/:id/financials", requireRole("agent"), requireApprovedAgent, (req, res) => {
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
  if (!nurse || isStoreUserDeleted(store, nurse.userId) || !nurseHasAgent(nurse, agentEmail) || nurse.status !== "Approved" || nurse.isAvailable === false) {
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

router.post("/agent/patients/:id/transfer", requireRole("agent"), requireApprovedAgent, (req, res) => {
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
  const targetAgent = store.agents.find((agent) => agent.email === targetAgentEmail && isApprovedAgentStatus(agent.status));
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
      && !isStoreUserDeleted(store, assignedNurse.userId)
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

router.get("/agent/nurses/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  const store = readNormalizedStore();
  const referralNurses = store.nurses
    .filter((nurse) => !isStoreUserDeleted(store, nurse.userId) && nurse.status === "Approved")
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

router.post("/agent/nurses/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  return createNurseUnderAgent(req, res, "/agent/nurses/new");
});

router.get("/agent/nurses/:id", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const nurseId = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(nurseId)) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  const nurse = await getNurseById(nurseId);
  if (!nurse) {
    return res.status(404).render("shared/not-found", { title: "Nurse Not Found" });
  }

  const agentEmail = normalizeEmail(req.currentUser.email);
  if (!nurseHasAgent(nurse, agentEmail)) {
    return res.status(403).render("shared/forbidden", { title: "Access Restricted" });
  }

  return res.render("agent/view-nurse", {
    title: "View Nurse",
    nurse,
    role: req.session.user.role,
    contactContext: buildNurseContactContext(nurse, req.currentUser)
  });
});

router.get("/agent/agents/new", requireRole("agent"), requireApprovedAgent, (req, res) => {
  return res.render("agent/add-agent", { title: "Add Agent" });
});

router.post("/agent/agents/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  return createAgentUnderAgent(req, res, "/agent/agents/new");
});


  return router;
}

module.exports = createAgentPortalController;


