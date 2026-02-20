const multer = require("multer");

const PROFILE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_UPLOAD_ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const PROFILE_UPLOAD_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpg",
  "image/jpeg",
  "image/png"
]);

const uploadQualificationFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const extension = require("path").extname(String(file.originalname || "")).toLowerCase();
    const isExtAllowed = PROFILE_UPLOAD_ALLOWED_EXTENSIONS.has(extension);
    const isMimeAllowed = PROFILE_UPLOAD_ALLOWED_MIME_TYPES.has(String(file.mimetype || "").toLowerCase());
    if (isExtAllowed && isMimeAllowed) {
      return cb(null, true);
    }
    return cb(new Error("Only PDF, JPG, and PNG files are allowed."));
  }
}).any();

module.exports = { uploadQualificationFiles };
