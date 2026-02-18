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
        email VARCHAR(255) UNIQUE NOT NULL,
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
        otp_expiry TIMESTAMP
      )
    `);

    // Ensure reset OTP columns exist on already-deployed databases
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS reset_otp_hash TEXT,
      ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMP
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
        certificate_url TEXT,
        aadhar_number VARCHAR(20),
        address TEXT,
        work_city TEXT,
        custom_skills TEXT[],
        education_level VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
