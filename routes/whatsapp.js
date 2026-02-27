const express = require("express");
const router = express.Router();

// Webhook Verification (GET)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// Webhook Receiver (POST)
router.post("/", (req, res) => {
  console.log("📩 Incoming Webhook:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

module.exports = router;
