const { pool } = require('./db');

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// In-memory cache for synchronous access
let storeCache = {
  counters: { user: 1, nurse: 1, patient: 1, agent: 1, concern: 1 },
  users: [],
  nurses: [],
  agents: [],
  patients: [],
  concerns: []
};

let isInitialized = false;

/**
 * Initialize store from database (called on server startup)
 */
async function initializeStore() {
  if (isInitialized) return;
  
  try {
    const [usersResult, nursesResult, agentsResult, patientsResult, concernsResult] = await Promise.all([
      pool.query('SELECT * FROM users ORDER BY id'),
      pool.query('SELECT * FROM nurses ORDER BY id'),
      pool.query('SELECT * FROM agents ORDER BY id'),
      pool.query('SELECT * FROM patients ORDER BY id'),
      pool.query('SELECT * FROM concerns ORDER BY id')
    ]);

    storeCache = {
      counters: { user: 1, nurse: 1, patient: 1, agent: 1, concern: 1 },
      users: usersResult.rows.map(transformUserFromDB),
      nurses: nursesResult.rows.map(transformNurseFromDB),
      agents: agentsResult.rows.map(transformAgentFromDB),
      patients: patientsResult.rows.map(transformPatientFromDB),
      concerns: concernsResult.rows.map(transformConcernFromDB)
    };

    // Get counter values
    const countersResult = await pool.query('SELECT key_name, current_value FROM counters');
    countersResult.rows.forEach(row => {
      const keyMap = { user: 'user', nurse: 'nurse', patient: 'patient', agent: 'agent', concern: 'concern' };
      const key = keyMap[row.key_name];
      if (key) {
        storeCache.counters[key] = row.current_value;
      }
    });

    isInitialized = true;
    console.log('✅ Store initialized from PostgreSQL');
  } catch (error) {
    console.error('Error initializing store from database:', error);
    // Use default empty store
    storeCache = {
      counters: { user: 1, nurse: 1, patient: 1, agent: 1, concern: 1 },
      users: [],
      nurses: [],
      agents: [],
      patients: [],
      concerns: []
    };
    isInitialized = true;
  }
}

/**
 * Get next ID - synchronous version using cache
 */
function nextId(store, key) {
  const current = store.counters[key] || 1;
  store.counters[key] = current + 1;
  
  // Async persist to database (don't wait)
  persistCounter(key, store.counters[key]).catch(err => {
    console.error(`Error persisting counter ${key}:`, err);
  });
  
  return current;
}

/**
 * Persist counter to database asynchronously
 */
async function persistCounter(key, value) {
  try {
    const keyMap = { user: 'user', nurse: 'nurse', patient: 'patient', agent: 'agent', concern: 'concern' };
    const dbKey = keyMap[key];
    if (dbKey) {
      await pool.query(
        'INSERT INTO counters (key_name, current_value) VALUES ($1, $2) ON CONFLICT (key_name) DO UPDATE SET current_value = $2',
        [dbKey, value]
      );
    }
  } catch (error) {
    console.error(`Error persisting counter ${key}:`, error);
  }
}

/**
 * Read store from cache (synchronous - for route compatibility)
 */
function readStore() {
  return storeCache;
}

/**
 * Write store to cache and persist to database
 * Note: This is a full rewrite - use updateStore for incremental updates
 */
function writeStore(store) {
  // Update cache immediately (synchronous)
  storeCache = JSON.parse(JSON.stringify(store));
  
  // Async persist to database (don't wait)
  persistStoreToDb(store).catch(err => {
    console.error('Error persisting store to database:', err);
  });
}

/**
 * Persist full store to database asynchronously
 */
async function persistStoreToDb(store) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data and rebuild
    await client.query('DELETE FROM concerns');
    await client.query('DELETE FROM patients');
    await client.query('DELETE FROM nurses');
    await client.query('DELETE FROM agents');
    await client.query('DELETE FROM users');

    // Insert users
    for (const user of store.users || []) {
      await client.query(`
        INSERT INTO users (id, full_name, email, phone_number, password_hash, role, status, created_at, email_verified, verification_token, reset_token, reset_token_expiry)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        user.id, user.fullName, user.email, user.phoneNumber, user.passwordHash, user.role, user.status, 
        user.createdAt, user.emailVerified || false, user.verificationToken || '', user.resetToken || '', user.resetTokenExpiry || null
      ]);
    }

    // Insert nurses
    for (const nurse of store.nurses || []) {
      await client.query(`
        INSERT INTO nurses (id, user_id, full_name, email, phone_number, city, experience_years, skills, public_skills, availability, status, 
          agent_email, agent_emails, profile_image_url, profile_image_path, public_bio, is_available, public_show_city, public_show_experience,
          referral_code, referred_by_nurse_id, referral_commission_percent, resume_url, certificate_url, aadhar_number, address, work_city, custom_skills, education_level, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
      `, [
        nurse.id, nurse.userId, nurse.fullName, nurse.email, nurse.phoneNumber, nurse.city, nurse.experienceYears,
        nurse.skills || [], nurse.publicSkills || [], nurse.availability || [], nurse.status,
        nurse.agentEmail || '', nurse.agentEmails || [], nurse.profileImageUrl || '', nurse.profileImagePath || '', 
        nurse.publicBio || '', nurse.isAvailable !== false, nurse.publicShowCity !== false, nurse.publicShowExperience !== false,
        nurse.referralCode || '', nurse.referredByNurseId, nurse.referralCommissionPercent || 5, 
        nurse.resumeUrl || '', nurse.certificateUrl || '', nurse.aadharNumber || '', nurse.address || '', 
        nurse.workCity || '', nurse.customSkills || [], nurse.educationLevel || '', nurse.createdAt
      ]);
    }

    // Insert agents
    for (const agent of store.agents || []) {
      await client.query(`
        INSERT INTO agents (id, user_id, full_name, email, phone_number, company_name, region, status, created_by_agent_email, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        agent.id, agent.userId, agent.fullName, agent.email, agent.phoneNumber, agent.companyName || '', 
        agent.region || '', agent.status, agent.createdByAgentEmail || '', agent.createdAt
      ]);
    }

    // Insert patients
    for (const patient of store.patients || []) {
      await client.query(`
        INSERT INTO patients (id, user_id, request_id, full_name, email, phone_number, city, service_schedule, duration, duration_unit, 
          duration_value, budget_type, budget_min, budget_max, notes, status, agent_email, nurse_id, nurse_amount, commission_type,
          commission_value, commission_amount, nurse_net_amount, referrer_nurse_id, referral_commission_percent, referral_commission_amount,
          preferred_nurse_id, preferred_nurse_name, transfer_margin_type, transfer_margin_value, transfer_margin_amount,
          last_transferred_at, last_transferred_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
      `, [
        patient.id, patient.userId, patient.requestId, patient.fullName, patient.email, patient.phoneNumber, patient.city,
        patient.serviceSchedule || '', patient.duration || '', patient.durationUnit || '', patient.durationValue,
        patient.budgetType || '', patient.budgetMin, patient.budgetMax, patient.notes || '', patient.status,
        patient.agentEmail || '', patient.nurseId, patient.nurseAmount, patient.commissionType || 'Percent',
        patient.commissionValue || 0, patient.commissionAmount || 0, patient.nurseNetAmount,
        patient.referrerNurseId, patient.referralCommissionPercent || 0, patient.referralCommissionAmount || 0,
        patient.preferredNurseId, patient.preferredNurseName || '', patient.transferMarginType || 'Percent',
        patient.transferMarginValue || 0, patient.transferMarginAmount || 0,
        patient.lastTransferredAt || null, patient.lastTransferredBy || '', patient.createdAt
      ]);
    }

    // Insert concerns
    for (const concern of store.concerns || []) {
      await client.query(`
        INSERT INTO concerns (id, user_id, role, user_name, subject, message, category, status, admin_reply, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        concern.id, concern.userId, concern.role, concern.userName, concern.subject || '', concern.message,
        concern.category || '', concern.status || 'Open', concern.adminReply || '', concern.createdAt, concern.updatedAt
      ]);
    }

    // Update counters
    for (const [key, value] of Object.entries(store.counters || {})) {
      const keyMap = { user: 'user', nurse: 'nurse', patient: 'patient', agent: 'agent', concern: 'concern' };
      const dbKey = keyMap[key];
      if (dbKey) {
        await client.query(
          'INSERT INTO counters (key_name, current_value) VALUES ($1, $2) ON CONFLICT (key_name) DO UPDATE SET current_value = $2',
          [dbKey, value]
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error writing store to database:', error);
  } finally {
    client.release();
  }
}

/**
 * Update store with a mutator function (synchronous)
 */
function updateStore(mutator) {
  const store = readStore();
  mutator(store);
  writeStore(store);
}

/**
 * Verify storage connection
 */
async function verifyStorageConnection() {
  try {
    await pool.query('SELECT 1');
    return { mode: 'postgres' };
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// ============================================================
// Transform functions - Database to JSON format
// ============================================================

function transformUserFromDB(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number || '',
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    emailVerified: row.email_verified || false,
    verificationToken: row.verification_token || '',
    resetToken: row.reset_token || '',
    resetTokenExpiry: row.reset_token_expiry ? new Date(row.reset_token_expiry).toISOString() : ''
  };
}

function transformNurseFromDB(row) {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number || '',
    city: row.city || '',
    experienceYears: row.experience_years || 0,
    skills: row.skills || [],
    publicSkills: row.public_skills || [],
    availability: row.availability || [],
    status: row.status || 'Pending',
    agentEmail: row.agent_email || '',
    agentEmails: row.agent_emails || [],
    profileImageUrl: row.profile_image_url || '',
    profileImagePath: row.profile_image_path || '',
    publicBio: row.public_bio || '',
    isAvailable: row.is_available !== false,
    publicShowCity: row.public_show_city !== false,
    publicShowExperience: row.public_show_experience !== false,
    referralCode: row.referral_code || '',
    referredByNurseId: row.referred_by_nurse_id,
    referralCommissionPercent: parseFloat(row.referral_commission_percent) || 5,
    resumeUrl: row.resume_url || '',
    certificateUrl: row.certificate_url || '',
    aadharNumber: row.aadhar_number || '',
    address: row.address || '',
    workCity: row.work_city || '',
    customSkills: row.custom_skills || [],
    educationLevel: row.education_level || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  };
}

function transformAgentFromDB(row) {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number || '',
    companyName: row.company_name || '',
    region: row.region || '',
    status: row.status || 'Pending',
    createdByAgentEmail: row.created_by_agent_email || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  };
}

function transformPatientFromDB(row) {
  return {
    id: row.id,
    userId: row.user_id,
    requestId: row.request_id || '',
    fullName: row.full_name,
    email: row.email || '',
    phoneNumber: row.phone_number || '',
    city: row.city || '',
    serviceSchedule: row.service_schedule || '',
    duration: row.duration || '',
    durationUnit: row.duration_unit || '',
    durationValue: row.duration_value,
    budgetType: row.budget_type || '',
    budgetMin: row.budget_min ? parseFloat(row.budget_min) : null,
    budgetMax: row.budget_max ? parseFloat(row.budget_max) : null,
    notes: row.notes || '',
    status: row.status || 'New',
    agentEmail: row.agent_email || '',
    nurseId: row.nurse_id,
    nurseAmount: row.nurse_amount ? parseFloat(row.nurse_amount) : null,
    commissionType: row.commission_type || 'Percent',
    commissionValue: parseFloat(row.commission_value) || 0,
    commissionAmount: parseFloat(row.commission_amount) || 0,
    nurseNetAmount: row.nurse_net_amount ? parseFloat(row.nurse_net_amount) : null,
    referrerNurseId: row.referrer_nurse_id,
    referralCommissionPercent: parseFloat(row.referral_commission_percent) || 0,
    referralCommissionAmount: parseFloat(row.referral_commission_amount) || 0,
    preferredNurseId: row.preferred_nurse_id,
    preferredNurseName: row.preferred_nurse_name || '',
    transferMarginType: row.transfer_margin_type || 'Percent',
    transferMarginValue: parseFloat(row.transfer_margin_value) || 0,
    transferMarginAmount: parseFloat(row.transfer_margin_amount) || 0,
    lastTransferredAt: row.last_transferred_at ? new Date(row.last_transferred_at).toISOString() : '',
    lastTransferredBy: row.last_transferred_by || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
  };
}

function transformConcernFromDB(row) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role || '',
    userName: row.user_name || '',
    subject: row.subject || '',
    message: row.message,
    category: row.category || '',
    status: row.status || 'Open',
    adminReply: row.admin_reply || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

// ============================================================
// Direct CRUD operations (for more efficient updates)
// ============================================================

// Users
async function getUsers() {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id');
    return result.rows.map(transformUserFromDB);
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

async function getUserById(id) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? transformUserFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting user by id:', error);
    return null;
  }
}

async function getUserByEmail(email) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0] ? transformUserFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

async function createUser(user) {
  try {
    const result = await pool.query(`
      INSERT INTO users (id, full_name, email, phone_number, password_hash, role, status, created_at, email_verified, verification_token, reset_token, reset_token_expiry)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      user.id, user.fullName, user.email, user.phoneNumber || '', user.passwordHash, user.role || 'user',
      user.status || 'Approved', user.createdAt || new Date().toISOString(),
      user.emailVerified || false, user.verificationToken || '', user.resetToken || '', user.resetTokenExpiry || null
    ]);
    return result.rows[0] ? transformUserFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

async function updateUser(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = {
        fullName: 'full_name', phoneNumber: 'phone_number', passwordHash: 'password_hash',
        role: 'role', status: 'status', emailVerified: 'email_verified',
        verificationToken: 'verification_token', resetToken: 'reset_token', resetTokenExpiry: 'reset_token_expiry'
      }[key];
      if (dbKey) {
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? transformUserFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error updating user:', error);
    return null;
  }
}

async function deleteUser(id) {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

// Nurses
async function getNurses() {
  try {
    const result = await pool.query('SELECT * FROM nurses ORDER BY id');
    return result.rows.map(transformNurseFromDB);
  } catch (error) {
    console.error('Error getting nurses:', error);
    return [];
  }
}

async function getNurseById(id) {
  try {
    const result = await pool.query('SELECT * FROM nurses WHERE id = $1', [id]);
    return result.rows[0] ? transformNurseFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting nurse by id:', error);
    return null;
  }
}

async function getNurseByEmail(email) {
  try {
    const result = await pool.query('SELECT * FROM nurses WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0] ? transformNurseFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting nurse by email:', error);
    return null;
  }
}

async function createNurse(nurse) {
  try {
    const result = await pool.query(`
      INSERT INTO nurses (id, user_id, full_name, email, phone_number, city, experience_years, skills, public_skills, availability, status,
        agent_email, agent_emails, profile_image_url, profile_image_path, public_bio, is_available, public_show_city, public_show_experience,
        referral_code, referred_by_nurse_id, referral_commission_percent, resume_url, certificate_url, aadhar_number, address, work_city, custom_skills, education_level, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
      RETURNING *
    `, [
      nurse.id, nurse.userId, nurse.fullName, nurse.email, nurse.phoneNumber, nurse.city, nurse.experienceYears,
      nurse.skills || [], nurse.publicSkills || [], nurse.availability || [], nurse.status || 'Pending',
      nurse.agentEmail || '', nurse.agentEmails || [], nurse.profileImageUrl || '', nurse.profileImagePath || '',
      nurse.publicBio || '', nurse.isAvailable !== false, nurse.publicShowCity !== false, nurse.publicShowExperience !== false,
      nurse.referralCode || '', nurse.referredByNurseId, nurse.referralCommissionPercent || 5,
      nurse.resumeUrl || '', nurse.certificateUrl || '', nurse.aadharNumber || '', nurse.address || '',
      nurse.workCity || '', nurse.customSkills || [], nurse.educationLevel || '', nurse.createdAt || new Date().toISOString()
    ]);
    return result.rows[0] ? transformNurseFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error creating nurse:', error);
    return null;
  }
}

async function updateNurse(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = {
        fullName: 'full_name', phoneNumber: 'phone_number', city: 'city', experienceYears: 'experience_years',
        skills: 'skills', publicSkills: 'public_skills', availability: 'availability', status: 'status',
        agentEmail: 'agent_email', agentEmails: 'agent_emails', profileImageUrl: 'profile_image_url',
        profileImagePath: 'profile_image_path', publicBio: 'public_bio', isAvailable: 'is_available',
        publicShowCity: 'public_show_city', publicShowExperience: 'public_show_experience',
        referralCode: 'referral_code', referredByNurseId: 'referred_by_nurse_id',
        referralCommissionPercent: 'referral_commission_percent', resumeUrl: 'resume_url',
        certificateUrl: 'certificate_url', aadharNumber: 'aadhar_number', address: 'address',
        workCity: 'work_city', customSkills: 'custom_skills', educationLevel: 'education_level'
      }[key];
      if (dbKey) {
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE nurses SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? transformNurseFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error updating nurse:', error);
    return null;
  }
}

async function deleteNurse(id) {
  try {
    await pool.query('DELETE FROM nurses WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting nurse:', error);
    return false;
  }
}

// Agents
async function getAgents() {
  try {
    const result = await pool.query('SELECT * FROM agents ORDER BY id');
    return result.rows.map(transformAgentFromDB);
  } catch (error) {
    console.error('Error getting agents:', error);
    return [];
  }
}

async function getAgentById(id) {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
    return result.rows[0] ? transformAgentFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting agent by id:', error);
    return null;
  }
}

async function getAgentByEmail(email) {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE LOWER(email) = LOWER($1)', [email]);
    return result.rows[0] ? transformAgentFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting agent by email:', error);
    return null;
  }
}

async function createAgent(agent) {
  try {
    const result = await pool.query(`
      INSERT INTO agents (id, user_id, full_name, email, phone_number, company_name, region, status, created_by_agent_email, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      agent.id, agent.userId, agent.fullName, agent.email, agent.phoneNumber, agent.companyName || '',
      agent.region || '', agent.status || 'Pending', agent.createdByAgentEmail || '', agent.createdAt || new Date().toISOString()
    ]);
    return result.rows[0] ? transformAgentFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error creating agent:', error);
    return null;
  }
}

async function updateAgent(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = {
        fullName: 'full_name', phoneNumber: 'phone_number', companyName: 'company_name',
        region: 'region', status: 'status', createdByAgentEmail: 'created_by_agent_email'
      }[key];
      if (dbKey) {
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE agents SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? transformAgentFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error updating agent:', error);
    return null;
  }
}

async function deleteAgent(id) {
  try {
    await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting agent:', error);
    return false;
  }
}

// Patients
async function getPatients() {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY id');
    return result.rows.map(transformPatientFromDB);
  } catch (error) {
    console.error('Error getting patients:', error);
    return [];
  }
}

async function getPatientById(id) {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);
    return result.rows[0] ? transformPatientFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting patient by id:', error);
    return null;
  }
}

async function getPatientByRequestId(requestId) {
  try {
    const result = await pool.query('SELECT * FROM patients WHERE request_id = $1', [requestId]);
    return result.rows[0] ? transformPatientFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting patient by request id:', error);
    return null;
  }
}

async function createPatient(patient) {
  try {
    const result = await pool.query(`
      INSERT INTO patients (id, user_id, request_id, full_name, email, phone_number, city, service_schedule, duration, duration_unit,
        duration_value, budget_type, budget_min, budget_max, notes, status, agent_email, nurse_id, nurse_amount, commission_type,
        commission_value, commission_amount, nurse_net_amount, referrer_nurse_id, referral_commission_percent, referral_commission_amount,
        preferred_nurse_id, preferred_nurse_name, transfer_margin_type, transfer_margin_value, transfer_margin_amount,
        last_transferred_at, last_transferred_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
      RETURNING *
    `, [
      patient.id, patient.userId, patient.requestId, patient.fullName, patient.email, patient.phoneNumber, patient.city,
      patient.serviceSchedule || '', patient.duration || '', patient.durationUnit || '', patient.durationValue,
      patient.budgetType || '', patient.budgetMin, patient.budgetMax, patient.notes || '', patient.status || 'New',
      patient.agentEmail || '', patient.nurseId, patient.nurseAmount, patient.commissionType || 'Percent',
      patient.commissionValue || 0, patient.commissionAmount || 0, patient.nurseNetAmount,
      patient.referrerNurseId, patient.referralCommissionPercent || 0, patient.referralCommissionAmount || 0,
      patient.preferredNurseId, patient.preferredNurseName || '', patient.transferMarginType || 'Percent',
      patient.transferMarginValue || 0, patient.transferMarginAmount || 0,
      patient.lastTransferredAt || null, patient.lastTransferredBy || '', patient.createdAt || new Date().toISOString()
    ]);
    return result.rows[0] ? transformPatientFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error creating patient:', error);
    return null;
  }
}

async function updatePatient(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = {
        requestId: 'request_id', fullName: 'full_name', email: 'email', phoneNumber: 'phone_number',
        city: 'city', serviceSchedule: 'service_schedule', duration: 'duration', durationUnit: 'duration_unit',
        durationValue: 'duration_value', budgetType: 'budget_type', budgetMin: 'budget_min', budgetMax: 'budget_max',
        notes: 'notes', status: 'status', agentEmail: 'agent_email', nurseId: 'nurse_id',
        nurseAmount: 'nurse_amount', commissionType: 'commission_type', commissionValue: 'commission_value',
        commissionAmount: 'commission_amount', nurseNetAmount: 'nurse_net_amount',
        referrerNurseId: 'referrer_nurse_id', referralCommissionPercent: 'referral_commission_percent',
        referralCommissionAmount: 'referral_commission_amount', preferredNurseId: 'preferred_nurse_id',
        preferredNurseName: 'preferred_nurse_name', transferMarginType: 'transfer_margin_type',
        transferMarginValue: 'transfer_margin_value', transferMarginAmount: 'transfer_margin_amount',
        lastTransferredAt: 'last_transferred_at', lastTransferredBy: 'last_transferred_by'
      }[key];
      if (dbKey) {
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE patients SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? transformPatientFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error updating patient:', error);
    return null;
  }
}

async function deletePatient(id) {
  try {
    await pool.query('DELETE FROM patients WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting patient:', error);
    return false;
  }
}

// Concerns
async function getConcerns() {
  try {
    const result = await pool.query('SELECT * FROM concerns ORDER BY id');
    return result.rows.map(transformConcernFromDB);
  } catch (error) {
    console.error('Error getting concerns:', error);
    return [];
  }
}

async function getConcernById(id) {
  try {
    const result = await pool.query('SELECT * FROM concerns WHERE id = $1', [id]);
    return result.rows[0] ? transformConcernFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error getting concern by id:', error);
    return null;
  }
}

async function createConcern(concern) {
  try {
    const result = await pool.query(`
      INSERT INTO concerns (id, user_id, role, user_name, subject, message, category, status, admin_reply, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      concern.id, concern.userId, concern.role, concern.userName, concern.subject || '', concern.message,
      concern.category || '', concern.status || 'Open', concern.adminReply || '',
      concern.createdAt || new Date().toISOString(), concern.updatedAt || new Date().toISOString()
    ]);
    return result.rows[0] ? transformConcernFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error creating concern:', error);
    return null;
  }
}

async function updateConcern(id, updates) {
  try {
    const fields = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = {
        userId: 'user_id', role: 'role', userName: 'user_name', subject: 'subject', message: 'message',
        category: 'category', status: 'status', adminReply: 'admin_reply', updatedAt: 'updated_at'
      }[key];
      if (dbKey) {
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await pool.query(
      `UPDATE concerns SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] ? transformConcernFromDB(result.rows[0]) : null;
  } catch (error) {
    console.error('Error updating concern:', error);
    return null;
  }
}

async function deleteConcern(id) {
  try {
    await pool.query('DELETE FROM concerns WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting concern:', error);
    return false;
  }
}

module.exports = {
  // Legacy API for backward compatibility
  initializeStore,
  readStore,
  writeStore,
  nextId,
  updateStore,
  verifyStorageConnection,
  USE_DATABASE: true,
  IS_PRODUCTION,
  // Direct CRUD operations
  getUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  getNurses,
  getNurseById,
  getNurseByEmail,
  createNurse,
  updateNurse,
  deleteNurse,
  getAgents,
  getAgentById,
  getAgentByEmail,
  createAgent,
  updateAgent,
  deleteAgent,
  getPatients,
  getPatientById,
  getPatientByRequestId,
  createPatient,
  updatePatient,
  deletePatient,
  getConcerns,
  getConcernById,
  createConcern,
  updateConcern,
  deleteConcern
};
