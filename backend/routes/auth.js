import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, claimOrphanedDataForFirstUser, deleteAllUserData } from "../db/init.js";
import { hashPassword, verifyPassword, signToken } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";
import {
  clientIp,
  normalizeEmail,
  logEvent,
  lockedFor,
  recordFailedSignIn,
  clearFailures,
  throttleKeys,
  allowSignup,
  lockMessage,
} from "../services/security.js";

export const authRouter = Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Every handler below is wrapped in try/catch so a thrown error (e.g.
// JWT_SECRET missing) turns into a normal JSON error response instead of an
// unhandled promise rejection — which, left uncaught, crashes the whole
// Node process rather than just failing this one request.

authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
    if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

    const normalizedEmail = normalizeEmail(email);
    const ip = clientIp(req);
    if (!(await allowSignup(ip))) {
      return res.status(429).json({ error: "Too many new accounts from this network. Please try again later." });
    }

    const existing = await db.get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) return res.status(409).json({ error: "An account with that email already exists" });

    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    await db.run("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [id, normalizedEmail, passwordHash]);

    // First account ever created inherits whatever demo/test data was
    // already here before auth shipped. Everyone who signs up after gets a
    // genuinely empty wallet — see the function for why this matters.
    await claimOrphanedDataForFirstUser(id);

    await logEvent("signup", { userId: id, email: normalizedEmail, ip });
    const token = signToken(id);
    res.status(201).json({ token, user: { id, email: normalizedEmail } });
  } catch (err) {
    console.error("Signup failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!isValidEmail(email) || !password) return res.status(400).json({ error: "Email and password are required" });

    const normalizedEmail = normalizeEmail(email);
    const ip = clientIp(req);

    // Checked before the password, and for unknown emails too, so a lock
    // can't be used to tell which emails have accounts.
    const wait = await lockedFor([throttleKeys.email(normalizedEmail), throttleKeys.ip(ip)]);
    if (wait) {
      await logEvent("login_blocked", { email: normalizedEmail, ip, detail: `locked, ${wait} min left` });
      return res.status(429).json({ error: lockMessage(wait) });
    }

    const user = await db.get("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    const valid = user ? await verifyPassword(password, user.password_hash) : false;
    if (!valid) {
      await recordFailedSignIn({ email: normalizedEmail, ip, userId: user?.id || null, reason: user ? "wrong password" : "unknown email" });
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    await clearFailures(throttleKeys.email(normalizedEmail));
    await logEvent("login_success", { userId: user.id, email: normalizedEmail, ip });
    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("Login failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await db.get("SELECT id, email FROM users WHERE id = ?", [req.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Password-confirmed account + data deletion — see deleteAllUserData for why
// this exists and how it stays FK-safe.
authRouter.delete("/me", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Enter your password to confirm" });

    const user = await db.get("SELECT * FROM users WHERE id = ?", [req.userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ip = clientIp(req);
    const wait = await lockedFor([throttleKeys.email(user.email), throttleKeys.ip(ip)]);
    if (wait) return res.status(429).json({ error: lockMessage(wait) });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      // Counts towards the same lock as sign-in, so a stolen session can't
      // be used to guess the password here instead.
      await recordFailedSignIn({ email: user.email, ip, userId: user.id, reason: "wrong password on account deletion" });
      // 403, not 401: the app treats a 401 as "session expired" and signs
      // the user out, which would be confusing after a simple typo.
      return res.status(403).json({ error: "Incorrect password" });
    }

    await deleteAllUserData(req.userId);
    // Kept in the security log (90 days) as a record that the deletion happened.
    await logEvent("account_deleted", { userId: user.id, email: user.email, ip });
    res.json({ ok: true });
  } catch (err) {
    console.error("Account deletion failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});
