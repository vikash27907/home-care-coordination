function generateSlug(name, id) {
  const clean = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const base = clean || "profile";
  return `${base}-${String(id || "").toLowerCase()}`;
}

module.exports = generateSlug;
