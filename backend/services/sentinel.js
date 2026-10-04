// --- Forwarding to Sentinel ----------------------------------------------------------
// Sentinel is the separate monitoring service that watches all of Opeyemi's
// projects together (github.com/Yemcel/sentinel). This file sends it a copy
// of Prudence Wallet's security events and admin alerts, so attacks that
// span several projects can be spotted in one place.
//
// Needs two environment variables on Render; without them nothing is sent:
//   SENTINEL_URL    e.g. https://sentinel.<your-subdomain>.workers.dev
//   SENTINEL_TOKEN  this app's ingest token (the same value as in Sentinel's
//                   INGEST_TOKENS, after "prudence-wallet:")
//
// Personal data is reduced before it leaves: emails are partly masked and IP
// addresses are cut to their network (a.b.c.x). Events are batched (up to
// 2 seconds) and sending never blocks or fails a request.

// How much each security event matters to Sentinel. "high" makes Sentinel
// email straight away — kept for things Prudence Wallet doesn't already
// email about itself, to avoid double alerts.
const SEVERITY = {
  login_success: "info",
  signup: "info",
  account_deleted: "info",
  connection_removed: "info",
  login_failed: "low",
  signup_limited: "medium",
  account_locked: "medium",
  ip_locked: "medium",
  jobs_auth_failed: "medium",
};

const MAX_BATCH = 50;
const FLUSH_MS = 2000;
let queue = [];
let timer = null;

function configured() {
  return Boolean(process.env.SENTINEL_URL && process.env.SENTINEL_TOKEN);
}

export function maskIpForSentinel(ip) {
  const s = String(ip || "");
  const v4 = s.replace(/^::ffff:/, "").match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":") + "::x";
  return null;
}

export function maskEmailForSentinel(email) {
  const m = String(email || "").match(/^([^@\s]{1,2})[^@\s]*@([^@\s]+)$/);
  return m ? `${m[1]}***@${m[2]}` : null;
}

export function forwardToSentinel({ type, severity, message = null, email = null, ip = null }) {
  if (!configured()) return;
  queue.push({
    type: String(type).toLowerCase().replace(/[^a-z0-9_.-]/g, "_").slice(0, 50),
    severity: severity || SEVERITY[type] || "info",
    message: message ? String(message).slice(0, 500) : null,
    actor: maskEmailForSentinel(email),
    ip: maskIpForSentinel(ip),
    at: new Date().toISOString(),
  });
  if (queue.length >= MAX_BATCH) return void flushSentinel();
  if (!timer) {
    timer = setTimeout(flushSentinel, FLUSH_MS);
    timer.unref?.();
  }
}

export async function flushSentinel() {
  clearTimeout(timer);
  timer = null;
  const events = queue.splice(0, MAX_BATCH);
  if (!events.length || !configured()) return;
  try {
    const res = await fetch(`${process.env.SENTINEL_URL.replace(/\/$/, "")}/api/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SENTINEL_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(8000),
    });
    // console.warn, not console.error: errors are turned into admin alerts,
    // and Sentinel being unreachable shouldn't email you from both sides.
    if (!res.ok) console.warn(`Sentinel rejected events (${res.status}): ${(await res.text()).slice(0, 200)}`);
  } catch (err) {
    console.warn("Sentinel unreachable:", err.message);
  }
  if (queue.length) flushSentinel();
}
