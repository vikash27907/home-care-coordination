const createApp = require("./config/createApp");
const { startServer } = require("./config/bootstrap");
const { pool, PORT } = require("./services/runtimeContext");

const app = createApp();

module.exports = {
  app,
  pool
};

if (require.main === module) {
  startServer(app, PORT).catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
  });
}
