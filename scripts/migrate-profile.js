const { pool } = require('../src/db');

async function migrateNurseProfileColumns() {
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      ALTER TABLE nurses
      ADD COLUMN IF NOT EXISTS qualifications JSONB DEFAULT '[]'::jsonb;
    `);
    console.log("Migration complete: qualifications column ensured.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    if (client) {
      client.release();
    }
  }
}

module.exports = { migrateNurseProfileColumns };
