const express = require("express");
const { configureApp } = require("../services/runtimeContext");
const createPublicRoutes = require("../routes/publicRoutes");
const createSessionRoutes = require("../routes/sessionRoutes");
const createAdminRoutes = require("../routes/adminRoutes");
const createAgentPortalRoutes = require("../routes/agentPortalRoutes");
const createNurseSupportRoutes = require("../routes/nurseSupportRoutes");
const nurseRoutes = require("../routes/nurse");

function createApp() {
  const app = express();

  configureApp(app);

  app.use(createPublicRoutes());
  app.use(createSessionRoutes());
  app.use(createAdminRoutes());
  app.use(createAgentPortalRoutes());
  app.use(createNurseSupportRoutes());
  app.use("/nurse", nurseRoutes);

  app.use((req, res) => {
    return res.status(404).render("shared/not-found", { title: "Page Not Found" });
  });

  app.use((error, req, res, next) => {
    console.error("Unhandled application error:", error);

    if (res.headersSent) {
      return next(error);
    }

    if (req.accepts("json") && !req.accepts("html")) {
      return res.status(500).json({ error: "Internal Server Error" });
    }

    return res.status(500).render("shared/error", { title: "Server Error" });
  });

  return app;
}

module.exports = createApp;
