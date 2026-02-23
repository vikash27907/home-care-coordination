const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { pool } = require("../src/db");
const { requireRole, requireApprovedNurse } = require("../middlewares/auth");
const { setFlash } = require("../utils/flash");
const { uploadBufferToCloudinary } = require("../utils/cloudinary");

const PROFILE_QUALIFICATION_OPTIONS = [
  "10th (SSC)",
  "12th (HSC)",
  "ANM",
  "GNM",
  "BSc Nursing",
  "MSc Nursing"
];

function normalizeCsvInput(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.includes(",")) {
    return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
  }
  return [raw];
}

const uploadQualificationFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 15
  },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    return cb(new Error("Only JPG, JPEG, PNG, PDF allowed"));
  }
});

function qualificationUploadMiddleware(req, res, next) {
  uploadQualificationFiles.any()(req, res, (error) => {
    if (error) {
      console.error("Qualification upload middleware error:", error);
      setFlash(req, "error", error.message || "Invalid qualification upload.");
      return res.redirect("/nurse/profile");
    }
    return next();
  });
}

router.post(
  "/profile/qualifications",
  requireRole("nurse"),
  requireApprovedNurse,
  qualificationUploadMiddleware,
  async (req, res) => {
    let client;
    try {
      const userId = req.session.user && req.session.user.id;
      const nurseId = req.nurseRecord && req.nurseRecord.id;

      if (!userId || !nurseId) {
        setFlash(req, "error", "Unable to identify nurse profile.");
        return res.redirect("/nurse/profile");
      }

      const { rows } = await pool.query(
        "SELECT qualifications, profile_status, last_edit_request FROM nurses WHERE id = $1 AND user_id = $2 LIMIT 1",
        [nurseId, userId]
      );
      if (!rows.length) {
        setFlash(req, "error", "Nurse profile not found.");
        return res.redirect("/nurse/profile");
      }

      const existingNurse = rows[0];
      const existingQualifications = Array.isArray(existingNurse.qualifications)
        ? existingNurse.qualifications
        : [];

      const selectedQualifications = [...new Set(
        (Array.isArray(req.body.qualifications)
          ? req.body.qualifications
          : req.body.qualifications
            ? [req.body.qualifications]
            : [])
          .map((item) => String(item || "").trim())
          .filter((item) => PROFILE_QUALIFICATION_OPTIONS.includes(item))
      )];

      const existingMap = new Map(
        existingQualifications
          .filter((item) => item && typeof item.name === "string")
          .map((item) => [item.name, item])
      );
      const fileMap = {};
      (req.files || []).forEach((file) => {
        fileMap[file.fieldname] = file;
      });

      const updatedQualifications = [];
      for (const qualName of selectedQualifications) {
        const existingQual = existingMap.get(qualName);
        let certificateUrl = existingQual ? existingQual.certificate_url : null;
        let verified = existingQual ? Boolean(existingQual.verified) : false;
        const safeKey = `cert_${qualName.replace(/[^a-zA-Z0-9]/g, "_")}`;

        if (fileMap[safeKey]) {
          const uploadResult = await uploadBufferToCloudinary(
            fileMap[safeKey],
            "home-care/nurses/qualifications"
          );
          certificateUrl = uploadResult.secure_url || null;
          verified = false;
        }

        updatedQualifications.push({
          name: qualName,
          certificate_url: certificateUrl || null,
          verified
        });
      }

      const normalizeQualificationsForCompare = (arr = []) => (
        arr
          .map((item) => ({
            name: String(item.name || "").trim(),
            certificate_url: item.certificate_url || null,
            verified: Boolean(item.verified)
          }))
          .filter((item) => item.name)
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      const qualificationsChanged =
        JSON.stringify(normalizeQualificationsForCompare(existingQualifications)) !==
        JSON.stringify(normalizeQualificationsForCompare(updatedQualifications));

      if (existingNurse.profile_status === "approved" && qualificationsChanged) {
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
      }

      client = await pool.connect();
      await client.query("BEGIN");

      if (existingNurse.profile_status === "approved" && qualificationsChanged) {
        const pendingResult = await client.query(
          "UPDATE nurses SET profile_status = $1, last_edit_request = NOW() WHERE id = $2",
          ["pending", nurseId]
        );
        if (pendingResult.rowCount !== 1) {
          throw new Error("Failed to mark profile status as pending.");
        }
      }

      const updateResult = await client.query(
        "UPDATE nurses SET qualifications = $1 WHERE id = $2 AND user_id = $3",
        [JSON.stringify(updatedQualifications), nurseId, userId]
      );
      if (updateResult.rowCount !== 1) {
        throw new Error("Unable to save qualifications right now.");
      }

      if (qualificationsChanged) {
        const userStatusResult = await client.query(
          "UPDATE users SET status = 'Pending' WHERE id = $1",
          [userId]
        );
        if (userStatusResult.rowCount !== 1) {
          throw new Error("Unable to update account status right now.");
        }
      }

      await client.query("COMMIT");
      client.release();
      client = null;

      setFlash(req, "success", "Qualifications updated successfully.");
      return res.redirect("/nurse/profile");
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Qualification update rollback error:", rollbackError);
        }
        client.release();
      }
      console.error("Qualification update error:", error);
      setFlash(req, "error", error.message || "Unable to update qualifications right now.");
      return res.redirect("/nurse/profile");
    }
  }
);

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/profile");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `profile-${uniqueSuffix}${ext}`);
  }
});

const uploadProfileImage = multer({
  storage: profileStorage,
  limits: { fileSize: 100 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    return cb(new Error("Only JPG, JPEG, and PNG files are allowed. Max size: 100KB"));
  }
});

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
      } catch (error) {
        profilePicDbColumn = "profile_image_path";
      }

      const updateResult = await pool.query(
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

router.post("/profile/basic-edit", requireRole("nurse"), requireApprovedNurse, async (req, res) => {
  let client;
  try {
    const userId = req.session.user.id;
    const hasField = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    const fullName = String(req.body.fullName || "").trim();
    const phoneNumberRaw = String(req.body.phoneNumber || "").trim();
    const gender = hasField("gender") ? String(req.body.gender || "").trim() : null;
    const city = hasField("city") ? String(req.body.city || "").trim() : null;
    const workCity = hasField("workCity") ? String(req.body.workCity || "").trim() : null;
    const currentAddress = hasField("currentAddress") ? String(req.body.currentAddress || "").trim() : null;
    const educationLevel = hasField("educationLevel") ? String(req.body.educationLevel || "").trim() : null;
    const experienceYearsRaw = String(req.body.experienceYears || "").trim();
    const experienceYears = experienceYearsRaw === "" ? null : Number.parseInt(experienceYearsRaw, 10);
    const rawSkills = Array.isArray(req.body.skills)
      ? req.body.skills
      : req.body.skills
        ? [req.body.skills]
        : [];
    const rawAvailability = Array.isArray(req.body.availability)
      ? req.body.availability
      : req.body.availability
        ? [req.body.availability]
        : [];

    const skills = hasField("skills")
      ? [...new Set(rawSkills.map((item) => String(item || "").trim()).filter(Boolean))]
      : (hasField("skillsInput") ? normalizeCsvInput(req.body.skillsInput) : null);
    const availability = hasField("availability")
      ? [...new Set(rawAvailability.map((item) => String(item || "").trim()).filter(Boolean))]
      : (hasField("availabilityInput") ? normalizeCsvInput(req.body.availabilityInput) : null);
    const isAvailable = hasField("isAvailable")
      ? (
        String(req.body.isAvailable).toLowerCase() === "true"
        || req.body.isAvailable === "1"
        || req.body.isAvailable === "on"
      )
      : null;

    if (!fullName) {
      setFlash(req, "error", "Full name is required.");
      return res.redirect("/nurse/profile");
    }
    if (gender && !["Male", "Female", "Other", "Not Specified"].includes(gender)) {
      setFlash(req, "error", "Please select a valid gender.");
      return res.redirect("/nurse/profile");
    }
    if (experienceYears !== null && (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60)) {
      setFlash(req, "error", "Experience must be between 0 and 60 years.");
      return res.redirect("/nurse/profile");
    }
    if (phoneNumberRaw) {
      const digits = phoneNumberRaw.replace(/\D/g, "");
      if (digits.length !== 10) {
        setFlash(req, "error", "Please enter a valid 10-digit mobile number.");
        return res.redirect("/nurse/profile");
      }
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const updateResult = await client.query(
      `UPDATE nurses
       SET full_name = COALESCE($1, full_name),
           gender = COALESCE($2, gender),
           city = COALESCE($3, city),
           work_city = COALESCE($4, work_city),
           current_address = COALESCE($5, current_address),
           experience_years = COALESCE($6, experience_years),
           education_level = COALESCE($7, education_level),
           is_available = COALESCE($8, is_available),
           skills = COALESCE($9, skills),
           availability = COALESCE($10, availability)
       WHERE user_id = $11`,
      [
        fullName,
        gender,
        city,
        workCity,
        currentAddress,
        experienceYears,
        educationLevel,
        isAvailable,
        skills,
        availability,
        userId
      ]
    );
    if (updateResult.rowCount !== 1) {
      throw new Error("Unable to update profile.");
    }

    if (hasField("phoneNumber")) {
      const phoneResult = await client.query(
        `UPDATE users
         SET phone_number = $1
         WHERE id = $2`,
        [phoneNumberRaw ? phoneNumberRaw.replace(/\D/g, "") : null, userId]
      );
      if (phoneResult.rowCount !== 1) {
        throw new Error("Unable to update contact number.");
      }
    }

    await client.query("COMMIT");
    client.release();
    client = null;

    setFlash(req, "success", "Profile updated successfully.");
    return res.redirect("/nurse/profile");
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Basic edit rollback error:", rollbackError);
      }
      client.release();
    }
    console.error("Basic edit error:", error);
    setFlash(req, "error", error.message || "Unable to update profile right now.");
    return res.redirect("/nurse/profile");
  }
});

module.exports = router;
