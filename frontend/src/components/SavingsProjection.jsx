import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { currency } from "../constants/ranks.js";

const LABELS = [
  { key: "1m", label: "1 month", months: 1 },
  { key: "3m", label: "3 months", months: 3 },
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "1 year", months: 12 },
];

const CUT_OPTIONS = [25, 50, 75, 100];
const ACCENT = "#3F6E5B";

export default function SavingsProjection({ summary }) {
  const [cutPct, setCutPct] = useState(100);

  if (!summary) return null;

  const projections = summary.projections || {};
  const baseMonthly = projections["1m"] || 0;
  const hasSavings = baseMonthly > 0;
  const adjustedMonthly = baseMonthly * (cutPct / 100);

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Projected savings if this pattern holds</div>
      {hasSavings ? (
        <>
          <div style={styles.cutToggleRow}>
            <span style={styles.cutToggleLabel}>Cut wasteful &amp; unnecessary spending by</span>
            <div style={styles.cutToggleGroup}>
              {CUT_OPTIONS.map((pct) => {
                const active = pct === cutPct;
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setCutPct(pct)}
                    style={{
                      ...styles.rankChip,
                      background: active ? ACCENT : ACCENT + "11",
                      color: active ? "#FFFFFF" : ACCENT,
                      borderColor: active ? ACCENT : ACCENT + "33",
                    }}
                  >
                    {pct}%
                  </button>
                );
              })}
            </div>
          </div>
          <div style={styles.projGrid}>
            {LABELS.map((l) => (
              <div key={l.key} style={styles.projCard}>
                <div style={styles.projLabel}>{l.label}</div>
                <div style={styles.projValue}>{currency(adjustedMonthly * l.months, summary.homeCurrency)}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ ...styles.card, color: "#6B7280", fontSize: 13 }}>
          No projected savings yet. Rank a few purchases as Leisure, Luxury, a treat, or Wasteful and this section will show what cutting back on them could add up to.
        </div>
      )}
    </section>
  );
}
