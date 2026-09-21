import React from "react";
import { styles } from "../styles/theme.js";
import { currency } from "../constants/ranks.js";

const LABELS = [
  { key: "1m", label: "1 month" },
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "1 year" },
];

export default function SavingsProjection({ summary }) {
  if (!summary) return null;

  const projections = summary.projections || {};
  const hasSavings = LABELS.some((l) => (projections[l.key] || 0) > 0);

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Projected savings if this pattern holds</div>
      {hasSavings ? (
        <div style={styles.projGrid}>
          {LABELS.map((l) => (
            <div key={l.key} style={styles.projCard}>
              <div style={styles.projLabel}>{l.label}</div>
              <div style={styles.projValue}>{currency(projections[l.key] || 0, summary.homeCurrency)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...styles.card, color: "#6B7280", fontSize: 13 }}>
          No projected savings yet. Rank a few purchases as Leisure, Luxury, a treat, or Wasteful and this section will show what cutting back on them could add up to.
        </div>
      )}
    </section>
  );
}
