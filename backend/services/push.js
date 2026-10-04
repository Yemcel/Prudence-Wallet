import webpush from "web-push";
import { db } from "../db/init.js";
import { RANKS } from "./ranks.js";
import { convert, ensureFreshRates, getHomeCurrency } from "./fx.js";

// --- Web Push ----------------------------------------------------------------
// Standard browser push (the same mechanism the PWA and the Play Store app
// both use). Needs a VAPID key pair in the environment:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — generate once with
//                                          `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                        — a contact address the push services
//                                          can reach you at, e.g.
//                                          mailto:you@example.com
// Without them the app still runs; it just doesn't send anything.

export const NOTIFICATION_KINDS = ["nudges", "weekly", "daily"];

// Dates in this app are calendar days as the user lived them. The app is
// UK-first, so "today" and "this week" are worked out in London time.
const APP_TIMEZONE = "Europe/London";

let configured = null;
function isConfigured() {
  if (configured !== null) return configured;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@prudencewallet.com";
  if (!publicKey || !privateKey) {
    console.warn("Push notifications disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set");
    configured = false;
  } else {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return configured;
}

export function getPublicKey() {
  return isConfigured() ? process.env.VAPID_PUBLIC_KEY.trim() : null;
}

// --- Preferences -------------------------------------------------------------
export async function getPrefs(userId) {
  const row = await db.get("SELECT nudges, weekly, daily FROM notification_prefs WHERE user_id = ?", [userId]);
  return {
    nudges: row ? Boolean(Number(row.nudges)) : true,
    weekly: row ? Boolean(Number(row.weekly)) : true,
    daily: row ? Boolean(Number(row.daily)) : true,
  };
}

export async function setPrefs(userId, changes) {
  const next = { ...(await getPrefs(userId)) };
  for (const kind of NOTIFICATION_KINDS) {
    if (typeof changes[kind] === "boolean") next[kind] = changes[kind];
  }
  await db.run(
    `INSERT INTO notification_prefs (user_id, nudges, weekly, daily) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET nudges = excluded.nudges, weekly = excluded.weekly, daily = excluded.daily`,
    [userId, next.nudges ? 1 : 0, next.weekly ? 1 : 0, next.daily ? 1 : 0]
  );
  return next;
}

// --- Subscriptions -----------------------------------------------------------
export async function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error("Invalid push subscription");
  // The same device can sign into a different account — the newest owner wins.
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [userId, endpoint, keys.p256dh, keys.auth]
  );
}

export async function removeSubscription(userId, endpoint) {
  await db.run("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?", [userId, endpoint]);
}

// --- Sending -------------------------------------------------------------------
// payload: { title, body, url?, tag? }. `kind` (one of NOTIFICATION_KINDS, or
// null for a test) is checked against the user's preferences first.
export async function sendToUser(userId, kind, payload) {
  if (!isConfigured()) return { sent: 0, skipped: "not-configured" };
  if (kind && !(await getPrefs(userId))[kind]) return { sent: 0, skipped: "turned-off" };

  const subs = await db.all("SELECT * FROM push_subscriptions WHERE user_id = ?", [userId]);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ url: "/", ...payload }),
        { TTL: 60 * 60 * 12 } // drop it if the device stays offline for 12 hours
      );
      sent += 1;
    } catch (err) {
      // 404/410 = the browser has thrown this subscription away (app
      // uninstalled, permission revoked). Forget it so we stop trying.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.run("DELETE FROM push_subscriptions WHERE id = ?", [sub.id]);
      } else {
        console.error(`Push to subscription ${sub.id} failed:`, err.statusCode || "", err.body || err.message);
      }
    }
  }
  return { sent };
}

// Fire-and-forget wrapper for places (like a new nudge) where a failed push
// must never break the request that triggered it.
export function notifyInBackground(userId, kind, payload) {
  sendToUser(userId, kind, payload).catch((err) => console.error("Push failed:", err.message));
}

// --- Scheduled messages ----------------------------------------------------------
function londonDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(date); // YYYY-MM-DD
}

// Monday..Sunday (YYYY-MM-DD) of the London week containing `date`.
function londonWeek(date = new Date()) {
  const today = londonDate(date);
  const [y, m, d] = today.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (asUtc.getUTCDay() + 6) % 7;
  const monday = new Date(asUtc.getTime() - mondayOffset * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function money(amount, currency) {
  try {
    return amount.toLocaleString("en-GB", { style: "currency", currency });
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Users who could receive a `kind` message: at least one device subscribed
// and that kind not switched off.
async function recipients(kind) {
  const rows = await db.all(
    `SELECT DISTINCT s.user_id FROM push_subscriptions s
     LEFT JOIN notification_prefs p ON p.user_id = s.user_id
     WHERE p.user_id IS NULL OR p.${kind} = 1`
  );
  return rows.map((r) => r.user_id);
}

// Evening reminder. Only sent when there's something to do: nothing logged
// today, and/or purchases still waiting to be ranked — a daily ping that
// says nothing useful is how people end up switching notifications off.
export async function buildDailyReminder(userId, now = new Date()) {
  const today = londonDate(now);
  const loggedToday = Number(
    (await db.get("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND date = ?", [userId, today])).n
  );
  const unranked = Number((await db.get("SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND rank IS NULL", [userId])).n);

  const waiting = unranked === 1 ? "1 purchase is waiting to be ranked" : `${unranked} purchases are waiting to be ranked`;
  let body = null;
  if (loggedToday === 0 && unranked > 0) body = `Nothing logged today yet, and ${waiting}.`;
  else if (loggedToday === 0) body = "Nothing logged today yet. Add today's spending while you still remember it.";
  else if (unranked > 0) body = `${waiting.charAt(0).toUpperCase()}${waiting.slice(1)}.`;
  if (!body) return null;
  return { title: "Prudence Wallet", body, tag: "daily-reminder", url: "/" };
}

export async function buildWeeklySummary(userId, now = new Date()) {
  const { start, end } = londonWeek(now);
  const homeCurrency = await getHomeCurrency(userId);
  const rows = await db.all("SELECT amount, currency, rank FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?", [
    userId,
    start,
    end,
  ]);

  if (rows.length === 0) {
    return {
      title: "Your week",
      body: "No spending logged this week. If that's not quite right, add what you spent so next week's picture is honest.",
      tag: "weekly-summary",
      url: "/",
    };
  }

  const byRank = {};
  let total = 0;
  for (const t of rows) {
    const value = convert(Number(t.amount), t.currency, homeCurrency);
    total += value;
    const key = t.rank || "unranked";
    byRank[key] = (byRank[key] || 0) + value;
  }

  const parts = [`${money(total, homeCurrency)} across ${rows.length} ${rows.length === 1 ? "purchase" : "purchases"}`];
  parts.push(byRank.wasteful ? `${money(byRank.wasteful, homeCurrency)} of it Wasteful` : "nothing Wasteful");
  if (byRank.unranked) parts.push(`${money(byRank.unranked, homeCurrency)} still to rank`);

  const biggest = RANKS.map((r) => ({ label: r.label, value: byRank[r.key] || 0 })).sort((a, b) => b.value - a.value)[0];
  const tail = biggest.value > 0 ? ` Biggest category: ${biggest.label}.` : "";

  return { title: "Your week", body: `This week: ${parts.join(", ")}.${tail}`, tag: "weekly-summary", url: "/" };
}

// Runs one scheduled job for every eligible user. Returns counts for the log.
export async function runScheduledJob(job, now = new Date()) {
  const kind = job === "daily-reminder" ? "daily" : job === "weekly-summary" ? "weekly" : null;
  if (!kind) throw new Error(`Unknown job "${job}"`);
  if (!isConfigured()) return { job, users: 0, sent: 0, skipped: "not-configured" };
  if (kind === "weekly") await ensureFreshRates();

  const users = await recipients(kind);
  let sent = 0;
  let nothingToSay = 0;
  for (const userId of users) {
    try {
      const payload = kind === "daily" ? await buildDailyReminder(userId, now) : await buildWeeklySummary(userId, now);
      if (!payload) {
        nothingToSay += 1;
        continue;
      }
      sent += (await sendToUser(userId, kind, payload)).sent;
    } catch (err) {
      console.error(`${job} failed for user ${userId}:`, err.message);
    }
  }
  return { job, users: users.length, sent, nothingToSay };
}
