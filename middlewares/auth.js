// Auth middleware functions

function requireRole(role) {
  return function (req, res, next) {
    if (!req.session.user || req.session.user.role !== role) {
      return res.redirect("/");
    }
    next();
  };
}

function requireApprovedNurse(req, res, next) {
  if (req.session.user?.profile_status !== "approved") {
    return res.redirect("/nurse/profile");
  }
  next();
}

module.exports = { requireRole, requireApprovedNurse };
