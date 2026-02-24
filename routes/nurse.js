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
  "MSc Nursing",
  "GDA"
];
const CUSTOM_QUALIFICATION_VALUE = "Other (Custom Qualification)";
const CURRENT_STATUS_OPTIONS = [
  "Available for Work",
  "Currently Working",
  "Open to Opportunities",
  "Not Available"
];
const AADHAR_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const AADHAR_IMAGE_ALLOWED = /jpeg|jpg|png|webp/;
const QUALIFICATION_DOC_ALLOWED = /jpeg|jpg|png|pdf/;

function sanitizeQualificationName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "_");
}

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

function normalizeUniqueArrayCaseInsensitive(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const normalized = [];

  values.forEach((item) => {
    const cleanValue = String(item || "").trim();
    if (!cleanValue) return;

    const key = cleanValue.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(cleanValue);
  });

  return normalized;
}

function normalizeCurrentStatus(value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const normalized = clean.toLowerCase();
  if (normalized === "open for work" || normalized === "available" || normalized === "available for work") {
    return "Available for Work";
  }
  if (normalized === "currently working") {
    return "Currently Working";
  }
  if (
    normalized === "working but looking for change"
    || normalized === "working need change"
    || normalized === "open to opportunities"
  ) {
    return "Open to Opportunities";
  }
  if (normalized === "not available" || normalized === "unavailable") {
    return "Not Available";
  }
  return CURRENT_STATUS_OPTIONS.includes(clean) ? clean : "";
}

const uploadQualificationFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 15
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || "")).toLowerCase();
    const mimetype = String(file.mimetype || "").toLowerCase();

    if (file.fieldname === "aadharImage") {
      const extAllowed = AADHAR_IMAGE_ALLOWED.test(extension);
      const mimeAllowed = AADHAR_IMAGE_ALLOWED.test(mimetype);
      if (extAllowed && mimeAllowed) return cb(null, true);
      return cb(new Error("Only JPG, JPEG, PNG, and WEBP files are allowed for Aadhaar image."));
    }

    const extAllowed = QUALIFICATION_DOC_ALLOWED.test(extension);
    const mimeAllowed = QUALIFICATION_DOC_ALLOWED.test(mimetype);
    if (extAllowed && mimeAllowed) return cb(null, true);
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

function qualificationDocumentUploadMiddleware(req, res, next) {
  uploadQualificationFiles.single("qualificationDocument")(req, res, (error) => {
    if (error) {
      console.error("Qualification document upload middleware error:", error);
      setFlash(req, "error", error.message || "Invalid qualification document upload.");
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

      const qualificationFieldValue = Object.prototype.hasOwnProperty.call(req.body, "qualifications")
        ? req.body.qualifications
        : req.body["qualifications[]"];
      const submittedQualifications = (Array.isArray(qualificationFieldValue)
        ? qualificationFieldValue
        : qualificationFieldValue
          ? [qualificationFieldValue]
          : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);

      const selectedQualifications = submittedQualifications
        .filter((item) => PROFILE_QUALIFICATION_OPTIONS.includes(item));
      const hasCustomQualification = submittedQualifications.includes(CUSTOM_QUALIFICATION_VALUE);
      const customName = String(req.body.customQualificationName || "").trim();
      if (hasCustomQualification && !customName) {
        setFlash(req, "error", "Please enter a custom qualification name.");
        return res.redirect("/nurse/profile");
      }
      if (customName) {
        selectedQualifications.push(customName);
      }
      const uniqueSelectedQualifications = [...new Set(selectedQualifications)];

      const existingMap = new Map(
        existingQualifications
          .filter((item) => item && typeof item.name === "string")
          .map((item) => [item.name, item])
      );
      const fileMap = {};
      (req.files || []).forEach((file) => {
        fileMap[file.fieldname] = file;
      });
      const customFile = (req.files || []).find((file) => file.fieldname === "cert_custom");

      const qualificationStates = uniqueSelectedQualifications.map((qualName) => {
        const existingQual = existingMap.get(qualName);
        const safeKey = `cert_${sanitizeQualificationName(qualName)}`;
        const certificateFile = customName && qualName === customName
          ? customFile || null
          : fileMap[safeKey] || null;

        return {
          qualName,
          existingQual,
          certificateFile
        };
      });

      const updatedQualifications = [];
      for (const state of qualificationStates) {
        const qualName = state.qualName;
        const existingQual = state.existingQual;
        const existingUrl = existingQual ? existingQual.certificate_url : null;
        const certificateFile = state.certificateFile;
        let uploadedUrl = null;

        if (certificateFile) {
          const uploadResult = await uploadBufferToCloudinary(
            certificateFile,
            "home-care/nurses/qualifications"
          );
          uploadedUrl = uploadResult.secure_url || null;
        }

        updatedQualifications.push({
          name: qualName,
          certificate_url: uploadedUrl || existingUrl || null,
          verified: false
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image files are allowed"));
  }
});

router.post(
  "/profile/upload-photo",
  requireRole("nurse"),
  requireApprovedNurse,
  (req, res, next) => {
    uploadProfileImage.single("profileImage")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error("Multer error:", err.message);
        return res.redirect("/nurse/profile?error=fileTooLarge");
      }
      if (err) {
        console.error("Upload error:", err.message);
        return res.redirect("/nurse/profile?error=invalidFile");
      }
      return next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        setFlash(req, "error", "Please select an image to upload.");
        return res.redirect("/nurse/profile");
      }

      const userId = req.session.user.id;
      const uploadedImagePath = `/uploads/profile/${req.file.filename}`;

      await pool.query(
        "UPDATE nurses SET profile_image_url = $1 WHERE user_id = $2",
        [uploadedImagePath, userId]
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

router.post(
  "/profile/delete-photo",
  requireRole("nurse"),
  requireApprovedNurse,
  async (req, res) => {
    try {
      const userId = req.session.user.id;

      await pool.query(
        "UPDATE nurses SET profile_image_url = NULL WHERE user_id = $1",
        [userId]
      );

      return res.redirect("/nurse/profile");
    } catch (error) {
      console.error("Delete profile picture error:", error);
      return res.redirect("/nurse/profile");
    }
  }
);

router.post(
  "/profile/basic-edit",
  requireRole("nurse"),
  requireApprovedNurse,
  qualificationUploadMiddleware,
  async (req, res) => {
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
      const hasCurrentStatusField = hasField("current_status") || hasField("currentStatus");
      const currentStatusInput = hasField("current_status")
        ? req.body.current_status
        : req.body.currentStatus;
      const currentStatus = hasCurrentStatusField ? normalizeCurrentStatus(currentStatusInput) : null;
      const experienceYearsRaw = String(req.body.experienceYears || "").trim();
      const experienceYears = experienceYearsRaw === "" ? null : Number.parseInt(experienceYearsRaw, 10);
      const hasAadharField = hasField("aadharNumber") || hasField("aadhaarNumber");
      const aadharInput = hasField("aadharNumber")
        ? req.body.aadharNumber
        : req.body.aadhaarNumber;
      const aadharNumber = hasAadharField
        ? String(aadharInput || "").replace(/\D/g, "").slice(0, 12)
        : null;
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
        ? normalizeUniqueArrayCaseInsensitive(rawSkills)
        : (hasField("skillsInput")
          ? normalizeUniqueArrayCaseInsensitive(normalizeCsvInput(req.body.skillsInput))
          : null);
      const availability = hasField("availability")
        ? [...new Set(rawAvailability.map((item) => String(item || "").trim()).filter(Boolean))]
        : (hasField("availabilityInput") ? normalizeCsvInput(req.body.availabilityInput) : null);

      const qualificationFieldValue = hasField("qualifications")
        ? req.body.qualifications
        : req.body["qualifications[]"];
      const selectedQualifications = Array.isArray(qualificationFieldValue)
        ? [...qualificationFieldValue]
        : qualificationFieldValue
          ? [qualificationFieldValue]
          : [];
      const customName = req.body.customQualificationName?.trim();

      if (!fullName) {
        setFlash(req, "error", "Full name is required.");
        return res.redirect("/nurse/profile");
      }
      if (gender && !["Male", "Female", "Other", "Not Specified"].includes(gender)) {
        setFlash(req, "error", "Please select a valid gender.");
        return res.redirect("/nurse/profile");
      }
      if (hasCurrentStatusField && !currentStatus) {
        setFlash(req, "error", "Please select a valid current status.");
        return res.redirect("/nurse/profile");
      }
      if (experienceYears !== null && (Number.isNaN(experienceYears) || experienceYears < 0 || experienceYears > 60)) {
        setFlash(req, "error", "Experience must be between 0 and 60 years.");
        return res.redirect("/nurse/profile");
      }
      if (aadharNumber && aadharNumber.length !== 12) {
        setFlash(req, "error", "Aadhaar number must be exactly 12 digits.");
        return res.redirect("/nurse/profile");
      }
      if (phoneNumberRaw) {
        const digits = phoneNumberRaw.replace(/\D/g, "");
        if (digits.length !== 10) {
          setFlash(req, "error", "Please enter a valid 10-digit mobile number.");
          return res.redirect("/nurse/profile");
        }
      }

      const submittedQualifications = selectedQualifications
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const hasCustomSelection = submittedQualifications.includes(CUSTOM_QUALIFICATION_VALUE);
      if (hasCustomSelection && !customName) {
        setFlash(req, "error", "Please enter custom qualification name.");
        return res.redirect("/nurse/profile");
      }

      const normalizedSelectedQualifications = submittedQualifications.filter(
        (item) => PROFILE_QUALIFICATION_OPTIONS.includes(item)
      );
      if (customName) {
        normalizedSelectedQualifications.push(customName);
      }
      const uniqueSelectedQualifications = [...new Set(normalizedSelectedQualifications)];

      const existingResult = await pool.query(
        `SELECT
           qualifications,
           COALESCE((to_jsonb(nurses) ->> 'aadhar_number'), '') AS aadhar_number,
           COALESCE((to_jsonb(nurses) ->> 'aadhaar_number'), '') AS aadhaar_number,
           COALESCE((to_jsonb(nurses) ->> 'aadhar_image_url'), '') AS aadhar_image_url,
           COALESCE((to_jsonb(nurses) ->> 'aadhaar_card_url'), '') AS aadhaar_card_url,
           COALESCE((to_jsonb(nurses) ->> 'aadhaar_image_url'), '') AS aadhaar_image_url,
           COALESCE((to_jsonb(nurses) ->> 'aadhar_card_url'), '') AS aadhar_card_url
         FROM nurses
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (!existingResult.rows.length) {
        setFlash(req, "error", "Nurse profile not found.");
        return res.redirect("/nurse/profile");
      }
      const existingNurse = existingResult.rows[0];
      const existingAadharNumber = String(existingNurse.aadhar_number || existingNurse.aadhaar_number || "")
        .replace(/\D/g, "")
        .slice(0, 12);
      const effectiveAadharNumber = aadharNumber || existingAadharNumber;
      const existingAadharImageUrl = String(
        existingNurse.aadhar_image_url
        || existingNurse.aadhaar_card_url
        || existingNurse.aadhaar_image_url
        || existingNurse.aadhar_card_url
        || ""
      ).trim();

      const existingQualifications = Array.isArray(existingNurse.qualifications)
        ? existingNurse.qualifications
        : [];
      const existingMap = new Map(
        existingQualifications
          .filter((item) => item && typeof item.name === "string")
          .map((item) => [String(item.name).trim().toLowerCase(), item])
      );

      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const aadharImageFile = uploadedFiles.find((file) => file.fieldname === "aadharImage") || null;
      if (aadharImageFile && Number(aadharImageFile.size || 0) > AADHAR_IMAGE_MAX_BYTES) {
        setFlash(req, "error", "Aadhaar image must be 3MB or smaller.");
        return res.redirect("/nurse/profile");
      }
      let uploadedAadharImageUrl = null;
      if (aadharImageFile) {
        const aadharUploadResult = await uploadBufferToCloudinary(
          aadharImageFile,
          "home-care/nurses/aadhar"
        );
        uploadedAadharImageUrl = aadharUploadResult && aadharUploadResult.secure_url
          ? String(aadharUploadResult.secure_url).trim()
          : "";
        if (!uploadedAadharImageUrl) {
          throw new Error("Unable to upload Aadhaar image right now.");
        }
      }
      if (effectiveAadharNumber && !existingAadharImageUrl && !uploadedAadharImageUrl) {
        setFlash(req, "error", "Aadhaar card upload is required before saving profile.");
        return res.redirect("/nurse/profile?error=aadharImageRequired");
      }

      const customFile = uploadedFiles.find((file) => file.fieldname === "cert_custom");
      const getQualificationFile = (qualificationName) => {
        if (customName && qualificationName === customName) {
          return customFile || null;
        }
        const fieldName = `cert_${sanitizeQualificationName(qualificationName)}`;
        return uploadedFiles.find((file) => file.fieldname === fieldName) || null;
      };

      const updatedQualifications = [];
      for (const qualificationName of uniqueSelectedQualifications) {
        const existingQualification = existingMap.get(qualificationName.toLowerCase());
        const existingUrl = existingQualification && existingQualification.certificate_url
          ? existingQualification.certificate_url
          : null;
        const certificateFile = getQualificationFile(qualificationName);

        let uploadedUrl = null;
        if (certificateFile) {
          const uploadResult = await uploadBufferToCloudinary(
            certificateFile,
            "home-care/nurses/qualifications"
          );
          uploadedUrl = uploadResult.secure_url || null;
        }

        updatedQualifications.push({
          name: qualificationName,
          certificate_url: uploadedUrl || existingUrl || null,
          verified: false
        });
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
             current_status = COALESCE($7, current_status),
             skills = COALESCE($8, skills),
             availability = COALESCE($9, availability),
             aadhar_number = COALESCE($10, aadhar_number),
             aadhar_image_url = COALESCE($11, aadhar_image_url),
             qualifications = $12
         WHERE user_id = $13`,
        [
          fullName,
          gender,
          city,
          workCity,
          currentAddress,
          experienceYears,
          currentStatus,
          skills,
          availability,
          aadharNumber || null,
          uploadedAadharImageUrl || null,
          JSON.stringify(updatedQualifications),
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
  }
);

router.post(
  "/profile/upload-qualification-document",
  requireRole("nurse"),
  requireApprovedNurse,
  qualificationDocumentUploadMiddleware,
  async (req, res) => {
    try {
      const userId = req.session.user && req.session.user.id;
      const qualificationName = String(req.body.qualificationName || "").trim();
      const file = req.file;

      if (!userId) {
        setFlash(req, "error", "Unable to identify nurse profile.");
        return res.redirect("/nurse/profile");
      }
      if (!qualificationName) {
        setFlash(req, "error", "Qualification name is required.");
        return res.redirect("/nurse/profile");
      }
      if (!file) {
        setFlash(req, "error", "Please select a document to upload.");
        return res.redirect("/nurse/profile");
      }

      const { rows } = await pool.query(
        "SELECT qualifications FROM nurses WHERE user_id = $1 LIMIT 1",
        [userId]
      );
      if (!rows.length) {
        setFlash(req, "error", "Nurse profile not found.");
        return res.redirect("/nurse/profile");
      }

      const qualifications = Array.isArray(rows[0].qualifications)
        ? rows[0].qualifications
        : [];
      const hasQualification = qualifications.some((item) => (
        item
        && typeof item === "object"
        && String(item.name || "").trim() === qualificationName
      ));
      if (!hasQualification) {
        setFlash(req, "error", "Qualification not found.");
        return res.redirect("/nurse/profile");
      }

      const uploadResult = await uploadBufferToCloudinary(
        file,
        "home-care/nurses/qualifications"
      );
      const uploadedUrl = uploadResult && uploadResult.secure_url
        ? uploadResult.secure_url
        : null;
      if (!uploadedUrl) {
        throw new Error("Unable to upload qualification document right now.");
      }

      const updatedQualifications = qualifications.map((item) => {
        if (!item || typeof item !== "object") return item;
        if (String(item.name || "").trim() !== qualificationName) return item;
        return {
          ...item,
          certificate_url: uploadedUrl
        };
      });

      const updateResult = await pool.query(
        "UPDATE nurses SET qualifications = $1 WHERE user_id = $2",
        [JSON.stringify(updatedQualifications), userId]
      );
      if (updateResult.rowCount !== 1) {
        throw new Error("Unable to update qualification document right now.");
      }

      setFlash(req, "success", "Qualification document uploaded successfully.");
      return res.redirect("/nurse/profile");
    } catch (error) {
      console.error("Qualification document upload error:", error);
      setFlash(req, "error", error.message || "Unable to upload qualification document right now.");
      return res.redirect("/nurse/profile");
    }
  }
);

module.exports = router;
