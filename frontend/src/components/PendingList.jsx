import React from "react";
import { styles } from "../styles/theme.js";
import { TIERS, currency } from "../constants/ranks.js";

export default function PendingList({ pending, onOpenCoach }) {
  if (!pending || pending.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Needs a quick word from you ({pending.length})</div>
      <div style={styles.pendingList}>
        {pending.map((t) => {
          const tier = TIERS[t.tier];
          return (
            <button key={t.id} style={styles.pendingCard} onClick={() => onOpenCoach(t)}>
              <div style={{ ...styles.tierGlyph, color: tier.color }}>{tier.glyph}</div>
              <div style={{ flex: 1 }}>
                <div style={styles.pendingMerchant}>{t.merchant}</div>
                <div style={styles.pendingMeta}>
                  {t.date}
                  {t.time ? ` · ${t.time}` : ""} · {t.account_name}
                </div>
              </div>
              <div style={styles.pendingAmount}>
                {currency(t.amount, t.currency)}
                {t.home_currency && t.currency !== t.home_currency && (
                  <div style={{ fontSize: 10, color: "#8B95A5", fontWeight: 400 }}>
                    ≈ {currency(t.amount_home, t.home_currency)}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
