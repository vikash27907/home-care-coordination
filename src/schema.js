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
        email VARCHAR(255),
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
      ALTER TABLE users
      ALTER COLUMN email DROP NOT NULL
    `);

    await pool.query(`
      UPDATE users
      SET email = NULL
      WHERE NULLIF(BTRIM(COALESCE(email, '')), '') IS NULL
    `);

    await pool.query(`
      UPDATE users
      SET phone_number = NULL
      WHERE NULLIF(BTRIM(COALESCE(phone_number, '')), '') IS NULL
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

    await pool.query(`DROP INDEX IF EXISTS users_email_active_unique`);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users (LOWER(email))
      WHERE email IS NOT NULL
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
      ON users (phone_number)
      WHERE phone_number IS NOT NULL
    `);

    // Create nurses table - stores only profile-specific data, auth via users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nurses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        city TEXT,
        gender VARCHAR(20) NOT NULL DEFAULT 'Not Specified',
        religion TEXT,
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
        aadhar_front_url TEXT,
        aadhar_back_url TEXT,
        current_status VARCHAR(50),
        address TEXT,
        work_city TEXT,
        height_text TEXT,
        weight_kg INTEGER,
        languages TEXT[] DEFAULT ARRAY[]::TEXT[],
        duty_type TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        availability_label TEXT DEFAULT 'Available',
        medical_fit_url TEXT,
        custom_skills TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      ALTER TABLE nurses
      ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(20),
      ADD COLUMN IF NOT EXISTS aadhar_image_url TEXT,
      ADD COLUMN IF NOT EXISTS aadhar_front_url TEXT,
      ADD COLUMN IF NOT EXISTS aadhar_back_url TEXT,
      ADD COLUMN IF NOT EXISTS religion TEXT,
      ADD COLUMN IF NOT EXISTS current_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS height_text TEXT,
      ADD COLUMN IF NOT EXISTS weight_kg INTEGER,
      ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT ARRAY[]::TEXT[],
      ADD COLUMN IF NOT EXISTS duty_type TEXT,
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS availability_label TEXT DEFAULT 'Available',
      ADD COLUMN IF NOT EXISTS medical_fit_url TEXT,
      ADD COLUMN IF NOT EXISTS unique_id VARCHAR(20),
      ADD COLUMN IF NOT EXISTS profile_slug TEXT,
      ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS claimed_by_nurse BOOLEAN DEFAULT FALSE
    `);

    await pool.query(`
      ALTER TABLE nurses
      ALTER COLUMN public_profile_enabled SET DEFAULT false
    `);

    await pool.query(`
      UPDATE nurses
      SET public_profile_enabled = FALSE
      WHERE public_profile_enabled IS NULL
    `);

    await pool.query(`
      UPDATE nurses
      SET aadhar_front_url = aadhar_image_url
      WHERE NULLIF(BTRIM(COALESCE(aadhar_front_url, '')), '') IS NULL
        AND NULLIF(BTRIM(COALESCE(aadhar_image_url, '')), '') IS NOT NULL
    `);

    await pool.query(`
      UPDATE nurses
      SET languages = ARRAY[]::TEXT[]
      WHERE languages IS NULL
    `);

    await pool.query(`
      UPDATE nurses
      SET is_verified = CASE
        WHEN LOWER(COALESCE(status, 'pending')) = 'approved' THEN TRUE
        ELSE COALESCE(is_verified, FALSE)
      END
      WHERE is_verified IS NULL
         OR LOWER(COALESCE(status, 'pending')) = 'approved'
    `);

    await pool.query(`
      UPDATE nurses
      SET availability_label = CASE
        WHEN NULLIF(BTRIM(COALESCE(current_status, '')), '') IS NOT NULL THEN BTRIM(current_status)
        WHEN COALESCE(is_available, TRUE) = TRUE THEN 'Available'
        ELSE 'Unavailable'
      END
      WHERE NULLIF(BTRIM(COALESCE(availability_label, '')), '') IS NULL
    `);

    await pool.query(`
      UPDATE nurses
      SET profile_status = 'approved'
      WHERE LOWER(COALESCE(status, 'pending')) = 'approved'
        AND LOWER(COALESCE(profile_status, '')) <> 'approved'
    `);

    await pool.query(`
      UPDATE nurses
      SET unique_id = CONCAT('PHCN-', LPAD(id::text, 3, '0'))
      WHERE NULLIF(BTRIM(COALESCE(unique_id, '')), '') IS NULL
    `);

    await pool.query(`
      UPDATE nurses
      SET profile_slug = CONCAT(
        COALESCE(
          NULLIF(
            BTRIM(
              REGEXP_REPLACE(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(LOWER(COALESCE(full_name, '')), '\\s+', '-', 'g'),
                  '[^a-z0-9-]', '', 'g'
                ),
                '-+', '-', 'g'
              ),
              '-'
            ),
            ''
          ),
          'profile'
        ),
        '-',
        LOWER(unique_id)
      )
      WHERE NULLIF(BTRIM(COALESCE(profile_slug, '')), '') IS NULL
    `);

    await pool.query(`
      UPDATE users u
      SET status = 'Approved'
      FROM nurses n
      WHERE n.user_id = u.id
        AND (
          NULLIF(BTRIM(COALESCE(n.agent_email, '')), '') IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(n.agent_emails, ARRAY[]::TEXT[])) AS assigned(agent_email)
            WHERE NULLIF(BTRIM(COALESCE(assigned.agent_email, '')), '') IS NOT NULL
          )
        )
        AND LOWER(COALESCE(u.status, 'pending')) <> 'approved'
    `);

    await pool.query(`
      UPDATE nurses
      SET status = 'Approved',
          profile_status = 'approved',
          public_profile_enabled = TRUE,
          is_verified = TRUE
      WHERE (
          NULLIF(BTRIM(COALESCE(agent_email, '')), '') IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(agent_emails, ARRAY[]::TEXT[])) AS assigned(agent_email)
            WHERE NULLIF(BTRIM(COALESCE(assigned.agent_email, '')), '') IS NOT NULL
          )
        )
        AND (
          LOWER(COALESCE(status, 'pending')) <> 'approved'
          OR LOWER(COALESCE(profile_status, '')) <> 'approved'
          OR public_profile_enabled IS DISTINCT FROM TRUE
          OR COALESCE(is_verified, FALSE) = FALSE
        )
    `);

    await pool.query(`
      UPDATE nurses n
      SET claimed_by_nurse = TRUE
      FROM users u
      WHERE u.id = n.user_id
        AND COALESCE(u.email_verified, FALSE) = TRUE
        AND COALESCE(n.claimed_by_nurse, FALSE) = FALSE
        AND NULLIF(BTRIM(COALESCE(n.agent_email, '')), '') IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(n.agent_emails, ARRAY[]::TEXT[])) AS assigned(agent_email)
          WHERE NULLIF(BTRIM(COALESCE(assigned.agent_email, '')), '') IS NOT NULL
        )
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'nurses'
            AND column_name = 'admin_visible'
        ) THEN
          EXECUTE '
            UPDATE nurses
            SET public_profile_enabled = admin_visible
            WHERE public_profile_enabled IS NULL
              AND admin_visible IS NOT NULL
          ';
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS nurses_unique_id_unique
      ON nurses (unique_id)
      WHERE unique_id IS NOT NULL
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS nurses_profile_slug_unique
      ON nurses (profile_slug)
      WHERE profile_slug IS NOT NULL
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
        working_region VARCHAR(100),
        profile_image_url TEXT,
        aadhaar_doc_url TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_by_agent_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'agents'
            AND column_name = 'region'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'agents'
            AND column_name = 'working_region'
        ) THEN
          ALTER TABLE agents RENAME COLUMN region TO working_region;
        END IF;
      END $$;
    `);

    await pool.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS working_region VARCHAR(100),
      ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
      ADD COLUMN IF NOT EXISTS aadhaar_doc_url TEXT,
      ADD COLUMN IF NOT EXISTS unique_id VARCHAR(20),
      ADD COLUMN IF NOT EXISTS profile_slug TEXT
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS agents_unique_id_unique
      ON agents (unique_id)
      WHERE unique_id IS NOT NULL
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS agents_profile_slug_unique
      ON agents (profile_slug)
      WHERE profile_slug IS NOT NULL
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_nurse_roster (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nurse_id INTEGER REFERENCES nurses(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, nurse_id)
      )
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'agent_nurse_roster_agent_id_fkey'
            AND conrelid = 'agent_nurse_roster'::regclass
        ) THEN
          ALTER TABLE agent_nurse_roster
          ADD CONSTRAINT agent_nurse_roster_agent_id_fkey
          FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'agent_nurse_roster_nurse_id_fkey'
            AND conrelid = 'agent_nurse_roster'::regclass
        ) THEN
          ALTER TABLE agent_nurse_roster
          ADD CONSTRAINT agent_nurse_roster_nurse_id_fkey
          FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await pool.query(`
      INSERT INTO agent_nurse_roster (agent_id, nurse_id)
      SELECT DISTINCT
        u.id AS agent_id,
        n.id AS nurse_id
      FROM nurses n
      JOIN users u
        ON u.role = 'agent'
       AND COALESCE(u.is_deleted, FALSE) = FALSE
       AND LOWER(u.email) = LOWER(COALESCE(n.agent_email, ''))
      WHERE NULLIF(BTRIM(COALESCE(n.agent_email, '')), '') IS NOT NULL
      ON CONFLICT (agent_id, nurse_id) DO NOTHING
    `);

    await pool.query(`
      INSERT INTO agent_nurse_roster (agent_id, nurse_id)
      SELECT DISTINCT
        u.id AS agent_id,
        n.id AS nurse_id
      FROM nurses n
      CROSS JOIN LATERAL unnest(COALESCE(n.agent_emails, ARRAY[]::TEXT[])) AS assigned(agent_email)
      JOIN users u
        ON u.role = 'agent'
       AND COALESCE(u.is_deleted, FALSE) = FALSE
       AND LOWER(u.email) = LOWER(assigned.agent_email)
      WHERE NULLIF(BTRIM(COALESCE(assigned.agent_email, '')), '') IS NOT NULL
      ON CONFLICT (agent_id, nurse_id) DO NOTHING
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_nurse_roster_agent
      ON agent_nurse_roster (agent_id, added_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_nurse_roster_nurse
      ON agent_nurse_roster (nurse_id, added_at DESC)
    `);

    await pool.query(`
      ALTER TABLE agents
      ALTER COLUMN status SET DEFAULT 'pending'
    `);

    await pool.query(`
      UPDATE agents
      SET status = LOWER(COALESCE(status, 'pending'))
    `);

    await pool.query(`
      UPDATE agents
      SET status = 'pending'
      WHERE status NOT IN ('pending', 'approved', 'rejected', 'deleted')
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'status_check'
            AND conrelid = 'agents'::regclass
        ) THEN
          ALTER TABLE agents DROP CONSTRAINT status_check;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'agents_status_check'
            AND conrelid = 'agents'::regclass
        ) THEN
          ALTER TABLE agents DROP CONSTRAINT agents_status_check;
        END IF;

        ALTER TABLE agents
        ADD CONSTRAINT agents_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'deleted'));
      END $$;
    `);

    await pool.query(`
      UPDATE users
      SET status = LOWER(COALESCE(status, 'pending'))
      WHERE role = 'agent'
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
        budget_type VARCHAR(20),
        budget_min NUMERIC DEFAULT 0,
        budget_max NUMERIC DEFAULT 0,
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

    await pool.query(`
      ALTER TABLE patients
      ADD COLUMN IF NOT EXISTS budget_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS budget_min NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS budget_max NUMERIC DEFAULT 0
    `);

    await pool.query(`
      UPDATE patients
      SET budget_min = COALESCE(budget_min, budget, 0),
          budget_max = COALESCE(budget_max, budget, 0)
      WHERE budget_min IS NULL
         OR budget_max IS NULL
    `);

    // Create care requests table for marketplace demand
    await pool.query(`
      CREATE TABLE IF NOT EXISTS care_requests (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
        request_code VARCHAR(50),
        edit_token VARCHAR(6),
        visibility_status TEXT DEFAULT 'pending',
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        related_request_id INTEGER REFERENCES care_requests(id) ON DELETE CASCADE,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      ADD COLUMN IF NOT EXISTS request_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS edit_token VARCHAR(6),
      ADD COLUMN IF NOT EXISTS visibility_status TEXT DEFAULT 'pending',
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
      SET visibility_status = 'pending'
      WHERE visibility_status IS NULL
         OR visibility_status NOT IN ('pending', 'approved', 'rejected')
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
      UPDATE care_requests cr
      SET request_code = p.request_id
      FROM patients p
      WHERE cr.patient_id = p.id
        AND cr.request_code IS NULL
        AND NULLIF(p.request_id, '') IS NOT NULL
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
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_visibility_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests DROP CONSTRAINT care_requests_visibility_status_check;
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests
          ADD CONSTRAINT care_requests_status_check
          CHECK (status IN ('open','assigned','payment_pending','active','completed','cancelled'));
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_payment_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests
          ADD CONSTRAINT care_requests_payment_status_check
          CHECK (payment_status IN ('pending','paid','refunded'));
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'care_requests_visibility_status_check'
            AND conrelid = 'care_requests'::regclass
        ) THEN
          ALTER TABLE care_requests
          ADD CONSTRAINT care_requests_visibility_status_check
          CHECK (visibility_status IN ('pending','approved','rejected'));
        END IF;
      END $$;
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
      WITH duplicate_applications AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY request_id, nurse_id
            ORDER BY applied_at DESC, id DESC
          ) AS rn
        FROM care_applications
      )
      DELETE FROM care_applications ca
      USING duplicate_applications da
      WHERE ca.id = da.id
        AND da.rn > 1
    `);
    await pool.query(`
      DO $$
      DECLARE
        request_attnum SMALLINT;
        nurse_attnum SMALLINT;
      BEGIN
        SELECT attnum INTO request_attnum
        FROM pg_attribute
        WHERE attrelid = 'care_applications'::regclass
          AND attname = 'request_id'
          AND NOT attisdropped;

        SELECT attnum INTO nurse_attnum
        FROM pg_attribute
        WHERE attrelid = 'care_applications'::regclass
          AND attname = 'nurse_id'
          AND NOT attisdropped;

        IF request_attnum IS NOT NULL
          AND nurse_attnum IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'care_applications'::regclass
              AND contype = 'u'
              AND conkey = ARRAY[request_attnum, nurse_attnum]
          ) THEN
          ALTER TABLE care_applications
          ADD CONSTRAINT unique_nurse_request UNIQUE (request_id, nurse_id);
        END IF;
      END $$;
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_care_requests_request_code_unique
      ON care_requests (request_code)
      WHERE request_code IS NOT NULL
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_care_requests_edit_token_unique
      ON care_requests (edit_token)
      WHERE edit_token IS NOT NULL
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
      CREATE INDEX IF NOT EXISTS idx_care_requests_visibility_status
      ON care_requests (visibility_status, status, created_at DESC)
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
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
      ON notifications(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_unread
      ON notifications(user_id, is_read)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_related_request
      ON notifications(related_request_id)
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

    await pool.query(`
      WITH nurse_seed AS (
        SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(unique_id, '^PHCN-?', '') AS INTEGER)), 0) AS current_value
        FROM nurses
        WHERE unique_id ~ '^PHCN-?[0-9]+$'
      ),
      agent_seed AS (
        SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(unique_id, '^PHCA-?', '') AS INTEGER)), 0) AS current_value
        FROM agents
        WHERE unique_id ~ '^PHCA-?[0-9]+$'
      )
      INSERT INTO counters (key_name, current_value)
      VALUES
        ('nurse_public_id', (SELECT current_value FROM nurse_seed)),
        ('agent_public_id', (SELECT current_value FROM agent_seed))
      ON CONFLICT (key_name) DO UPDATE
      SET current_value = GREATEST(counters.current_value, EXCLUDED.current_value)
    `);
    console.log("✅ Database tables initialized");
  } catch (error) {
    console.error("❌ Error initializing database tables:", error);
    throw error;
  }
}

module.exports = { initializeDatabase };
