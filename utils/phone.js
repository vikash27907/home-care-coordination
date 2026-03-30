function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) {
    return "";
  }
  return digits.slice(-10);
}

module.exports = { normalizePhone };
