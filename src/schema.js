const { pool } = require('./db');

/**
 * Initialize database tables if they do not exist
 */
async function initializeDatabase() {
  try {
    // Create users table (central authentication table)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        phone_number VARCHAR(15),
        password_hash TEXT NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'Approved',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email_verified BOOLEAN DEFAULT false,
        verification_token TEXT,
        reset_token TEXT,
        reset_token_expiry TIMESTAMP,
        reset_otp_hash TEXT,
        reset_otp_expires TIMESTAMP,
        otp_code VARCHAR(6),
        otp_expiry TIMESTAMP,
        is_deleted BOOLEAN DEFAULT false,
        deleted_at TIMESTAMP NULL
      )
    `);

    // Ensure columns exist on already-deployed databases
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_otp_hash TEXT,
      ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'users_email_key'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT users_email_key;
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique
      ON users (LOWER(email))
      WHERE is_deleted = false
    `);

    // Create nurses table - stores only profile-specific data, auth via users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nurses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        city TEXT,
        gender VARCHAR(20) NOT NULL DEFAULT 'Not Specified',
        experience_years INTEGER DEFAULT 0,
        skills TEXT[],
        public_skills TEXT[],
        availability TEXT[],
        status VARCHAR(20) DEFAULT 'Pending',
        agent_email VARCHAR(255),
        agent_emails TEXT[],
        profile_image_url TEXT,
        profile_image_path TEXT NOT NULL DEFAULT '/images/default-male.png',
        public_bio TEXT,
        is_available BOOLEAN DEFAULT true,
        public_show_city BOOLEAN DEFAULT true,
        public_show_experience BOOLEAN DEFAULT true,
        referral_code VARCHAR(50) UNIQUE,
        referred_by_nurse_id INTEGER,
        referral_commission_percent DECIMAL(5,2) DEFAULT 5.00,
        resume_url TEXT,
        qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
        profile_status VARCHAR(50) DEFAULT 'draft',
        last_edit_request TIMESTAMP,
        certificate_url TEXT,
        aadhar_number VARCHAR(20),
        aadhar_image_url TEXT,
        current_status VARCHAR(50),
        address TEXT,
        work_city TEXT,
        custom_skills TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE nurses
      ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS aadhar_image_url TEXT,
      ADD COLUMN IF NOT EXISTS current_status VARCHAR(50)
    `);

    // Create agents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(15),
        company_name VARCHAR(255),
        region VARCHAR(100),
        status VARCHAR(20) DEFAULT 'Pending',
        created_by_agent_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create patients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        request_id VARCHAR(50) UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone_number VARCHAR(15),
        city TEXT,
        service_schedule VARCHAR(100),
        duration VARCHAR(50),
        duration_unit VARCHAR(20),
        duration_value INTEGER,
        budget NUMERIC NOT NULL DEFAULT 0,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'New',
        agent_email VARCHAR(255),
        nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        nurse_amount DECIMAL(12,2),
        commission_type VARCHAR(20) DEFAULT 'Percent',
        commission_value DECIMAL(12,2) DEFAULT 0,
        commission_amount DECIMAL(12,2) DEFAULT 0,
        nurse_net_amount DECIMAL(12,2),
        referrer_nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        referral_commission_percent DECIMAL(5,2) DEFAULT 0,
        referral_commission_amount DECIMAL(12,2) DEFAULT 0,
        preferred_nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        preferred_nurse_name VARCHAR(255),
        transfer_margin_type VARCHAR(20) DEFAULT 'Percent',
        transfer_margin_value DECIMAL(12,2) DEFAULT 0,
        transfer_margin_amount DECIMAL(12,2) DEFAULT 0,
        last_transferred_at TIMESTAMP,
        last_transferred_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create care requests table for marketplace demand
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_requests (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        care_type TEXT,
        duration_value INTEGER,
        duration_unit VARCHAR(20),
        budget_min NUMERIC DEFAULT 0,
        budget_max NUMERIC DEFAULT 0,
        marketplace_ready BOOLEAN DEFAULT FALSE,
        assigned_nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'open' CHECK (status IN ('open','assigned','payment_pending','active','completed','cancelled')),
        payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','refunded')),
        assignment_comment TEXT,
        nurse_notified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create care applications table for nurse supply matching
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_applications (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES care_requests(id) ON DELETE CASCADE,
        nurse_id INTEGER REFERENCES nurses(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (request_id, nurse_id)
      )
    `);

    // Audit trail for lifecycle and payment transitions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_request_lifecycle_logs (
        id BIGSERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES care_requests(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        previous_status TEXT,
        next_status TEXT,
        previous_payment_status TEXT,
        next_payment_status TEXT,
        assigned_nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        comment TEXT,
        changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        changed_by_role VARCHAR(20),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ratings for completed care requests
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_request_ratings (
        id BIGSERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES care_requests(id) ON DELETE CASCADE UNIQUE,
        nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        feedback TEXT,
        rated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rated_by_role VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Earnings ledger for completed care requests
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_request_earnings (
        id BIGSERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES care_requests(id) ON DELETE CASCADE UNIQUE,
        nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        referral_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payout_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (payout_status IN ('pending','approved','paid','on_hold','cancelled')),
        payout_reference TEXT,
        notes TEXT,
        generated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure care request assignment column exists on already-deployed databases
    await pool.query(`
      ALTER TABLE care_requests
      ADD COLUMN IF NOT EXISTS care_type TEXT,
      ADD COLUMN IF NOT EXISTS duration_value INTEGER,
      ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(20),
      ADD COLUMN IF NOT EXISTS budget_min NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS budget_max NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS assigned_nurse_id INTEGER REFERENCES nurses(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS marketplace_ready BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS assignment_comment TEXT,
      ADD COLUMN IF NOT EXISTS nurse_notified BOOLEAN DEFAULT FALSE
    `);

    // Drop legacy status check before backfilling old values to new lifecycle states.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests DROP CONSTRAINT care_requests_status_check;
        END IF;
      END $$;
    `);

    // Backfill legacy lifecycle values before applying strict checks.
    await pool.query(`
      UPDATE care_requests
      SET status = 'cancelled'
      WHERE status = 'closed'
    `);
    await pool.query(`
      UPDATE care_requests
      SET status = 'open'
      WHERE status IS NULL OR BTRIM(status) = ''
    `);
    await pool.query(`
      UPDATE care_requests
      SET payment_status = 'pending'
      WHERE payment_status IS NULL
         OR payment_status NOT IN ('pending', 'paid', 'refunded')
    `);
    await pool.query(`
      UPDATE care_requests
      SET payment_status = 'paid'
      WHERE status IN ('active', 'completed')
    `);
    await pool.query(`
      UPDATE care_requests
      SET status = 'open',
          payment_status = 'pending'
      WHERE assigned_nurse_id IS NULL
        AND status IN ('assigned', 'payment_pending', 'active')
    `);
    await pool.query(`
      UPDATE care_requests
      SET nurse_notified = FALSE
      WHERE status = 'open'
        AND nurse_notified = TRUE
    `);

    await pool.query(`
      ALTER TABLE care_requests
      ALTER COLUMN status SET DEFAULT 'open',
      ALTER COLUMN payment_status SET DEFAULT 'pending',
      ALTER COLUMN nurse_notified SET DEFAULT FALSE
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests DROP CONSTRAINT care_requests_status_check;
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_payment_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests DROP CONSTRAINT care_requests_payment_status_check;
        END IF;
      END $$;
    `);
    await pool.query(`
      ALTER TABLE care_requests
      ADD CONSTRAINT care_requests_status_check
      CHECK (status IN ('open','assigned','payment_pending','active','completed','cancelled'))
    `);
    await pool.query(`
      ALTER TABLE care_requests
      ADD CONSTRAINT care_requests_payment_status_check
      CHECK (payment_status IN ('pending','paid','refunded'))
    `);

    // Lifecycle guardrail trigger for direct SQL updates.
    await pool.query(`
      CREATE OR REPLACE FUNCTION validate_care_request_lifecycle_update()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
          IF OLD.status = 'open' AND NEW.status NOT IN ('assigned', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid care request transition: % -> %', OLD.status, NEW.status;
          ELSIF OLD.status = 'assigned' AND NEW.status NOT IN ('open', 'payment_pending', 'active', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid care request transition: % -> %', OLD.status, NEW.status;
          ELSIF OLD.status = 'payment_pending' AND NEW.status NOT IN ('assigned', 'active', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid care request transition: % -> %', OLD.status, NEW.status;
          ELSIF OLD.status = 'active' AND NEW.status NOT IN ('open', 'completed', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid care request transition: % -> %', OLD.status, NEW.status;
          ELSIF OLD.status = 'completed' THEN
            RAISE EXCEPTION 'Completed requests are immutable.';
          ELSIF OLD.status = 'cancelled' THEN
            RAISE EXCEPTION 'Cancelled requests are immutable.';
          END IF;
        END IF;

        IF NEW.status IN ('assigned', 'payment_pending', 'active', 'completed') AND NEW.assigned_nurse_id IS NULL THEN
          RAISE EXCEPTION 'Assigned nurse is required for status %', NEW.status;
        END IF;
        IF NEW.status = 'open' AND NEW.assigned_nurse_id IS NOT NULL THEN
          RAISE EXCEPTION 'Open requests cannot have an assigned nurse.';
        END IF;

        IF NEW.status = 'open' AND NEW.payment_status <> 'pending' THEN
          RAISE EXCEPTION 'Open requests must keep payment_status=pending.';
        END IF;
        IF NEW.status IN ('assigned', 'payment_pending') AND NEW.payment_status <> 'pending' THEN
          RAISE EXCEPTION 'Assigned/payment_pending requests must keep payment_status=pending.';
        END IF;
        IF NEW.status IN ('active', 'completed') AND NEW.payment_status <> 'paid' THEN
          RAISE EXCEPTION 'Active/completed requests must keep payment_status=paid.';
        END IF;
        IF NEW.status = 'open' AND NEW.nurse_notified = TRUE THEN
          RAISE EXCEPTION 'Open requests cannot keep nurse_notified=true.';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS trg_validate_care_request_lifecycle_update ON care_requests
    `);
    await pool.query(`
      CREATE TRIGGER trg_validate_care_request_lifecycle_update
      BEFORE UPDATE OF status, payment_status, assigned_nurse_id, nurse_notified
      ON care_requests
      FOR EACH ROW
      EXECUTE FUNCTION validate_care_request_lifecycle_update()
    `);

    // Backfill assignment pointer for existing rows where an accepted application already exists
    await pool.query(`
      UPDATE care_requests cr
      SET assigned_nurse_id = ca.nurse_id
      FROM (
        SELECT DISTINCT ON (request_id) request_id, nurse_id
        FROM care_applications
        WHERE status = 'accepted'
        ORDER BY request_id, applied_at DESC
      ) ca
      WHERE cr.id = ca.request_id
        AND cr.assigned_nurse_id IS NULL
    `);
    await pool.query(`
      UPDATE care_requests cr
      SET status = 'assigned'
      FROM (
        SELECT DISTINCT ON (request_id) request_id
        FROM care_applications
        WHERE status = 'accepted'
        ORDER BY request_id, applied_at DESC
      ) ca
      WHERE cr.id = ca.request_id
        AND cr.status = 'open'
    `);
    await pool.query(`
      WITH ranked AS (
        SELECT
          id,
          request_id,
          ROW_NUMBER() OVER (PARTITION BY request_id ORDER BY applied_at DESC, id DESC) AS rn
        FROM care_applications
        WHERE status = 'accepted'
      )
      UPDATE care_applications ca
      SET status = 'rejected'
      FROM ranked r
      WHERE ca.id = r.id
        AND r.rn > 1
    `);
    await pool.query(`
      INSERT INTO care_request_earnings (
        request_id,
        nurse_id,
        patient_id,
        gross_amount,
        platform_fee,
        referral_fee,
        net_amount,
        payout_status,
        notes
      )
      SELECT
        cr.id,
        cr.assigned_nurse_id,
        cr.patient_id,
        COALESCE(
          p.nurse_amount,
          NULLIF(cr.budget_max, 0),
          NULLIF(cr.budget_min, 0),
          p.budget,
          0
        )::numeric(12,2) AS gross_amount,
        COALESCE(p.commission_amount, 0)::numeric(12,2) AS platform_fee,
        COALESCE(p.referral_commission_amount, 0)::numeric(12,2) AS referral_fee,
        GREATEST(
          COALESCE(
            p.nurse_net_amount,
            COALESCE(
              p.nurse_amount,
              NULLIF(cr.budget_max, 0),
              NULLIF(cr.budget_min, 0),
              p.budget,
              0
            ) - COALESCE(p.commission_amount, 0) - COALESCE(p.referral_commission_amount, 0)
          ),
          0
        )::numeric(12,2) AS net_amount,
        'pending' AS payout_status,
        'Backfilled earnings snapshot during migration'
      FROM care_requests cr
      LEFT JOIN patients p ON p.id = cr.patient_id
      WHERE cr.status = 'completed'
        AND cr.assigned_nurse_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM care_request_earnings e
          WHERE e.request_id = cr.id
        )
    `);
    await pool.query(`
      INSERT INTO care_request_lifecycle_logs (
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
      SELECT
        cr.id,
        'bootstrap_snapshot',
        NULL,
        cr.status,
        NULL,
        cr.payment_status,
        cr.assigned_nurse_id,
        'Backfilled lifecycle snapshot during migration',
        NULL,
        'system',
        '{}'::jsonb
      FROM care_requests cr
      WHERE NOT EXISTS (
        SELECT 1
        FROM care_request_lifecycle_logs logs
        WHERE logs.request_id = cr.id
      )
    `);

    // Marketplace query performance indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_applications_request
      ON care_applications (request_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_applications_nurse
      ON care_applications (nurse_id)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_care_applications_one_accepted_per_request
      ON care_applications (request_id)
      WHERE status = 'accepted'
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_requests_marketplace_status
      ON care_requests (marketplace_ready, status, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_requests_assigned_status
      ON care_requests (assigned_nurse_id, status, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_requests_payment_status
      ON care_requests (payment_status, status, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_request_lifecycle_logs_request
      ON care_request_lifecycle_logs (request_id, created_at DESC, id DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_request_lifecycle_logs_event_type
      ON care_request_lifecycle_logs (event_type, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_request_ratings_nurse
      ON care_request_ratings (nurse_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_care_request_earnings_nurse
      ON care_request_earnings (nurse_id, payout_status, generated_at DESC)
    `);

    // Create concerns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS concerns (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        role VARCHAR(20),
        user_name VARCHAR(255),
        subject VARCHAR(255),
        message TEXT NOT NULL,
        category VARCHAR(50),
        status VARCHAR(20) DEFAULT 'Open',
        admin_reply TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create counters table for ID generation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS counters (
        key_name VARCHAR(50) PRIMARY KEY,
        current_value INTEGER DEFAULT 0
      )
    `);

    // Initialize counters if not exist
    await pool.query(`
      INSERT INTO counters (key_name, current_value) 
      VALUES 
        ('user', 1),
        ('nurse', 1),
        ('patient', 1),
        ('agent', 1),
        ('concern', 1)
      ON CONFLICT (key_name) DO NOTHING
    `);

    console.log("✅ Database tables initialized");
  } catch (error) {
    console.error("❌ Error initializing database tables:", error);
    throw error;
  }
}

module.exports = { initializeDatabase };
