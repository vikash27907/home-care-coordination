require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 15000),
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error);
});

(async () => {
  let client;
  try {
    client = await pool.connect();
    console.log("PostgreSQL connected successfully");
  } catch (error) {
    console.error("PostgreSQL connection error:", error.message || error);
  } finally {
    if (client) {
      client.release();
    }
  }
})();

module.exports = { pool };
