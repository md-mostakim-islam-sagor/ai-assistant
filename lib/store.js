// lib/store.js
// -----------------------------------------------------------------
// Very small JSON-file "database" for:
//   - admin username/password (hashed)
//   - API key override (set from the admin panel)
//   - login sessions
//   - usage stats (chat calls, image calls, unique users, recent log)
//
// IMPORTANT (read this if deploying to Vercel):
// Vercel's serverless filesystem is READ-ONLY except for /tmp, and /tmp
// is wiped whenever a function "cold starts" on a new instance. That
// means admin-panel changes (API key, password, stats) can disappear
// after a while on Vercel. For a normal VPS / Render / Railway / your
// own server, this file persists normally on disk and survives restarts.
//
// If you need permanent storage on Vercel, swap this file's load()/save()
// for a real database (Vercel KV, Supabase, MongoDB Atlas, etc).
// -----------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function resolveDataDir() {
  const candidates = [path.join(__dirname, "..", "data"), "/tmp"];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) {
      continue;
    }
  }
  return null;
}

const DATA_DIR = resolveDataDir();
const FILE = DATA_DIR ? path.join(DATA_DIR, "settings.json") : null;

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const check = crypto.scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(check);
    const b = Buffer.from(hash);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function defaultSettings() {
  const { salt, hash } = hashPassword("admin123");
  return {
    apiKeyOverride: "",
    admin: { username: "admin", salt, hash },
    sessions: {},
    stats: {
      chatCalls: 0,
      imageCalls: 0,
      uniqueUsers: [],
      recent: [], // { type, detail, time }
    },
  };
}

let memoryCache = null;

function load() {
  if (!FILE) {
    if (!memoryCache) memoryCache = defaultSettings();
    return memoryCache;
  }
  try {
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, "utf8");
      const parsed = JSON.parse(raw);
      // merge with defaults in case of older/partial files
      return { ...defaultSettings(), ...parsed, admin: { ...defaultSettings().admin, ...parsed.admin }, stats: { ...defaultSettings().stats, ...parsed.stats } };
    }
  } catch (e) {
    // fall through to defaults
  }
  const fresh = defaultSettings();
  save(fresh);
  return fresh;
}

function save(data) {
  if (!FILE) {
    memoryCache = data;
    return;
  }
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    memoryCache = data; // read-only fs fallback, keep in memory for this instance
  }
}

function recordApiCall(store, type, detail) {
  if (type === "chat") store.stats.chatCalls += 1;
  if (type === "image") store.stats.imageCalls += 1;
  store.stats.recent.unshift({ type, detail: (detail || "").slice(0, 80), time: new Date().toISOString() });
  store.stats.recent = store.stats.recent.slice(0, 50);
  save(store);
}

function recordUniqueUser(store, uid) {
  if (uid && !store.stats.uniqueUsers.includes(uid)) {
    store.stats.uniqueUsers.push(uid);
    save(store);
  }
}

module.exports = {
  load,
  save,
  hashPassword,
  verifyPassword,
  recordApiCall,
  recordUniqueUser,
};
