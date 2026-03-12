const express = require("express");

function createAgentRoutes(options) {
  const { requireRole, requireApprovedAgent, agentController } = options;
  const router = express.Router();

  router.get("/profile", requireRole("agent"), agentController.showAgentProfile);

  router.get("/", requireRole("agent"), requireApprovedAgent, agentController.showAgentDashboard);
  router.get("/dashboard", requireRole("agent"), requireApprovedAgent, agentController.showAgentDashboardRedirect);

  router.get("/patients/new", requireRole("agent"), requireApprovedAgent, agentController.showNewPatientForm);
  router.post("/patients/new", requireRole("agent"), requireApprovedAgent, agentController.createNewPatient);
  router.post("/patients/:id/financials", requireRole("agent"), requireApprovedAgent, agentController.updatePatientFinancials);
  router.post("/patients/:id/transfer", requireRole("agent"), requireApprovedAgent, agentController.transferPatient);

  router.get("/nurses/new", requireRole("agent"), requireApprovedAgent, agentController.showNewNurseForm);
  router.post("/nurses/new", requireRole("agent"), requireApprovedAgent, agentController.createNewNurse);
  router.get("/nurses/:id", requireRole("agent"), requireApprovedAgent, agentController.showNurseDetails);

  router.get("/agents/new", requireRole("agent"), requireApprovedAgent, agentController.showNewAgentForm);
  router.post("/agents/new", requireRole("agent"), requireApprovedAgent, agentController.createNewAgent);

  return router;
}

module.exports = createAgentRoutes;
