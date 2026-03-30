const { initializeDatabase } = require("../src/schema");
const { initializeStore } = require("../src/store");
const { ensureAdmin } = require("../services/runtimeContext");

function validateDeploymentEnvironment() {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = String(process.env.SESSION_SECRET || "").trim();

  if (isProduction && (!sessionSecret || sessionSecret === "replace-this-session-secret")) {
    throw new Error("SESSION_SECRET must be set in production.");
  }

  if (isProduction && !String(process.env.DATABASE_URL || "").trim()) {
    console.warn("DATABASE_URL is not configured. Production data may not persist correctly.");
  }

  if (isProduction && !String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim()) {
    console.warn("APP_URL is not configured. Email links may fall back to localhost URLs.");
  }
}

async function bootstrapApp() {
  const { migrateNurseProfileColumns } = require("../scripts/migrate-profile");

  await migrateNurseProfileColumns();
  await initializeDatabase();
  await initializeStore();
  await ensureAdmin();
}

async function startServer(app, port) {
  validateDeploymentEnvironment();
  await bootstrapApp();

  return app.listen(port, () => {
    const isProduction = process.env.NODE_ENV === "production";
    const publicUrl = String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim();
    console.log(`Prisha Home Care listening on port ${port}`);

    if (publicUrl) {
      console.log(`Public URL: ${publicUrl}`);
      return;
    }

    if (!isProduction) {
      console.log("Local URL: http://localhost:" + port);
    }
  });
}

module.exports = {
  bootstrapApp,
  startServer,
  validateDeploymentEnvironment
};
