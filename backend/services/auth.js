import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";

const scrypt = promisify(scryptCallback);

// --- Password hashing -------------------------------------------------
// Node's built-in scrypt rather than adding bcrypt as a dependency — no
// native compilation step, which keeps Render's build simple and fast.
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hashHex] = (stored || "").split(":");
  if (!salt || !hashHex) return false;
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(hashHex, "hex");
  if (storedBuffer.length !== derivedKey.length) return false;
  return timingSafeEqual(storedBuffer, derivedKey);
}

// --- Sessions (JWT bearer tokens) --------------------------------------
// Bearer tokens rather than cookies — frontend and backend are on different
// Render services/subdomains, so a cross-site cookie would need
// SameSite=None + Secure and CORS credential plumbing for no real benefit
// here.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set — add it to backend/.env locally and to the backend service's environment variables on Render"
    );
  }
  return secret;
}

export function signToken(userId) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: "30d" });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret()); // throws if invalid/expired
}
