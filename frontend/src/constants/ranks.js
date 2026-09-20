// Ordered most → least prudent. Keep in sync with backend/services/ranks.js
export const RANKS = [
  { key: "important", label: "Important", color: "#3F6E5B" },
  { key: "necessary", label: "Necessary", color: "#5C8168" },
  { key: "needed", label: "Needed", color: "#8B9A5B" },
  { key: "leisure", label: "Leisure", color: "#C08A2E" },
  { key: "luxury", label: "Luxury", color: "#BD6A2E" },
  { key: "treat", label: "Once in a while treat", color: "#A8502F" },
  { key: "wasteful", label: "Wasteful", color: "#A83B32" },
];
export const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r.key, i]));

export const TIERS = {
  aggregator: { label: "Bank & card", color: "#3F6E5B", glyph: "⟳" },
  wallet_api: { label: "Wallet", color: "#5C8168", glyph: "⟳" },
  manual: { label: "You added this", color: "#C08A2E", glyph: "✎" },
};

export function currency(n, code = "USD") {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: code });
}
