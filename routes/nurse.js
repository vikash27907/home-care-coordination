const express = require("express");
const router = express.Router();
const { pool } = require("../src/db");
const { requireRole, requireApprovedNurse } = require("../middlewares/auth");
const { uploadQualificationFiles } = require("../utils/multer");
const { setFlash } = require("../utils/flash");
const { uploadBufferToCloudinary } = require("../utils/cloudinary");

router.post(
  "/profile/qualifications",
  requireRole("nurse"),
  requireApprovedNurse,
  uploadQualificationFiles.any(),
  async (req, res) => {
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
          fileMap[safeKey].buffer,
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

    setFlash(req, "success", "Qualifications updated successfully.");
    res.redirect("/nurse/profile");
  }
);

module.exports = router;