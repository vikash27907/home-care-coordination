// Auth middleware functions
const { pool } = require("../src/db");

function requireRole(role) {
  return function (req, res, next) {
    if (!req.session.user || req.session.user.role !== role) {
      return res.redirect("/");
    }
    next();
  };
}

async function requireApprovedNurse(req, res, next) {
  try {
    // Get current user from session
    const user = req.session.user;
    if (!user || user.role !== "nurse") {
      return res.redirect("/");
    }

    // Get nurse record from database
    const { rows } = await pool.query(
      "SELECT * FROM nurses WHERE user_id = $1",
      [user.id]
    );

    const nurse = rows[0];
    if (!nurse) {
      return res.redirect("/nurse/profile");
    }

    // Check status - allow "Pending" and "Approved" but block "Rejected"
    if (nurse.status === "Rejected" || nurse.profile_status === "rejected") {
      return res.redirect("/nurse/profile");
    }

    // Set nurse record on request for use in routes
    req.nurseRecord = nurse;
    next();
  } catch (error) {
    console.error("requireApprovedNurse error:", error);
    return res.redirect("/nurse/profile");
  }
}

module.exports = { requireRole, requireApprovedNurse };
