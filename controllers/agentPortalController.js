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
        grossAmount: earnings.gross_amount,
        platformFee: earnings.platform_fee,
        referralFee: earnings.referral_fee,
        netAmount: earnings.net_amount
      }
    });
  }

  return earnings;
}

function buildAgentScopedPublicNurseUrl(agentRecord, nurse) {
  const nurseProfileSlug = String((nurse && (nurse.profileSlug || nurse.profile_slug)) || "").trim();
  const agentIdentifier = String(
    (agentRecord && (agentRecord.profileSlug || agentRecord.uniqueId || agentRecord.email || agentRecord.id))
    || ""
  ).trim();

  if (agentIdentifier && nurseProfileSlug) {
    return `/agent/${encodeURIComponent(agentIdentifier)}/nurse/${encodeURIComponent(nurseProfileSlug)}`;
  }
  if (nurseProfileSlug) {
    return `/nurse/${encodeURIComponent(nurseProfileSlug)}`;
  }
  return nurse && nurse.id ? `/nurses/${nurse.id}` : "";
}

function normalizeAgentDashboardList(value) {
  return toArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
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
              COALESCE(cr.visibility_status, 'pending') AS visibility_status,
              COALESCE(cr.payment_status, 'pending') AS payment_status,
              COALESCE(p.phone_number, '') AS patient_phone,
              COALESCE(p.service_schedule, '') AS service_schedule,
              COALESCE(p.duration, CONCAT(COALESCE(cr.duration_value, 0)::text, ' ', COALESCE(cr.duration_unit, 'months'))) AS duration,
              COALESCE(NULLIF(p.notes, ''), '') AS notes,
              COALESCE(NULLIF(p.budget, 0), NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), 0)::numeric(12,2) AS budget,
              cr.assigned_nurse_id,
              COALESCE(NULLIF(assigned_nurse.full_name, ''), '-') AS assigned_nurse_name,
              COALESCE(NULLIF(assigned_nurse.unique_id, ''), CONCAT('PHCN-', LPAD(assigned_nurse.id::text, 3, '0'))) AS assigned_nurse_code,
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

      jobs = jobsResult.rows.map((row) => ({
        ...row,
        budget: Number.parseFloat(row.budget) || 0,
        canEdit: !["active", "completed", "cancelled"].includes(String(row.status || "").toLowerCase()),
        canDelete: !["active", "completed"].includes(String(row.status || "").toLowerCase()),
        canAssign: String(row.status || "").toLowerCase() === "open",
        canStart: ["assigned", "payment_pending"].includes(String(row.status || "").toLowerCase()) && Boolean(row.assigned_nurse_id),
        canComplete: String(row.status || "").toLowerCase() === "active"
      }));
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

      staff = staffResult.rows.map((row) => {
        const nurse = buildAgentDashboardNurse(row);
        return {
          ...nurse,
          dashboardUrl: `/agent/nurses/${nurse.id}`,
          publicUrl: buildAgentScopedPublicNurseUrl(req.agentRecord, nurse)
        };
      });
    }

    return res.render("agent/dashboard", {
      title: "Agent Dashboard",
      agent: req.agentRecord,
      user: req.currentUser,
      jobs,
      assignableNurses,
      staff,
      stats: {
        totalJobs: jobs.length,
        pendingApprovals: jobs.filter((job) => String(job.visibility_status || "").toLowerCase() === "pending").length,
        activeJobs: jobs.filter((job) => String(job.status || "").toLowerCase() === "active").length,
        approvedNurses: staff.filter((nurse) => String(nurse.status || "").toLowerCase() === "approved").length
      },
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

async function loadAgentAssignableNurses(agentEmail, agentUserId) {
  const nursesResult = await pool.query(
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
  );

  return nursesResult.rows;
}

async function renderAgentJobForm(req, res, options = {}) {
  const agentEmail = normalizeEmail(req.currentUser.email);
  const assignableNurses = await loadAgentAssignableNurses(agentEmail, req.currentUser.id);
  const job = options.job || {};

  return res.render("agent/job-form", {
    title: options.title || "Add Job",
    formMode: options.formMode || "create",
    formAction: options.formAction || "/agent/jobs/new",
    cancelHref: options.cancelHref || "/agent/dashboard?tab=jobs",
    job: {
      id: job.id || null,
      fullName: job.fullName || "",
      email: job.email || "",
      phoneNumber: job.phoneNumber || "",
      city: job.city || "",
      serviceSchedule: job.serviceSchedule || "",
      durationValue: job.durationValue || "",
      durationUnit: job.durationUnit || "months",
      budget: job.budget || "",
      notes: job.notes || "",
      preferredNurseId: job.preferredNurseId || "",
      requestCode: job.requestCode || "",
      status: job.status || "open",
      visibilityStatus: job.visibilityStatus || "pending"
    },
    assignableNurses
  });
}

async function resolvePreferredAgentNurse(agentEmail, agentUserId, preferredNurseId) {
  if (!Number.isInteger(preferredNurseId) || preferredNurseId <= 0) {
    return null;
  }

  const nurseResult = await pool.query(
    `SELECT n.id, n.full_name
     FROM nurses n
     LEFT JOIN users u ON u.id = n.user_id
     WHERE n.id = $2
       AND (u.id IS NULL OR COALESCE(u.is_deleted, FALSE) = FALSE)
       AND LOWER(COALESCE(n.status, 'pending')) = 'approved'
       AND COALESCE(n.is_available, TRUE) = TRUE
       AND ${getAgentNurseOwnershipSql("n", "$1", "$3")}
     LIMIT 1`,
    [agentEmail, preferredNurseId, agentUserId]
  );

  return nurseResult.rows[0] || null;
}

router.get("/agent/jobs/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  try {
    return await renderAgentJobForm(req, res, {
      title: "Add Job",
      formMode: "create",
      formAction: "/agent/jobs/new"
    });
  } catch (error) {
    console.error("Agent job form load error:", error);
    setFlash(req, "error", "Unable to load the job form right now.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }
});

router.post("/agent/jobs/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const emailInput = String(req.body.email || "").trim();
  const phoneInput = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const serviceSchedule = String(req.body.serviceSchedule || "").trim();
  const durationUnit = String(req.body.durationUnit || "").trim();
  const durationValue = Number.parseInt(req.body.durationValue, 10);
  const budget = Number.parseFloat(req.body.budget);
  const notes = String(req.body.notes || "").trim();
  const preferredNurseId = Number.parseInt(req.body.preferredNurseId, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);

  if (!fullName || !emailInput || !phoneInput || !city || !serviceSchedule) {
    setFlash(req, "error", "Please complete all required job fields.");
    return res.redirect("/agent/jobs/new");
  }

  const emailValidation = validateEmail(emailInput);
  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect("/agent/jobs/new");
  }

  const phoneValidation = validateIndiaPhone(phoneInput);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect("/agent/jobs/new");
  }

  const scheduleValidation = validateServiceSchedule(serviceSchedule);
  if (!scheduleValidation.valid) {
    setFlash(req, "error", scheduleValidation.error);
    return res.redirect("/agent/jobs/new");
  }

  if (!["days", "weeks", "months"].includes(durationUnit) || Number.isNaN(durationValue) || durationValue < 1) {
    setFlash(req, "error", "Please enter a valid duration.");
    return res.redirect("/agent/jobs/new");
  }

  if (Number.isNaN(budget) || budget <= 0) {
    setFlash(req, "error", "Please enter a valid budget.");
    return res.redirect("/agent/jobs/new");
  }

  let createdPatient = null;
  try {
    const preferredNurse = await resolvePreferredAgentNurse(
      agentEmail,
      req.currentUser.id,
      Number.isNaN(preferredNurseId) ? null : preferredNurseId
    );
    if (!Number.isNaN(preferredNurseId) && preferredNurseId > 0 && !preferredNurse) {
      setFlash(req, "error", "Preferred nurse must be approved and part of your roster.");
      return res.redirect("/agent/jobs/new");
    }

    const requestCode = await generateUniquePublicRequestCode();
    const editToken = await generateUniqueCareRequestEditToken();
    const duration = `${durationValue} ${durationUnit}`;
    const serviceScheduleLabel = req.app.locals.serviceScheduleOptions?.find((item) => item.value === serviceSchedule)?.label || serviceSchedule;
    createdPatient = await createPatient({
      id: nextId(readStore(), "patient"),
      requestId: requestCode,
      userId: null,
      fullName,
      email: emailValidation.value,
      phoneNumber: phoneValidation.value,
      city,
      serviceSchedule,
      duration,
      durationUnit,
      durationValue,
      budget,
      notes,
      status: "New",
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
      preferredNurseId: preferredNurse ? preferredNurse.id : null,
      preferredNurseName: preferredNurse ? preferredNurse.full_name : "",
      transferMarginType: "Percent",
      transferMarginValue: 0,
      transferMarginAmount: 0,
      lastTransferredAt: "",
      lastTransferredBy: "",
      createdAt: now()
    });

    if (!createdPatient) {
      throw new Error("Unable to create the patient record.");
    }

    const careRequestResult = await pool.query(
      `INSERT INTO care_requests (
          patient_id,
          request_code,
          edit_token,
          visibility_status,
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
       VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, FALSE, 'open', 'pending', FALSE)
      RETURNING id, status, payment_status, assigned_nurse_id`,
      [
        createdPatient.id,
        requestCode,
        editToken,
        notes || serviceScheduleLabel || "General care support required",
        durationValue,
        durationUnit,
        budget,
        budget
      ]
    );

    try {
      await insertCareRequestLifecycleLog(pool, {
        requestId: careRequestResult.rows[0].id,
        eventType: "created_by_agent",
        previousStatus: null,
        nextStatus: careRequestResult.rows[0].status,
        previousPaymentStatus: null,
        nextPaymentStatus: careRequestResult.rows[0].payment_status,
        assignedNurseId: careRequestResult.rows[0].assigned_nurse_id,
        comment: "Care request created from agent dashboard.",
        changedByUserId: req.currentUser.id,
        changedByRole: req.currentUser.role,
        metadata: {
          source: "agent_dashboard_create"
        }
      });
    } catch (logError) {
      console.error("Agent care request lifecycle log error:", logError);
    }

    setFlash(req, "success", "Job created successfully.");
    return res.redirect("/agent/dashboard?tab=jobs");
  } catch (error) {
    console.error("Agent job create error:", error);
    if (createdPatient && createdPatient.id) {
      try {
        await deletePatient(createdPatient.id);
      } catch (cleanupError) {
        console.error("Agent job create cleanup error:", cleanupError);
      }
    }
    setFlash(req, "error", error.message || "Unable to create the job right now.");
    return res.redirect("/agent/jobs/new");
  }
});

router.get("/agent/jobs/:id/edit", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);

  if (Number.isNaN(requestId) || requestId <= 0) {
    setFlash(req, "error", "Invalid job.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }

  try {
    const result = await pool.query(
      `SELECT
          cr.id,
          cr.status,
          cr.visibility_status,
          COALESCE(cr.request_code, p.request_id, CONCAT('CR-', cr.id::text)) AS request_code,
          COALESCE(NULLIF(p.full_name, ''), '') AS full_name,
          COALESCE(NULLIF(p.email, ''), '') AS email,
          COALESCE(NULLIF(p.phone_number, ''), '') AS phone_number,
          COALESCE(NULLIF(p.city, ''), '') AS city,
          COALESCE(NULLIF(p.service_schedule, ''), '') AS service_schedule,
          COALESCE(p.duration_value, cr.duration_value) AS duration_value,
          COALESCE(NULLIF(p.duration_unit, ''), cr.duration_unit, 'months') AS duration_unit,
          COALESCE(NULLIF(p.budget, 0), NULLIF(cr.budget_max, 0), NULLIF(cr.budget_min, 0), 0) AS budget,
          COALESCE(NULLIF(p.notes, ''), '') AS notes,
          p.preferred_nurse_id
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE cr.id = $1
         AND LOWER(COALESCE(p.agent_email, '')) = LOWER($2)
       LIMIT 1`,
      [requestId, agentEmail]
    );

    const job = result.rows[0];
    if (!job) {
      setFlash(req, "error", "Job not found.");
      return res.redirect("/agent/dashboard?tab=jobs");
    }
    if (["active", "completed", "cancelled"].includes(String(job.status || "").toLowerCase())) {
      setFlash(req, "error", "This job is locked and cannot be edited.");
      return res.redirect("/agent/dashboard?tab=jobs");
    }

    return await renderAgentJobForm(req, res, {
      title: "Edit Job",
      formMode: "edit",
      formAction: `/agent/jobs/${requestId}/update`,
      job: {
        id: job.id,
        fullName: job.full_name,
        email: job.email,
        phoneNumber: job.phone_number,
        city: job.city,
        serviceSchedule: job.service_schedule,
        durationValue: job.duration_value || "",
        durationUnit: job.duration_unit || "months",
        budget: Number.parseFloat(job.budget) || "",
        notes: job.notes,
        preferredNurseId: job.preferred_nurse_id || "",
        requestCode: job.request_code,
        status: job.status,
        visibilityStatus: job.visibility_status || "pending"
      }
    });
  } catch (error) {
    console.error("Agent job edit form error:", error);
    setFlash(req, "error", "Unable to load the job right now.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }
});

router.post("/agent/jobs/:id/update", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);
  const fullName = String(req.body.fullName || "").trim();
  const emailInput = String(req.body.email || "").trim();
  const phoneInput = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const serviceSchedule = String(req.body.serviceSchedule || "").trim();
  const durationUnit = String(req.body.durationUnit || "").trim();
  const durationValue = Number.parseInt(req.body.durationValue, 10);
  const budget = Number.parseFloat(req.body.budget);
  const notes = String(req.body.notes || "").trim();
  const preferredNurseId = Number.parseInt(req.body.preferredNurseId, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);

  if (Number.isNaN(requestId) || requestId <= 0) {
    setFlash(req, "error", "Invalid job.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }
  if (!fullName || !emailInput || !phoneInput || !city || !serviceSchedule) {
    setFlash(req, "error", "Please complete all required job fields.");
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }

  const emailValidation = validateEmail(emailInput);
  if (!emailValidation.valid) {
    setFlash(req, "error", emailValidation.error);
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }
  const phoneValidation = validateIndiaPhone(phoneInput);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }
  const scheduleValidation = validateServiceSchedule(serviceSchedule);
  if (!scheduleValidation.valid) {
    setFlash(req, "error", scheduleValidation.error);
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }
  if (!["days", "weeks", "months"].includes(durationUnit) || Number.isNaN(durationValue) || durationValue < 1) {
    setFlash(req, "error", "Please enter a valid duration.");
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }
  if (Number.isNaN(budget) || budget <= 0) {
    setFlash(req, "error", "Please enter a valid budget.");
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  }

  let client;
  try {
    const preferredNurse = await resolvePreferredAgentNurse(
      agentEmail,
      req.currentUser.id,
      Number.isNaN(preferredNurseId) ? null : preferredNurseId
    );
    if (!Number.isNaN(preferredNurseId) && preferredNurseId > 0 && !preferredNurse) {
      setFlash(req, "error", "Preferred nurse must be approved and part of your roster.");
      return res.redirect(`/agent/jobs/${requestId}/edit`);
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const currentRequestResult = await client.query(
      `SELECT cr.id, cr.patient_id, cr.status, cr.payment_status, cr.assigned_nurse_id
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE cr.id = $1
         AND LOWER(COALESCE(p.agent_email, '')) = LOWER($2)
       LIMIT 1
       FOR UPDATE`,
      [requestId, agentEmail]
    );
    const currentRequest = currentRequestResult.rows[0];
    if (!currentRequest) {
      throw new Error("Job not found.");
    }
    if (["active", "completed", "cancelled"].includes(String(currentRequest.status || "").toLowerCase())) {
      throw new Error("This job is locked and cannot be edited.");
    }

    const duration = `${durationValue} ${durationUnit}`;
    const serviceScheduleLabel = req.app.locals.serviceScheduleOptions?.find((item) => item.value === serviceSchedule)?.label || serviceSchedule;

    await client.query(
      `UPDATE patients
       SET full_name = $1,
           email = $2,
           phone_number = $3,
           city = $4,
           service_schedule = $5,
           duration = $6,
           duration_unit = $7,
           duration_value = $8,
           budget = $9,
           notes = $10,
           preferred_nurse_id = $11,
           preferred_nurse_name = $12
       WHERE id = $13`,
      [
        fullName,
        emailValidation.value,
        phoneValidation.value,
        city,
        serviceSchedule,
        duration,
        durationUnit,
        durationValue,
        budget,
        notes,
        preferredNurse ? preferredNurse.id : null,
        preferredNurse ? preferredNurse.full_name : "",
        currentRequest.patient_id
      ]
    );

    await client.query(
      `UPDATE care_requests
       SET care_type = $2,
           duration_value = $3,
           duration_unit = $4,
           budget_min = $5,
           budget_max = $6,
           visibility_status = 'pending'
       WHERE id = $1`,
      [
        requestId,
        notes || serviceScheduleLabel || "General care support required",
        durationValue,
        durationUnit,
        budget,
        budget
      ]
    );

    await insertCareRequestLifecycleLog(client, {
      requestId,
      eventType: "agent_details_updated",
      previousStatus: currentRequest.status,
      nextStatus: currentRequest.status,
      previousPaymentStatus: currentRequest.payment_status,
      nextPaymentStatus: currentRequest.payment_status,
      assignedNurseId: currentRequest.assigned_nurse_id,
      comment: "Care request details updated by agent.",
      changedByUserId: req.currentUser.id,
      changedByRole: req.currentUser.role,
      metadata: {
        source: "agent_dashboard_edit"
      }
    });

    await client.query("COMMIT");
    setFlash(req, "success", "Job updated successfully.");
    return res.redirect("/agent/dashboard?tab=jobs");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Agent job update rollback error:", rollbackError);
      }
    }
    console.error("Agent job update error:", error);
    setFlash(req, "error", error.message || "Unable to update the job right now.");
    return res.redirect(`/agent/jobs/${requestId}/edit`);
  } finally {
    if (client) client.release();
  }
});

router.post("/agent/jobs/:id/delete", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);

  if (Number.isNaN(requestId) || requestId <= 0) {
    setFlash(req, "error", "Invalid job.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT cr.id, cr.patient_id, cr.status
       FROM care_requests cr
       JOIN patients p ON p.id = cr.patient_id
       WHERE cr.id = $1
         AND LOWER(COALESCE(p.agent_email, '')) = LOWER($2)
       LIMIT 1
       FOR UPDATE`,
      [requestId, agentEmail]
    );
    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      throw new Error("Job not found.");
    }
    if (["active", "completed"].includes(String(requestRow.status || "").toLowerCase())) {
      throw new Error("Active or completed jobs cannot be deleted.");
    }

    await client.query("DELETE FROM care_requests WHERE id = $1", [requestId]);

    if (Number.isInteger(requestRow.patient_id)) {
      const patientUsageResult = await client.query(
        "SELECT 1 FROM care_requests WHERE patient_id = $1 LIMIT 1",
        [requestRow.patient_id]
      );
      if (!patientUsageResult.rows.length) {
        await client.query("DELETE FROM patients WHERE id = $1", [requestRow.patient_id]);
      }
    }

    await client.query("COMMIT");
    setFlash(req, "success", "Job removed successfully.");
    return res.redirect("/agent/dashboard?tab=jobs");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Agent job delete rollback error:", rollbackError);
      }
    }
    console.error("Agent job delete error:", error);
    setFlash(req, "error", error.message || "Unable to remove the job right now.");
    return res.redirect("/agent/dashboard?tab=jobs");
  } finally {
    if (client) client.release();
  }
});

router.get("/agent/patients/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  try {
    return await renderAgentJobForm(req, res, {
      title: "Add Job",
      formMode: "create",
      formAction: "/agent/jobs/new"
    });
  } catch (error) {
    console.error("Legacy add patient form load error:", error);
    setFlash(req, "error", "Unable to load the job form right now.");
    return res.redirect("/agent/dashboard?tab=jobs");
  }
});

router.post("/agent/patients/new", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  return res.redirect(307, "/agent/jobs/new");
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

router.post("/agent/nurses/:id/update", requireRole("agent"), requireApprovedAgent, async (req, res) => {
  const nurseId = Number.parseInt(req.params.id, 10);
  const agentEmail = normalizeEmail(req.currentUser.email);
  const fullName = String(req.body.fullName || "").trim();
  const phoneInput = String(req.body.phoneNumber || "").trim();
  const city = String(req.body.city || "").trim();
  const workCity = String(req.body.workCity || "").trim();
  const currentAddress = String(req.body.currentAddress || "").trim();
  const gender = String(req.body.gender || "").trim();
  const experienceYears = Number.parseInt(req.body.experienceYears, 10);
  const currentStatus = normalizeCurrentStatusInput(req.body.current_status || req.body.currentStatus || "");
  const aadharNumber = String(req.body.aadharNumber || "").replace(/\D/g, "").slice(0, 12);
  const skills = normalizeAgentDashboardList(req.body.skills);
  const availability = normalizeAgentDashboardList(req.body.availability || req.body["availability[]"]);

  if (Number.isNaN(nurseId) || nurseId <= 0) {
    setFlash(req, "error", "Invalid nurse.");
    return res.redirect("/agent/dashboard?tab=staff");
  }
  if (!fullName || !phoneInput || !city) {
    setFlash(req, "error", "Please complete the required nurse fields.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  }

  const phoneValidation = validateIndiaPhone(phoneInput);
  if (!phoneValidation.valid) {
    setFlash(req, "error", phoneValidation.error);
    return res.redirect(`/agent/nurses/${nurseId}`);
  }
  if (!["Male", "Female", "Other", "Not Specified"].includes(gender)) {
    setFlash(req, "error", "Please choose a valid gender.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  }
  if (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60) {
    setFlash(req, "error", "Experience should be between 0 and 60 years.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  }
  if (!currentStatus) {
    setFlash(req, "error", "Please choose a valid current status.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  }
  if (aadharNumber && aadharNumber.length !== 12) {
    setFlash(req, "error", "Aadhaar number must contain 12 digits.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const nurseResult = await client.query(
      `SELECT n.id, n.user_id
       FROM nurses n
       WHERE n.id = $3
         AND ${getAgentNurseOwnershipSql("n", "$1", "$2")}
       LIMIT 1
       FOR UPDATE`,
      [agentEmail, req.currentUser.id, nurseId]
    );
    const nurseRow = nurseResult.rows[0];
    if (!nurseRow) {
      throw new Error("You can only edit nurses in your own roster.");
    }

    const normalizedPhoneInput = normalizePhone(phoneValidation.value);
    const duplicatePhoneResult = await client.query(
      `SELECT 1
       FROM users
       WHERE phone_number = $1
         AND id <> $2
       LIMIT 1`,
      [normalizedPhoneInput, nurseRow.user_id]
    );
    if (duplicatePhoneResult.rowCount > 0) {
      throw new Error("That phone number is already linked to another account.");
    }

    await client.query(
      `UPDATE nurses
       SET full_name = $1,
           city = $2,
           work_city = $3,
           address = $4,
           gender = $5,
           experience_years = $6,
           current_status = $7,
           availability_label = $8,
           is_available = $9,
           availability = $10::text[],
           skills = $11::text[],
           aadhar_number = $12
       WHERE id = $13`,
      [
        fullName,
        city,
        workCity,
        currentAddress,
        gender,
        experienceYears,
        currentStatus,
        currentStatus,
        currentStatus !== "Not Available",
        availability,
        skills,
        aadharNumber || null,
        nurseId
      ]
    );

    if (Number.isInteger(nurseRow.user_id)) {
      await client.query(
        `UPDATE users
         SET phone_number = $1
         WHERE id = $2`,
        [normalizedPhoneInput, nurseRow.user_id]
      );
    }

    await client.query("COMMIT");
    setFlash(req, "success", "Nurse updated successfully.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Agent nurse update rollback error:", rollbackError);
      }
    }
    console.error("Agent nurse update error:", error);
    setFlash(req, "error", error.message || "Unable to update this nurse right now.");
    return res.redirect(`/agent/nurses/${nurseId}`);
  } finally {
    if (client) client.release();
  }
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
    canEdit: true,
    assetsUpdateAction: `/nurse/${nurse.id}/update-assets`,
    assetsRedirectTo: `/agent/nurses/${nurse.id}`,
    contactContext: buildNurseContactContext(nurse, req.currentUser, {
      agent: req.agentRecord,
      profileUrl: buildAgentScopedPublicNurseUrl(req.agentRecord, nurse)
    })
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


