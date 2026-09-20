import React from "react";
import { styles } from "../styles/theme.js";
import { TIERS } from "../constants/ranks.js";

export default function CoverageCard({ summary, onAddManual }) {
  if (!summary) return null;
  const { trackedPct, byTier, total } = summary;
  const pct = (key) => (total ? (byTier[key] / total) * 100 : 0);

  return (
    <section style={{ ...styles.card, marginBottom: 22 }}>
      <div style={styles.coverageTop}>
        <div>
          <div style={styles.coveragePct}>{trackedPct}%</div>
          <div style={styles.coverageLabel}>tracked automatically</div>
        </div>
        <button style={styles.addBtn} onClick={onAddManual}>+ Add manual spend</button>
      </div>
      <div style={styles.coverageBar}>
        <div style={{ width: `${pct("aggregator")}%`, background: TIERS.aggregator.color }} />
        <div style={{ width: `${pct("wallet_api")}%`, background: TIERS.wallet_api.color, opacity: 0.75 }} />
        <div style={{ width: `${pct("manual")}%`, background: TIERS.manual.color }} />
      </div>
    </section>
  );
}
