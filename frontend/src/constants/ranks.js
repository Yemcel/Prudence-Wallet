// Ordered most → least prudent. Keep in sync with backend/services/ranks.js
export const RANKS = [
  { key: "important", label: "Essential", means: "Must be paid, no real choice", color: "#3F6E5B" },
  { key: "necessary", label: "Necessary", means: "Everyday basics", color: "#5C8168" },
  { key: "needed", label: "Worthwhile", means: "Good value, but could wait or cost less", color: "#8B9A5B" },
  { key: "leisure", label: "Leisure", means: "Planned enjoyment", color: "#C08A2E" },
  { key: "luxury", label: "Splurge", means: "A pricey extra on top of the basics", color: "#BD6A2E" },
  { key: "treat", label: "Impulse", means: "Unplanned, bought in the moment", color: "#A8502F" },
  { key: "wasteful", label: "Wasteful", means: "No real value, you'd take it back", color: "#A83B32" },
];
export const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r.key, i]));
export const rankLabel = (key) => RANKS.find((r) => r.key === key)?.label || key;

// Quick answers for "what was that for?" — tap to add, then edit or send.
export const PURPOSE_SUGGESTIONS = [
  "Rent or bills",
  "Groceries",
  "Getting to work",
  "Work or study",
  "Health",
  "Family or kids",
  "A gift",
  "Eating out",
  "Night out",
  "Hobby",
  "Subscription",
  "Saw it and wanted it",
  "Didn't really need it",
];

export const TIERS = {
  aggregator: { label: "Bank & card", color: "#3F6E5B", glyph: "⟳" },
  wallet_api: { label: "Wallet", color: "#5C8168", glyph: "⟳" },
  manual: { label: "You added this", color: "#C08A2E", glyph: "✎" },
};

export function currency(n, code = "USD") {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: code });
}

// Short form for tight spaces (chart centres, small cards): 988.7K, 11.9M.
// Amounts under 10,000 are shown in full.
export function currencyCompact(n, code = "USD") {
  const value = Number(n);
  if (Math.abs(value) < 10000) return currency(value, code);
  return value.toLocaleString("en-US", { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 });
}
