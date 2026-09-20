import React from "react";
import { styles } from "../styles/theme.js";
import { RANKS, currency } from "../constants/ranks.js";

export default function SpectrumBar({ summary }) {
  if (!summary) return null;
  const { byRank, total } = summary;

  return (
    <section style={{ ...styles.card, marginBottom: 22 }}>
      <div style={styles.spectrumLabelRow}>
        <span>Important</span>
        <span>Wasteful</span>
      </div>
      <div style={styles.spectrumBar}>
        {RANKS.map((r) => {
          const amt = byRank[r.key] || 0;
          const pct = total ? (amt / total) * 100 : 0;
          if (pct === 0) return null;
          return <div key={r.key} title={`${r.label}: ${currency(amt, summary.homeCurrency)}`} style={{ width: `${pct}%`, background: r.color }} />;
        })}
      </div>
    </section>
  );
}
