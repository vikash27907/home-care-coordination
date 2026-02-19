/**
 * Production-safe profile migration.
 * Adds missing nurse profile columns and safely upgrades qualifications to JSONB.
 */

const { pool } = require("../src/db");

async function migrateNurseProfileColumns() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Add missing columns (WITHOUT qualifications)
    await client.query(`
      ALTER TABLE nurses
      ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS experience_years INT,
      ADD COLUMN IF NOT EXISTS experience_months INT,
      ADD COLUMN IF NOT EXISTS availability_status VARCHAR(80),
      ADD COLUMN IF NOT EXISTS work_locations TEXT[],
      ADD COLUMN IF NOT EXISTS current_address TEXT,
      ADD COLUMN IF NOT EXISTS skills TEXT[],
      ADD COLUMN IF NOT EXISTS resume_url TEXT,
      ADD COLUMN IF NOT EXISTS highest_cert_url TEXT,
      ADD COLUMN IF NOT EXISTS tenth_cert_url TEXT,
      ADD COLUMN IF NOT EXISTS aadhaar_card_url TEXT,
      ADD COLUMN IF NOT EXISTS additional_certificates JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS expected_salary INT,
      ADD COLUMN IF NOT EXISTS preferred_shift VARCHAR(100),
      ADD COLUMN IF NOT EXISTS preferred_duration VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pan_india BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS profile_status VARCHAR(50) DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS profile_completion INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS admin_visible BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
      ADD COLUMN IF NOT EXISTS last_profile_update TIMESTAMP,
      ADD COLUMN IF NOT EXISTS last_edit_request TIMESTAMP
    `);

    // 2️⃣ Check current datatype of qualifications
    const { rows } = await client.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'nurses'
      AND column_name = 'qualifications';
    `);

    const dataType = rows[0]?.data_type;

    if (dataType === 'ARRAY') {
      console.log("🔄 Upgrading qualifications from TEXT[] to JSONB...");

      await client.query(`
        ALTER TABLE nurses
        ALTER COLUMN qualifications TYPE JSONB
        USING (
          (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'name', q,
                  'certificate_url', null,
                  'verified', false
                )
              ),
              '[]'::jsonb
            )
            FROM unnest(qualifications) AS q
          )
        );
      `);
    } else if (!dataType) {
      // Column doesn't exist at all
      await client.query(`
        ALTER TABLE nurses
        ADD COLUMN qualifications JSONB DEFAULT '[]'::jsonb;
      `);
    }

    // 3️⃣ Ensure JSONB default
    await client.query(`
      ALTER TABLE nurses
      ALTER COLUMN qualifications SET DEFAULT '[]'::jsonb;
    `);

    // 4️⃣ Safe defaults for older data
    await client.query(`
      UPDATE nurses
      SET experience_years = COALESCE(experience_years, 0),
          experience_months = COALESCE(experience_months, 0),
          availability_status = COALESCE(NULLIF(TRIM(availability_status), ''), 'Open for Work'),
          work_locations = COALESCE(work_locations, ARRAY[]::TEXT[]),
          skills = COALESCE(skills, ARRAY[]::TEXT[])
    `);

    await client.query("COMMIT");

    console.log("✅ Nurse profile migration complete. Qualifications now JSONB.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Nurse profile migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrateNurseProfileColumns };
