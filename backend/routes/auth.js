import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, claimOrphanedDataForFirstUser } from "../db/init.js";
import { hashPassword, verifyPassword, signToken } from "../services/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

authRouter.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address" });
  if (!password || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(id, normalizedEmail, passwordHash);

  // First account ever created inherits whatever demo/test data was already
  // here before auth shipped. Everyone who signs up after gets a genuinely
  // empty wallet — see the function for why this matters.
  claimOrphanedDataForFirstUser(id);

  const token = signToken(id);
  res.status(201).json({ token, user: { id, email: normalizedEmail } });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || !password) return res.status(400).json({ error: "Email and password are required" });

  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  if (!user) return res.status(401).json({ error: "Incorrect email or password" });

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Incorrect email or password" });

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email } });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});
