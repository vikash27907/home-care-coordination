function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

module.exports = { normalizePhone };
