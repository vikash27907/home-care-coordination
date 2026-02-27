const express = require("express");
const router = express.Router();
const axios = require("axios");
const { pool } = require("../src/db");

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
        await upsertSession(from, "nurse", "ask_full_name", {});
        await sendTextMessage(from, "Great 👩‍⚕️\nPlease enter your Full Name:");
      }

      if (buttonId === "need_nurse") {
        await upsertSession(from, "care_request", "ask_patient_name", {});
        await sendTextMessage(from, "Please enter Patient Name:");
      }

      if (buttonId === "talk_admin") {
        await sendTextMessage(from, "Our admin will contact you shortly.");
      }

      return;
    }

    // 🔹 FIRST TIME MESSAGE (TEXT)
    if (message.type === "text") {

      const session = await getSession(from);

      // No session → show main menu
      if (!session) {
        await sendMainMenu(from);
        return;
      }

      // ===========================
      // NURSE FLOW
      // ===========================

      if (session.current_flow === "nurse") {

        // STEP 1: Full Name
        if (session.step === "ask_full_name") {

          const updatedData = {
            ...session.temp_data,
            full_name: message.text.body.trim()
          };

          await upsertSession(from, "nurse", "ask_experience", updatedData);

          await sendTextMessage(from, "How many years of experience do you have?");
          return;
        }

        // STEP 2: Experience
        if (session.step === "ask_experience") {

          const years = parseInt(message.text.body.trim(), 10);

          if (isNaN(years)) {
            await sendTextMessage(from, "Please enter a valid number (example: 3).");
            return;
          }

          const updatedData = {
            ...session.temp_data,
            experience_years: years
          };

          await upsertSession(from, "nurse", "ask_city", updatedData);

          await sendTextMessage(from, "Which city are you currently in?");
          return;
        }

        // STEP 3: City
        if (session.step === "ask_city") {

          const updatedData = {
            ...session.temp_data,
            city: message.text.body.trim()
          };

          await upsertSession(from, "nurse", "completed", updatedData);

          console.log("🧠 Final Nurse Data:", updatedData);

          await sendTextMessage(
            from,
            "Thank you! Your details are saved. We will now create your profile."
          );

          return;
        }
      }

      // fallback
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


async function getSession(phone) {
  const result = await pool.query(
    "SELECT * FROM whatsapp_sessions WHERE phone = $1",
    [phone]
  );
  return result.rows[0];
}

async function upsertSession(phone, flow, step, tempData = {}) {
  await pool.query(
    `
    INSERT INTO whatsapp_sessions (phone, current_flow, step, temp_data, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (phone)
    DO UPDATE SET
      current_flow = EXCLUDED.current_flow,
      step = EXCLUDED.step,
      temp_data = EXCLUDED.temp_data,
      updated_at = NOW()
    `,
    [phone, flow, step, tempData]
  );
}
module.exports = router;

