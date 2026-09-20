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

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Projected savings if this pattern holds</div>
      <div style={styles.projGrid}>
        {LABELS.map((l) => (
          <div key={l.key} style={styles.projCard}>
            <div style={styles.projLabel}>{l.label}</div>
            <div style={styles.projValue}>{currency(summary.projections[l.key], summary.homeCurrency)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
