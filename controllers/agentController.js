function createAgentController(dependencies) {
  const {
    normalizeEmail,
    readNormalizedStore,
    isStoreUserDeleted,
    nurseHasAgent,
    getApprovedAgents,
    setFlash,
    normalizePhone,
    readStore,
    nextId,
    now,
    createPatient,
    parseMoney,
    clearPatientFinancials,
    writeStore,
    COMMISSION_TYPES,
    calculateCommission,
    REFERRAL_DEFAULT_PERCENT,
    SKILLS_OPTIONS,
    AVAILABILITY_OPTIONS,
    createNurseUnderAgent,
    getNurseById,
    createAgentUnderAgent
  } = dependencies;

  function showAgentProfile(req, res) {
    return res.redirect("/agent/dashboard");
  }

  function showAgentDashboard(req, res) {
    const agentEmail = normalizeEmail(req.currentUser.email);
    const store = readNormalizedStore();

    const patients = store.patients
      .filter((item) => normalizeEmail(item.agentEmail) === agentEmail || (item.userId && item.userId === req.currentUser.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const nurses = store.nurses
      .filter((item) => !isStoreUserDeleted(store, item.userId) && nurseHasAgent(item, agentEmail))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const approvedNurses = nurses.filter((nurse) => nurse.status === "Approved" && nurse.isAvailable !== false);
    const nurseIndex = nurses.reduce((acc, nurse) => {
      acc[nurse.id] = nurse.fullName;
      return acc;
    }, {});
    const referralNurseIndex = store.nurses.filter((nurse) => !isStoreUserDeleted(store, nurse.userId)).reduce((acc, nurse) => {
      acc[nurse.id] = nurse.fullName;
      return acc;
    }, {});
    const transferTargets = getApprovedAgents(store).filter((agent) => normalizeEmail(agent.email) !== agentEmail);
    const createdAgents = store.agents.filter((agent) => normalizeEmail(agent.createdByAgentEmail) === agentEmail && !isStoreUserDeleted(store, agent.userId));
    const jobs = patients.map((patient) => ({
      id: patient.id,
      service_required: patient.careRequirement || patient.notes || "General care support",
      request_code: patient.requestId || `CR-${patient.id}`,
      address: patient.city || "-",
      status: patient.status || "New"
    }));
    const staff = nurses.map((nurse) => ({
      id: nurse.id,
      full_name: nurse.fullName || "Nurse",
      unique_id: nurse.uniqueId || "",
      city: nurse.city || "-",
      profile_slug: nurse.profileSlug || "",
      status: nurse.status || "Pending"
    }));

    return res.render("agent/dashboard", {
      title: "Agent Dashboard",
      activeTab: "jobs",
      user: req.currentUser,
      jobs,
      staff,
      patients,
      nurses,
      approvedNurses,
      nurseIndex,
      referralNurseIndex,
      transferTargets,
      createdAgents
    });
  }

  function showAgentDashboardRedirect(req, res) {
    return res.redirect("/agent");
  }

  function showNewPatientForm(req, res) {
    return res.render("agent/add-patient", { title: "Add Patient" });
  }

  async function createNewPatient(req, res) {
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
  }

  function updatePatientFinancials(req, res) {
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
  }

  function transferPatient(req, res) {
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
  }

  function showNewNurseForm(req, res) {
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
  }

  async function createNewNurse(req, res) {
    return createNurseUnderAgent(req, res, "/agent/nurses/new");
  }

  async function showNurseDetails(req, res) {
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
      role: req.session.user.role
    });
  }

  function showNewAgentForm(req, res) {
    return res.render("agent/add-agent", { title: "Add Agent" });
  }

  async function createNewAgent(req, res) {
    return createAgentUnderAgent(req, res, "/agent/agents/new");
  }

  return {
    showAgentProfile,
    showAgentDashboard,
    showAgentDashboardRedirect,
    showNewPatientForm,
    createNewPatient,
    updatePatientFinancials,
    transferPatient,
    showNewNurseForm,
    createNewNurse,
    showNurseDetails,
    showNewAgentForm,
    createNewAgent
  };
}

module.exports = createAgentController;
