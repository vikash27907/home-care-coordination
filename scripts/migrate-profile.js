/**
 * Production-safe profile migration.
 * Adds missing nurse profile columns without resetting any data.
 */

const { pool } = require("../src/db");

async function migrateNurseProfileColumns() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE nurses
      ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS experience_years INT,
      ADD COLUMN IF NOT EXISTS experience_months INT,
      ADD COLUMN IF NOT EXISTS availability_status VARCHAR(80),
      ADD COLUMN IF NOT EXISTS work_locations TEXT[],
      ADD COLUMN IF NOT EXISTS current_address TEXT,
      ADD COLUMN IF NOT EXISTS skills TEXT[],
      ADD COLUMN IF NOT EXISTS qualifications TEXT[],
      ADD COLUMN IF NOT EXISTS resume_url TEXT,
      ADD COLUMN IF NOT EXISTS highest_cert_url TEXT,
      ADD COLUMN IF NOT EXISTS tenth_cert_url TEXT
    `);

    await client.query(`
      UPDATE nurses
      SET experience_years = COALESCE(experience_years, 0),
          experience_months = COALESCE(experience_months, 0),
          availability_status = COALESCE(NULLIF(TRIM(availability_status), ''), 'Open for Work'),
          work_locations = COALESCE(work_locations, ARRAY[]::TEXT[]),
          skills = COALESCE(skills, ARRAY[]::TEXT[]),
          qualifications = COALESCE(qualifications, ARRAY[]::TEXT[])
    `);

    await client.query("COMMIT");
    console.log("Nurse profile migration complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Nurse profile migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrateNurseProfileColumns };
