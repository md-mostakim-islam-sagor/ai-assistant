// config.js
// ---------------------------------------------------------
// API key priority (highest wins):
//   1. Admin Panel override   (saved via /?admin dashboard)
//   2. Environment variable   GEMINI_API_KEY (.env or Vercel Env Vars)
//   3. HARDCODED_API_KEY below (paste your key directly here if you want
//      the project to run without setting up .env / Vercel env vars)
//
// This means: you CAN just paste your key into HARDCODED_API_KEY and run
// the project immediately -- and you can ALSO change it later from the
// admin panel without touching code.
// ---------------------------------------------------------

require("dotenv").config();
const store = require("./lib/store");

// 👇 Paste your Gemini API key here if you want (optional fallback)
const HARDCODED_API_KEY = "";

function getApiKey() {
  const data = store.load();
  if (data.apiKeyOverride && data.apiKeyOverride.trim()) {
    return data.apiKeyOverride.trim();
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  return HARDCODED_API_KEY;
}

module.exports = {
  getApiKey,
  SITE_NAME: process.env.SITE_NAME || "AI 2.0",
};
