const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "prudence_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage unavailable (private browsing, etc.) — session just won't persist across reloads
  }
}

export class AuthError extends Error {}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    // A 401 only means "your session expired" when we actually sent a token
    // that got rejected. Login itself also returns 401 for a plain wrong
    // password — with no token on the request, that's not an expired
    // session, so surface the server's real message instead of overwriting
    // it with a "session expired" text that makes no sense on a first sign-in.
    if (token) {
      setToken(null);
      throw new AuthError("Your session has expired — please sign in again");
    }
    let message = "Incorrect email or password";
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response wasn't JSON — fall back to the generic message above
    }
    throw new Error(message);
  }

  if (!res.ok) {
    let message = `${options.method || "GET"} ${path} failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // response wasn't JSON — fall back to the generic message above
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  signup: async (email, password) => {
    const result = await request("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(result.token);
    return result;
  },
  login: async (email, password) => {
    const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setToken(result.token);
    return result;
  },
  me: () => request("/api/auth/me"),
  logout: () => setToken(null),
  deleteAccount: (password) =>
    request("/api/auth/me", { method: "DELETE", body: JSON.stringify({ password }) }),

  getTransactions: () => request("/api/transactions"),
  getPending: () => request("/api/transactions/pending"),
  getSummary: () => request("/api/transactions/summary"),
  getAccounts: () => request("/api/accounts"),
  getLearnedRules: () => request("/api/coach/rules"),

  addManualTransaction: (payload) =>
    request("/api/transactions/manual", { method: "POST", body: JSON.stringify(payload) }),

  classify: (transactionId, answer) =>
    request("/api/coach/classify", { method: "POST", body: JSON.stringify({ transactionId, answer }) }),

  setRank: (transactionId, rank, rankSource = "user_override") =>
    request(`/api/transactions/${transactionId}/rank`, {
      method: "PATCH",
      body: JSON.stringify({ rank, rankSource }),
    }),

  getPlaidLinkToken: () => request("/api/plaid/link-token"),
  exchangePlaidPublicToken: (publicToken) =>
    request("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ publicToken }) }),
  syncPlaid: () => request("/api/plaid/sync", { method: "POST" }),

  connectPaypal: (payload) => request("/api/paypal/connect", { method: "POST", body: JSON.stringify(payload) }),
  syncPaypal: () => request("/api/paypal/sync", { method: "POST" }),

  getNudges: () => request("/api/nudges"),
  dismissNudge: (id) => request(`/api/nudges/${id}/dismiss`, { method: "PATCH" }),

  getSettings: () => request("/api/settings"),
  updateSettings: (payload) => request("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),
};
