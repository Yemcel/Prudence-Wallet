import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, claimOrphanedDataForFirstUser, deleteAllUserData } from "../db/init.js";
import { hashPassword, verifyPassword, signToken } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";

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

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.get("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) return res.status(409).json({ error: "An account with that email already exists" });

    const id = randomUUID();
    const passwordHash = await hashPassword(password);
    await db.run("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [id, normalizedEmail, passwordHash]);

    // First account ever created inherits whatever demo/test data was
    // already here before auth shipped. Everyone who signs up after gets a
    // genuinely empty wallet — see the function for why this matters.
    await claimOrphanedDataForFirstUser(id);

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

    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.get("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    if (!user) return res.status(401).json({ error: "Incorrect email or password" });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Incorrect email or password" });

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

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Incorrect password" });

    await deleteAllUserData(req.userId);
    res.json({ ok: true });
  } catch (err) {
    console.error("Account deletion failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});
