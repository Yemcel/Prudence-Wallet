import React from "react";
import { styles } from "../styles/theme.js";
import { TIERS } from "../constants/ranks.js";

export default function ConnectionsPanel({ accounts }) {
  if (!accounts || accounts.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div>
        {accounts.map((a) => (
          <div key={a.id} style={styles.connectRow}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIERS[a.tier].color, flexShrink: 0 }} />
            <div style={styles.connectMain}>
              <div style={styles.connectName}>{a.name}</div>
              <div style={styles.connectSub}>{a.note}</div>
            </div>
            <span style={a.tier === "manual" ? styles.connectStatusManual : styles.connectStatusOk}>
              {a.tier === "manual" ? "Manual" : "Connected"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
