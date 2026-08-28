// index.js
// Main server entry point.
//
// Public site  -> "/"           serves src/public (chat UI)
// Admin login  -> "/?admin"     serves src/dashboard/login.html (or admin.html if already logged in)
// Admin APIs   -> "/api/admin/*" protected by a session cookie
// Chat/Image   -> "/api/chat", "/api/image"

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");
const store = require("./lib/store");

const app = express();
// Attachment payloads are sent as Gemini inline data for supported images.
// Keep enough room for base64 overhead while the browser still enforces
// a 10 MB per-file / 20 MB per-message limit.
app.use(express.json({ limit: "32mb" }));

app.get("/api/healthz", (req, res) => {
  res.json({ status: "ok" });
});

// ---------- tiny cookie helpers (no extra dependency needed) ----------
function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = decodeURIComponent(pair.slice(idx + 1).trim());
      cookies[key] = val;
    }
  });
  return cookies;
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  const cookieStr = parts.join("; ");
  if (existing) {
    res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
  } else {
    res.setHeader("Set-Cookie", cookieStr);
  }
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAge: 0 });
}

// ---------- anonymous visitor id (used only to count unique users) ----------
app.use((req, res, next) => {
  const cookies = parseCookies(req);
  if (!cookies.uid) {
    const uid = crypto.randomBytes(12).toString("hex");
    setCookie(res, "uid", uid, { httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
    req.uid = uid;
  } else {
    req.uid = cookies.uid;
  }
  next();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =========================================================
// Public chat / image APIs
// =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const { history, model } = req.body;
    const apiKey = config.getApiKey();

    if (!apiKey) {
      return res.status(500).json({ error: { message: "API key is not configured. Set it in config.js, .env, or the Admin Panel." } });
    }
    if (!Array.isArray(history) || !model) {
      return res.status(400).json({ error: { message: "Invalid request body." } });
    }

    const systemPrompt = `You are ${config.SITE_NAME}, the most advanced, powerful, and helpful AI assistant. You must always provide 100% correct, factual, and highly accurate answers to everything the user asks. For coding questions, provide robust, best-practice solutions. You must give maximum effort, ensuring absolutely accurate information and the best output for every user request.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: history };

    let lastData = null;
    const retries = 4;
    for (let i = 0; i < retries; i++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        const s = store.load();
        store.recordApiCall(s, "chat", history[history.length - 1]?.parts?.[0]?.text || "");
        store.recordUniqueUser(s, req.uid);
        return res.json(data);
      }
      lastData = data;
      if (data?.error?.code === 503 && i < retries - 1) {
        await sleep(2500);
        continue;
      }
      break;
    }
    return res.status(502).json(lastData || { error: { message: "Server Error" } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

app.post("/api/image", (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: { message: "Prompt is required." } });
    }

    const nsfwRegex = /\b(sex|sexy|nude|naked|porn|nsfw|boobs|erotic)\b/i;
    if (nsfwRegex.test(prompt)) {
      return res.status(400).json({ error: { message: "blocked", nsfw: true } });
    }

    let basePrompt = prompt;
    if (basePrompt.trim().toLowerCase() === "bmw") {
      basePrompt = "A stunning, highly modified BMW M5, black aggressive look, neon street lights reflection, cinematic shot";
    } else if (basePrompt.toLowerCase().includes("bmw")) {
      basePrompt = basePrompt.replace(/bmw/i, "beautiful BMW M5");
    }

    const enhancedPrompt = basePrompt + ", masterpiece, best quality, ultra-detailed, sharp focus, clear face, perfectly drawn, stunning color combination, perfect composition, vibrant colors, unblurred";
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const randomSeed = Math.floor(Math.random() * 10000000);
    const w = width || 1024;
    const h = height || 1024;
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${randomSeed}&width=${w}&height=${h}&nologo=true&enhance=true&safe=true`;

    const s = store.load();
    store.recordApiCall(s, "image", prompt);
    store.recordUniqueUser(s, req.uid);

    return res.json({ imageUrl });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
});

// Proxy generated images through the API service so downloads work even when
// the image provider does not expose browser-friendly CORS headers.
app.get("/api/image/download", async (req, res) => {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const imageUrl = new URL(rawUrl);
    if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "image.pollinations.ai") {
      return res.status(400).json({ error: { message: "Only generated images can be downloaded." } });
    }

    let upstream;
    let imageBuffer = Buffer.alloc(0);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      upstream = await fetch(imageUrl, { cache: "no-store" });
      if (upstream.ok) {
        imageBuffer = Buffer.from(await upstream.arrayBuffer());
        if (imageBuffer.length > 0) break;
      }
      if (attempt < 2) await sleep(500);
    }

    if (!upstream || !upstream.ok || imageBuffer.length === 0) {
      return res.status(502).json({ error: { message: "Generated image is temporarily unavailable. Please try again." } });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="ai-image-${Date.now()}.${extension}"`);
    res.setHeader("Content-Length", imageBuffer.length);
    return res.send(imageBuffer);
  } catch (err) {
    return res.status(400).json({ error: { message: "Invalid image URL." } });
  }
});

// =========================================================
// Admin auth middleware
// =========================================================
function getValidSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  if (!token) return null;
  const s = store.load();
  const session = s.sessions[token];
  if (!session) return null;
  if (session.expires < Date.now()) {
    delete s.sessions[token];
    store.save(s);
    return null;
  }
  return { token, ...session };
}

function requireAdmin(req, res, next) {
  const session = getValidSession(req);
  if (!session) {
    return res.status(401).json({ error: { message: "Not authenticated." } });
  }
  req.adminSession = session;
  next();
}

// =========================================================
// Admin APIs
// =========================================================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: { message: "Username and password required." } });
  }
  const s = store.load();
  const validUser = username === s.admin.username;
  const validPass = validUser && store.verifyPassword(password, s.admin.salt, s.admin.hash);
  if (!validUser || !validPass) {
    return res.status(401).json({ error: { message: "Invalid username or password." } });
  }
  const token = crypto.randomBytes(32).toString("hex");
  s.sessions[token] = { username, expires: Date.now() + 1000 * 60 * 60 * 24 }; // 24h
  store.save(s);
  setCookie(res, "admin_session", token, { httpOnly: true, maxAge: 60 * 60 * 24 });
  return res.json({ success: true });
});

app.post("/api/admin/logout", (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies.admin_session;
  if (token) {
    const s = store.load();
    delete s.sessions[token];
    store.save(s);
  }
  clearCookie(res, "admin_session");
  return res.json({ success: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  return res.json({ username: req.adminSession.username });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const s = store.load();
  const currentKey = config.getApiKey();
  const maskedKey = currentKey ? `${currentKey.slice(0, 4)}${"•".repeat(Math.max(currentKey.length - 8, 4))}${currentKey.slice(-4)}` : "(not set)";
  return res.json({
    chatCalls: s.stats.chatCalls,
    imageCalls: s.stats.imageCalls,
    totalCalls: s.stats.chatCalls + s.stats.imageCalls,
    uniqueUsers: s.stats.uniqueUsers.length,
    recent: s.stats.recent,
    maskedApiKey: maskedKey,
    hasApiKeyOverride: !!s.apiKeyOverride,
  });
});

app.post("/api/admin/apikey", requireAdmin, (req, res) => {
  const { apiKey } = req.body || {};
  if (typeof apiKey !== "string") {
    return res.status(400).json({ error: { message: "apiKey must be a string." } });
  }
  const s = store.load();
  s.apiKeyOverride = apiKey.trim();
  store.save(s);
  return res.json({ success: true });
});

app.post("/api/admin/credentials", requireAdmin, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body || {};
  const s = store.load();

  if (!currentPassword || !store.verifyPassword(currentPassword, s.admin.salt, s.admin.hash)) {
    return res.status(401).json({ error: { message: "Current password is incorrect." } });
  }
  if (newUsername && newUsername.trim()) {
    s.admin.username = newUsername.trim();
  }
  if (newPassword && newPassword.trim()) {
    const { salt, hash } = store.hashPassword(newPassword.trim());
    s.admin.salt = salt;
    s.admin.hash = hash;
  }
  store.save(s);
  return res.json({ success: true });
});

// =========================================================
// Static assets + page routing
// =========================================================
app.use(express.static(path.join(__dirname, "src", "public"), { index: false }));
app.use("/dashboard", express.static(path.join(__dirname, "src", "dashboard"), { index: false }));

app.get("/", (req, res) => {
  if (Object.prototype.hasOwnProperty.call(req.query, "admin")) {
    const session = getValidSession(req);
    if (session) {
      return res.sendFile(path.join(__dirname, "src", "dashboard", "admin.html"));
    }
    return res.sendFile(path.join(__dirname, "src", "dashboard", "login.html"));
  }
  return res.sendFile(path.join(__dirname, "src", "public", "index.html"));
});

// Local dev server (Vercel imports `app` instead of calling listen)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/?admin  (default admin / admin123 — change this!)`);
  });
}

module.exports = app;
