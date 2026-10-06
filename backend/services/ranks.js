// Ordered most → least prudent. Keep this in sync with frontend/src/constants/ranks.js
// Keys never change (they're what's stored on each transaction); labels are
// what people see. `was` lists earlier labels so old answers and learned
// rules that use them still map to the right tier.
export const RANKS = [
  { key: "important", label: "Essential", means: "must be paid, no real choice (rent, bills, loan repayments)", was: ["Important"] },
  { key: "necessary", label: "Necessary", means: "everyday basics (groceries, commute, toiletries)", was: [] },
  { key: "needed", label: "Worthwhile", means: "good value but could wait or cost less (work tools, a phone upgrade)", was: ["Needed"] },
  { key: "leisure", label: "Leisure", means: "planned enjoyment (eating out, streaming, a gym)", was: [] },
  { key: "luxury", label: "Splurge", means: "a pricey extra on top of the basics (designer items, first class)", was: ["Luxury"] },
  { key: "treat", label: "Impulse", means: "unplanned, bought in the moment (checkout snacks, late-night shopping)", was: ["Once in a while treat", "Treat"] },
  { key: "wasteful", label: "Wasteful", means: "no real value, you'd take it back (unused subscriptions, fines)", was: [] },
];

export const REDUCIBLE_KEYS = new Set(["leisure", "luxury", "treat", "wasteful"]);

export function rankKeyFromLabel(label) {
  const wanted = String(label || "").trim().toLowerCase();
  const found = RANKS.find(
    (r) => r.key === wanted || r.label.toLowerCase() === wanted || r.was.some((w) => w.toLowerCase() === wanted)
  );
  return found ? found.key : null;
}
