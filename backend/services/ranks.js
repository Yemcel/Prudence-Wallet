// Ordered most → least prudent. Keep this in sync with frontend/src/constants/ranks.js
export const RANKS = [
  { key: "important", label: "Important" },
  { key: "necessary", label: "Necessary" },
  { key: "needed", label: "Needed" },
  { key: "leisure", label: "Leisure" },
  { key: "luxury", label: "Luxury" },
  { key: "treat", label: "Once in a while treat" },
  { key: "wasteful", label: "Wasteful" },
];

export const REDUCIBLE_KEYS = new Set(["leisure", "luxury", "treat", "wasteful"]);

export function rankKeyFromLabel(label) {
  const found = RANKS.find((r) => r.label.toLowerCase() === String(label || "").toLowerCase());
  return found ? found.key : null;
}
