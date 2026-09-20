import React from "react";
import { currency } from "../constants/ranks.js";

const styles = {
  section: { marginBottom: 24 },
  card: {
    background: "#FFF7EC",
    border: "1px solid #C08A2E55",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 8,
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  icon: { fontSize: 16, lineHeight: 1, marginTop: 1 },
  main: { flex: 1 },
  merchant: { fontSize: 12.5, fontWeight: 600, color: "#8A5A1E", marginBottom: 3 },
  message: { fontSize: 13.5, color: "#3B2E1A", lineHeight: 1.45 },
  dismiss: {
    background: "none",
    border: "none",
    color: "#A8862F",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
    padding: "2px 4px",
  },
};

export default function NudgeBanner({ nudges, onDismiss }) {
  if (!nudges || nudges.length === 0) return null;

  return (
    <section style={styles.section}>
      {nudges.map((n) => (
        <div key={n.id} style={styles.card}>
          <div style={styles.icon}>⚡</div>
          <div style={styles.main}>
            <div style={styles.merchant}>
              {n.merchant} · {currency(n.amount, n.currency)}
            </div>
            <div style={styles.message}>{n.message}</div>
          </div>
          <button style={styles.dismiss} onClick={() => onDismiss(n.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
