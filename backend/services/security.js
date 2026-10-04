import { db } from "../db/init.js";
import { sendToUser } from "./push.js";

// --- Security monitoring ------------------------------------------------------
// Two jobs:
//  1. Throttling: limits failed sign-in attempts per email and per IP address,
//     and sign-ups per IP, so passwords can't be guessed at speed.
//  2. A security event log (security_events table) recording sign-ins,
//     failures, lockouts, deletions and other security-relevant actions, kept
//     for 90 days, so there's evidence to work from in an incident.
// Plus alerts: when something looks like an attack (a lockout, a bad
// scheduled-job secret) the admin gets a push notification. The admin is
// the account whose email matches ADMIN_EMAIL on Render.
//
// To read the log during an incident, open the database's SQL console on
// Turso and run:
//   SELECT * FROM security_events ORDER BY id DESC LIMIT 100;

const WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;
const LIMITS = {
  email: 5, // failed sign-ins for one account
  ip: 20, // failed sign-ins from one address, across any accounts
  signup: 5, // new accounts from one address (per hour, see below)
};
const SIGNUP_WINDOW_MINUTES = 60;
const RETENTION_DAYS = 90;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // at most one alert per subject per hour

// --- Request helpers -------------------------------------------------------------
// Render sits behind Cloudflare, which sets the real client address in
// cf-connecting-ip; fall back to Express's view (trust proxy is on).
export function clientIp(req) {
  return (req.headers["cf-connecting-ip"] || req.headers["true-client-ip"] || req.ip || "unknown").toString().slice(0, 64);
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// --- Event log ----------------------------------------------------------------------
export async function logEvent(event, { userId = null, email = null, ip = null, detail = null } = {}) {
  try {
    await db.run("INSERT INTO security_events (event, user_id, email, ip, detail) VALUES (?, ?, ?, ?, ?)", [
      event,
      userId,
      email,
      ip,
      detail ? String(detail).slice(0, 500) : null,
    ]);
  } catch (err) {
    // Logging must never break the request it's describing.
    console.error("Security log write failed:", err.message);
  }
}

export async function pruneOldEvents() {
  await db.run(`DELETE FROM security_events WHERE created_at < datetime('now', '-${RETENTION_DAYS} days')`);
  await db.run("DELETE FROM auth_throttle WHERE locked_until IS NULL AND window_start < datetime('now', '-1 day')");
}

// --- Throttling -------------------------------------------------------------------------
// Each key ("email:a@b.com", "ip:1.2.3.4", "signup:1.2.3.4") has a failure
// count inside a time window, and a lock time once it goes over its limit.

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

// Returns the number of whole minutes left on the first locked key, or 0.
export async function lockedFor(keys) {
  for (const key of keys) {
    const row = await db.get("SELECT locked_until FROM auth_throttle WHERE key = ?", [key]);
    if (row?.locked_until) {
      const remaining = Date.parse(row.locked_until) - Date.now();
      if (remaining > 0) return Math.ceil(remaining / 60000);
    }
  }
  return 0;
}

// Counts one failure against `key`. Returns true if this pushed it into a lock.
export async function recordFailure(key, limit, windowMinutes = WINDOW_MINUTES) {
  const now = new Date();
  const row = await db.get("SELECT failures, window_start, locked_until FROM auth_throttle WHERE key = ?", [key]);
  const windowOpen = row && Date.parse(row.window_start) > now.getTime() - windowMinutes * 60000;
  const failures = windowOpen ? Number(row.failures) + 1 : 1;
  const windowStart = windowOpen ? row.window_start : now.toISOString();
  const lock = failures >= limit ? minutesFromNow(LOCK_MINUTES) : null;

  await db.run(
    `INSERT INTO auth_throttle (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until`,
    [key, lock ? 0 : failures, lock ? now.toISOString() : windowStart, lock]
  );
  return Boolean(lock);
}

export async function clearFailures(key) {
  await db.run("DELETE FROM auth_throttle WHERE key = ?", [key]);
}

export const throttleKeys = {
  email: (email) => `email:${normalizeEmail(email)}`,
  ip: (ip) => `ip:${ip}`,
  signup: (ip) => `signup:${ip}`,
};

// Records a failed password check for this email + IP, locking either if it
// goes over its limit, and alerting the admin when that happens.
export async function recordFailedSignIn({ email, ip, userId = null, reason }) {
  const normalized = normalizeEmail(email);
  await logEvent("login_failed", { userId, email: normalized, ip, detail: reason });

  const emailLocked = await recordFailure(throttleKeys.email(normalized), LIMITS.email);
  const ipLocked = await recordFailure(throttleKeys.ip(ip), LIMITS.ip);

  if (emailLocked) {
    await logEvent("account_locked", { userId, email: normalized, ip, detail: `${LIMITS.email} failed attempts` });
    alertAdmin(`lock-email:${normalized}`, "Security: account locked", `${LIMITS.email} failed sign-ins for ${normalized} (last from ${ip}). Locked for ${LOCK_MINUTES} minutes.`);
  }
  if (ipLocked) {
    await logEvent("ip_locked", { email: normalized, ip, detail: `${LIMITS.ip} failed attempts across accounts` });
    alertAdmin(`lock-ip:${ip}`, "Security: address blocked", `${LIMITS.ip} failed sign-ins from ${ip} across accounts. Blocked for ${LOCK_MINUTES} minutes.`);
  }
}

// Returns true if this address may create another account right now.
export async function allowSignup(ip) {
  if ((await lockedFor([throttleKeys.signup(ip)])) > 0) return false;
  const locked = await recordFailure(throttleKeys.signup(ip), LIMITS.signup + 1, SIGNUP_WINDOW_MINUTES);
  if (locked) {
    await logEvent("signup_limited", { ip, detail: `more than ${LIMITS.signup} sign-ups in an hour` });
    alertAdmin(`signup:${ip}`, "Security: sign-up limit hit", `More than ${LIMITS.signup} accounts created from ${ip} within an hour.`);
    return false;
  }
  return true;
}

export function lockMessage(minutes) {
  return `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

// --- Admin alerts -------------------------------------------------------------------------
const lastAlert = new Map();

// Fire-and-forget push to the admin account; never blocks or fails a request.
export function alertAdmin(subject, title, body) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  if (!adminEmail) return;
  const last = lastAlert.get(subject) || 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return;
  lastAlert.set(subject, Date.now());

  (async () => {
    const admin = await db.get("SELECT id FROM users WHERE email = ?", [adminEmail]);
    if (admin) await sendToUser(admin.id, null, { title, body, tag: `security-${subject}`, url: "/" });
  })().catch((err) => console.error("Security alert failed:", err.message));
}
