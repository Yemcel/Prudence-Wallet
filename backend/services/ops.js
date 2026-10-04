import { db } from "../db/init.js";
import { sendEmail, mailerConfigured } from "./mailer.js";

// --- Admin alerting ---------------------------------------------------------------
// Emails the app's operator (ADMIN_EMAIL) about things that need attention:
//   security     — lockouts, blocked addresses, rejected job calls
//   error        — server errors and crashes
//   integration  — PayPal / Plaid / exchange-rate / push delivery failures
//   job          — scheduled job runs and failures
// Every alert is also stored in ops_events (30 days) for the daily digest.
//
// To avoid floods: the same alert (same `key`) is emailed at most once an
// hour, alerts arriving close together are batched into one email a minute
// later, and no more than DAILY_EMAIL_CAP alert emails go out per day. Anything
// held back still appears in the next daily digest.

// --- Personal data in outgoing alerts ----------------------------------------------
// Alert emails and the digest pass through the email provider, so email
// addresses and IP addresses are partly masked there. The full values stay
// only in the database (security_events / ops_events) for investigation.
//   yemcel@duck.com → ye***@duck.com      81.2.69.142 → 81.2.x.x
export function maskPII(text) {
  return String(text ?? "")
    .replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, "$1***@$2")
    .replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, "$1.$2.x.x")
    .replace(/\b([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})(?::[0-9a-fA-F]{0,4}){2,7}\b/g, "$1:$2:x:x");
}

const DEDUPE_MS = 60 * 60 * 1000;
const BATCH_DELAY_MS = 60 * 1000;
const DAILY_EMAIL_CAP = 25;
const RETENTION_DAYS = 30;

// The real console.error, kept before captureConsoleErrors() wraps it, so
// this file's own failures never loop back into alerts.
const rawError = console.error.bind(console);

const lastSent = new Map();
let pending = [];
let flushTimer = null;
let sentToday = { day: "", count: 0 };

function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim() || null;
}

async function record(category, title, body) {
  try {
    await db.run("INSERT INTO ops_events (category, title, body) VALUES (?, ?, ?)", [
      category,
      String(title).slice(0, 200),
      body ? String(body).slice(0, 2000) : null,
    ]);
  } catch (err) {
    rawError("ops_events write failed:", err.message);
  }
}

// category: security | error | integration | job.  key: dedupe key.
// email: false = record for the digest only.
export function notifyAdmin({ category, title, body = "", key = title, email = true }) {
  record(category, title, body);
  if (!email) return;

  const now = Date.now();
  if (now - (lastSent.get(key) || 0) < DEDUPE_MS) return;
  lastSent.set(key, now);

  pending.push({ category, title, body, at: new Date() });
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch((err) => rawError("Admin alert email failed:", err.message));
    }, BATCH_DELAY_MS);
    flushTimer.unref?.();
  }
}

export async function flush() {
  const items = pending;
  pending = [];
  if (items.length === 0) return { sent: false };

  const to = adminEmail();
  if (!to || !mailerConfigured()) return { sent: false, skipped: "not-configured" };

  const day = new Date().toISOString().slice(0, 10);
  if (sentToday.day !== day) sentToday = { day, count: 0 };
  if (sentToday.count >= DAILY_EMAIL_CAP) return { sent: false, skipped: "daily-cap" };
  sentToday.count += 1;

  const counts = items.reduce((acc, i) => ({ ...acc, [i.category]: (acc[i.category] || 0) + 1 }), {});
  const subject =
    items.length === 1
      ? `[Prudence Wallet] ${items[0].title}`
      : `[Prudence Wallet] ${items.length} alerts — ${Object.entries(counts)
          .map(([c, n]) => `${c} ${n}`)
          .join(", ")}`;

  const lines = items.map(
    (i) => `• [${i.category}] ${i.title}  (${i.at.toISOString().replace("T", " ").slice(0, 19)} UTC)${i.body ? `\n  ${i.body.replace(/\n/g, "\n  ")}` : ""}`
  );
  const footer =
    sentToday.count === DAILY_EMAIL_CAP
      ? "\n\nDaily alert email limit reached — further alerts today will only appear in tomorrow's digest."
      : "";

  await sendEmail({
    to,
    subject: maskPII(subject),
    text: maskPII(`${lines.join("\n\n")}\n\nThe same alert is sent at most once an hour. Full history (unmasked): ops_events and security_events tables in Turso.${footer}`),
  });
  return { sent: true, items: items.length };
}

// --- Error capture -------------------------------------------------------------------------
// Every console.error in the backend also becomes an "error" alert, so
// failures logged anywhere (routes, sync jobs, push sends) reach the admin
// without each one being wired up by hand.
export function captureConsoleErrors() {
  console.error = (...args) => {
    rawError(...args);
    const text = args
      .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ")
      .slice(0, 1500);
    const lines = text.split("\n");
    const firstLine = lines[0].slice(0, 160);
    // The message plus the top of any stack trace is enough to find the spot;
    // full traces are in Render's logs.
    const body = lines.slice(0, 5).join("\n");
    notifyAdmin({ category: "error", title: firstLine, body, key: `err:${firstLine.slice(0, 80)}` });
  };
}

// Express middleware: any response with a 5xx status is an alert, even when
// the route handled the error itself and nothing was logged.
export function trackServerErrors(req, res, next) {
  res.on("finish", () => {
    if (res.statusCode < 500) return;
    const path = (req.originalUrl || req.url).split("?")[0];
    // Group /api/accounts/<id>-style paths together for de-duplication.
    const shape = path
      .split("/")
      .map((seg) => (/\d/.test(seg) && seg.length > 6 ? ":id" : seg))
      .join("/");
    notifyAdmin({
      category: "error",
      title: `${req.method} ${shape} returned ${res.statusCode}`,
      key: `http:${req.method}:${shape}:${res.statusCode}`,
    });
  });
  next();
}

export async function pruneOpsEvents() {
  await db.run(`DELETE FROM ops_events WHERE created_at < datetime('now', '-${RETENTION_DAYS} days')`);
}

// --- Daily digest -----------------------------------------------------------------------------
async function count(sql, args = []) {
  const row = await db.get(sql, args);
  return Number(row?.n || 0);
}

export async function buildDigest() {
  const since = "datetime('now', '-1 day')";
  const sec = (event) => count(`SELECT COUNT(*) AS n FROM security_events WHERE event = ? AND created_at >= ${since}`, [event]);

  const stats = {
    users: await count("SELECT COUNT(*) AS n FROM users"),
    signups: await sec("signup"),
    activeUsers: await count(
      `SELECT COUNT(DISTINCT user_id) AS n FROM security_events WHERE event = 'login_success' AND created_at >= ${since}`
    ),
    purchases: await count(`SELECT COUNT(*) AS n FROM transactions WHERE created_at >= ${since}`),
    failedLogins: await sec("login_failed"),
    lockouts: (await sec("account_locked")) + (await sec("ip_locked")),
    signupLimited: await sec("signup_limited"),
    jobAuthFailed: await sec("jobs_auth_failed"),
    deletions: await sec("account_deleted"),
    removedConnections: await sec("connection_removed"),
    devices: await count("SELECT COUNT(*) AS n FROM push_subscriptions"),
  };

  const problems = await db.all(
    `SELECT category, title, COUNT(*) AS n, MAX(created_at) AS last FROM ops_events
     WHERE category IN ('error', 'integration') AND created_at >= ${since}
     GROUP BY category, title ORDER BY n DESC LIMIT 10`
  );
  const jobs = await db.all(`SELECT title, created_at FROM ops_events WHERE category = 'job' AND created_at >= ${since} ORDER BY id`);

  const securityFlags = stats.lockouts + stats.signupLimited + stats.jobAuthFailed;
  const headline =
    problems.length === 0 && securityFlags === 0 ? "All quiet" : `${problems.length} problem type(s), ${securityFlags} security flag(s)`;

  const text = [
    `Prudence Wallet — last 24 hours (${headline})`,
    "",
    "ACTIVITY",
    `  Total users: ${stats.users}  (new: ${stats.signups})`,
    `  Users who signed in: ${stats.activeUsers}`,
    `  Purchases added: ${stats.purchases}`,
    `  Accounts deleted: ${stats.deletions}`,
    `  Connections removed: ${stats.removedConnections}`,
    `  Devices with notifications on: ${stats.devices}`,
    "",
    "SECURITY",
    `  Failed sign-ins: ${stats.failedLogins}`,
    `  Lockouts (accounts + addresses): ${stats.lockouts}`,
    `  Sign-up limit hit: ${stats.signupLimited}`,
    `  Rejected job calls: ${stats.jobAuthFailed}`,
    "",
    "ERRORS AND INTEGRATION FAILURES",
    ...(problems.length
      ? problems.map((p) => `  ${Number(p.n)}× [${p.category}] ${p.title}  (last ${p.last} UTC)`)
      : ["  None"]),
    "",
    "SCHEDULED JOBS",
    ...(jobs.length ? jobs.map((j) => `  ${j.created_at} UTC  ${j.title}`) : ["  No runs recorded"]),
  ].join("\n");

  return { subject: `[Prudence Wallet] Daily digest — ${headline}`, text, stats };
}

export async function sendDigest() {
  const to = adminEmail();
  const digest = await buildDigest();
  if (!to || !mailerConfigured()) return { sent: false, skipped: "not-configured", stats: digest.stats };
  await sendEmail({ to, subject: digest.subject, text: maskPII(digest.text) });
  return { sent: true, stats: digest.stats };
}
