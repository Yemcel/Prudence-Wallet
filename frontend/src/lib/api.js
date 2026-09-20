const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method || "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export const api = {
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
