import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Encrypts small secrets (a user's PayPal client secret) before they go in
// the database, so a leaked database dump alone doesn't hand out working
// PayPal credentials. AES-256-GCM: authenticated, so a tampered value fails
// to decrypt instead of decrypting to garbage.
//
// The key comes from PAYPAL_CREDENTIALS_KEY (any long random string — it's
// hashed down to the 32 bytes AES-256 needs). Changing or losing it makes
// every stored secret unreadable, and users would have to reconnect PayPal.

function getKey() {
  const raw = process.env.PAYPAL_CREDENTIALS_KEY?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "PAYPAL_CREDENTIALS_KEY is not set (or is shorter than 32 characters) — add a long random value to the backend's environment variables on Render"
    );
  }
  return createHash("sha256").update(raw).digest();
}

// Stored format: v1:<iv>:<auth tag>:<ciphertext>, each part base64.
export function encryptSecret(plainText) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(stored) {
  const [version, iv, tag, data] = String(stored).split(":");
  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Stored PayPal secret is in an unrecognised format — reconnect PayPal");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// Lets the connect route fail fast with a clear message, before contacting
// PayPal, if the server isn't configured to store secrets yet.
export function assertSecretBoxConfigured() {
  getKey();
}
