const express = require("express");
const router = express.Router();
const axios = require("axios");

// 🔹 Webhook Verification (GET)
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

// 🔹 Webhook Receiver (POST)
router.post("/", async (req, res) => {
  // 1️⃣ Immediately acknowledge receipt (VERY IMPORTANT)
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    console.log("📩 Message from:", from);

    // 🔹 BUTTON CLICK HANDLER
    if (message.type === "interactive") {
      const buttonId = message.interactive.button_reply.id;
      console.log("🔘 Button clicked:", buttonId);

      if (buttonId === "nurse_register") {
        await sendTextMessage(from, "Great 👩‍⚕️\nPlease enter your Full Name:");
      }

      if (buttonId === "need_nurse") {
        await sendTextMessage(from, "Please enter Patient Name:");
      }

      if (buttonId === "talk_admin") {
        await sendTextMessage(from, "Our admin will contact you shortly.");
      }

      return;
    }

    // 🔹 FIRST TIME MESSAGE (TEXT)
    if (message.type === "text") {
      await sendMainMenu(from);
    }

  } catch (error) {
    console.error("Webhook Error:", error.response?.data || error.message);
  }
});

async function sendTextMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendMainMenu(to) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Welcome to Prisha Home Care 👩‍⚕️\n\nPlease choose an option:"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "nurse_register",
                title: "Apply as Nurse"
              }
            },
            {
              type: "reply",
              reply: {
                id: "need_nurse",
                title: "Need a Nurse"
              }
            },
            {
              type: "reply",
              reply: {
                id: "talk_admin",
                title: "Talk to Admin"
              }
            }
          ]
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

module.exports = router;
