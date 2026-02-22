const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { pool } = require("../src/db");
const { requireRole, requireApprovedNurse } = require("../middlewares/auth");
const { setFlash } = require("../utils/flash");
const { uploadBufferToCloudinary } = require("../utils/cloudinary");

const uploadQualificationFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 15
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error("Only JPG, JPEG, PNG, PDF allowed"));
  }
});

router.post(
  "/profile/qualifications",
  requireRole("nurse"),
  requireApprovedNurse,
  uploadQualificationFiles.any(),
  async (req, res) => {
    console.log("🔥 Qualifications POST route hit");

    const nurse = req.session.user;
    const { rows } = await pool.query(
      "SELECT qualifications, profile_status, last_edit_request FROM nurses WHERE id = $1",
      [nurse.id]
    );

    const existingNurse = rows[0];
    const existingQualifications = Array.isArray(existingNurse.qualifications)
      ? existingNurse.qualifications
      : [];

    const selectedQualifications = Array.isArray(req.body.qualifications)
      ? req.body.qualifications
      : req.body.qualifications
      ? [req.body.qualifications]
      : [];

    // Build safe lookup map
    const PROFILE_QUALIFICATION_OPTIONS = [
      "10th (SSC)",
      "12th (HSC)",
      "ANM",
      "GNM",
      "BSc Nursing",
      "MSc Nursing"
    ];

    const qualificationLookup = {};
    PROFILE_QUALIFICATION_OPTIONS.forEach(q => {
      const safe = q.replace(/[^a-zA-Z0-9]/g, "_");
      qualificationLookup[`cert_${safe}`] = q;
    });

    // Build file map
    const fileMap = {};
    (req.files || []).forEach(file => {
      fileMap[file.fieldname] = file;
    });

    const updatedQualifications = [];

    for (const qualName of selectedQualifications) {
      const existingQual = existingQualifications.find(q => q.name === qualName);

      let certificateUrl = existingQual ? existingQual.certificate_url : null;
      let verified = existingQual ? Boolean(existingQual.verified) : false;

      const safeKey = `cert_${qualName.replace(/[^a-zA-Z0-9]/g, "_")}`;

      if (fileMap[safeKey]) {
        const uploadResult = await uploadBufferToCloudinary(
          fileMap[safeKey],
          "home-care/nurses/qualifications"
        );

        certificateUrl = uploadResult.secure_url;
        verified = false;
      }

      updatedQualifications.push({
        name: qualName,
        certificate_url: certificateUrl || null,
        verified
      });
    }

    // --- DETERMINISTIC COMPARISON ---
    function normalizeQualifications(arr = []) {
      return arr
        .map(q => ({
          name: q.name,
          certificate_url: q.certificate_url || null,
          verified: Boolean(q.verified)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const normalizedExisting = normalizeQualifications(existingQualifications);
    const normalizedUpdated = normalizeQualifications(updatedQualifications);

    const qualificationsChanged =
      JSON.stringify(normalizedExisting) !==
      JSON.stringify(normalizedUpdated);

    // --- 7 DAY COOLDOWN ---
    if (
      existingNurse.profile_status === "approved" &&
      qualificationsChanged
    ) {
      if (existingNurse.last_edit_request) {
        const days =
          (new Date() - new Date(existingNurse.last_edit_request)) /
          (1000 * 60 * 60 * 24);

        if (days < 7) {
          setFlash(
            req,
            "error",
            "You can request profile changes only once every 7 days."
          );
          return res.redirect("/nurse/profile");
        }
      }

      await pool.query(
        "UPDATE nurses SET profile_status = $1, last_edit_request = NOW() WHERE id = $2",
        ["pending", nurse.id]
      );
    }

    await pool.query(
      "UPDATE nurses SET qualifications = $1 WHERE id = $2",
      [updatedQualifications, nurse.id]
    );

    // If qualifications changed, also update user status to Pending
    if (qualificationsChanged) {
      await pool.query(
        `UPDATE users 
         SET status = 'Pending'
         WHERE id = $1`,
        [req.session.user.id]
      );
    }

    setFlash(req, "success", "Qualifications updated successfully.");
    res.redirect("/nurse/profile");
  }
);

// Multer config for profile image upload (100KB limit)
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/profile");
    if (!require("fs").existsSync(uploadDir)) {
      require("fs").mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, "profile-" + uniqueSuffix + ext);
  }
});

const uploadProfileImage = multer({
  storage: profileStorage,
  limits: { fileSize: 100 * 1024 }, // 100KB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, JPEG, and PNG files are allowed. Max size: 100KB"));
  }
});

// Nurse Profile Photo Upload (Dashboard-based)
router.post(
  "/profile/photo",
  requireRole("nurse"),
  requireApprovedNurse,
  uploadProfileImage.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        setFlash(req, "error", "Please select an image to upload.");
        return res.redirect("/nurse/profile");
      }

      const nurseId = req.nurseRecord.id;

      // Detect correct column
      let profilePicDbColumn = "profile_image_path";
      try {
        const columnCheck = await pool.query(`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'nurses'
              AND column_name = 'profile_pic_url'
          ) AS has_profile_pic_url
        `);

        if (columnCheck.rows[0]?.has_profile_pic_url) {
          profilePicDbColumn = "profile_pic_url";
        }
      } catch (err) {
        profilePicDbColumn = "profile_image_path";
      }

      await pool.query(
        `UPDATE nurses SET ${profilePicDbColumn} = $1 WHERE id = $2`,
        [req.file.path, nurseId]
      );

      setFlash(req, "success", "Profile photo updated successfully.");
      return res.redirect("/nurse/profile");

    } catch (error) {
      console.error("Photo upload error:", error);
      setFlash(req, "error", "Failed to upload profile photo.");
      return res.redirect("/nurse/profile");
    }
  }
);

module.exports = router;
