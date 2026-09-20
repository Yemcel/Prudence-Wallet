import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { RANKS, RANK_INDEX, TIERS, currency } from "../constants/ranks.js";

export default function TransactionList({ transactions, onOverrideRank }) {
  const [openMenuId, setOpenMenuId] = useState(null);

  if (!transactions || transactions.length === 0) return null;

  return (
    <section>
      <div style={styles.sectionHeading}>Ranked</div>
      <div style={styles.list}>
        {transactions.map((t) => {
          const rank = RANKS[RANK_INDEX[t.rank]];
          const tier = TIERS[t.tier];
          if (!rank) return null;
          return (
            <div key={t.id} style={styles.row}>
              <div style={{ ...styles.tierGlyph, color: tier.color }}>{tier.glyph}</div>
              <div style={styles.rowMain}>
                <div style={styles.rowMerchant}>{t.merchant}</div>
                <div style={styles.rowMeta}>
                  {t.date} · {t.account_name}
                </div>
              </div>
              <div style={styles.rowAmount}>
                {currency(t.amount, t.currency)}
                {t.home_currency && t.currency !== t.home_currency && (
                  <div style={{ fontSize: 10.5, color: "#8B95A5", fontWeight: 400 }}>
                    ≈ {currency(t.amount_home, t.home_currency)}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <button
                  style={{ ...styles.rankChip, background: rank.color + "22", color: rank.color, borderColor: rank.color + "55" }}
                  onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                >
                  {rank.label}
                </button>
                {openMenuId === t.id && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      background: "#fff",
                      border: "1px solid #E7E2D6",
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(28,36,48,0.12)",
                      zIndex: 10,
                      minWidth: 180,
                      padding: 6,
                    }}
                  >
                    {RANKS.map((r) => (
                      <div
                        key={r.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontWeight: r.key === t.rank ? 600 : 400,
                        }}
                        onClick={() => {
                          onOverrideRank(t.id, r.key);
                          setOpenMenuId(null);
                        }}
                      >
                        <span style={{ ...styles.dot, background: r.color }} />
                        {r.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
