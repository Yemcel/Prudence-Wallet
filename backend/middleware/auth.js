import { verifyToken } from "../services/auth.js";

// Attaches req.userId when the request carries a valid bearer token,
// otherwise rejects with 401. Every route that touches per-user data sits
// behind this — see server.js for exactly what's covered (the Plaid webhook
// deliberately is not, since Plaid's servers can't send our token).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in" });

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired — please sign in again" });
  }
}
