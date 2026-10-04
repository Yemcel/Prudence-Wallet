import React, { useMemo, useState } from "react";
import { styles } from "../styles/theme.js";
import { RANKS, currency } from "../constants/ranks.js";

// A Monday–Sunday view of spending, grouped by prudence category, with
// arrows to step back through earlier weeks. Built from the transaction
// lists the app already loads (amounts already converted to the home
// currency by the backend), so it needs no API of its own.

const UNRANKED = { key: "__unranked", label: "Not yet ranked", color: "#B7BDC7" };

// "YYYY-MM-DD" for a local date — transaction dates are stored in this form,
// so string comparison is enough to test whether one falls inside a week.
function dayKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekBounds(offset) {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start: dayKey(monday), end: dayKey(sunday), monday, sunday };
}

function inWeek(tx, bounds) {
  return tx.date >= bounds.start && tx.date <= bounds.end;
}

function weekLabel(offset, { monday, sunday }) {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  const fmt = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default function WeeklyView({ ranked, pending, homeCurrency }) {
  const [offset, setOffset] = useState(0);
  const [openKey, setOpenKey] = useState(null);

  const all = useMemo(() => [...(ranked || []), ...(pending || [])], [ranked, pending]);

  const week = useMemo(() => {
    const bounds = weekBounds(offset);
    const prevBounds = weekBounds(offset - 1);
    const txs = all.filter((t) => inWeek(t, bounds));
    const amount = (t) => Number(t.amount_home ?? t.amount) || 0;

    const groups = [...RANKS, UNRANKED]
      .map((r) => {
        const items = txs
          .filter((t) => (r === UNRANKED ? !t.rank : t.rank === r.key))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        return { ...r, items, total: items.reduce((s, t) => s + amount(t), 0) };
      })
      .filter((g) => g.items.length > 0);

    const total = txs.reduce((s, t) => s + amount(t), 0);
    const prevTotal = all.filter((t) => inWeek(t, prevBounds)).reduce((s, t) => s + amount(t), 0);
    return { bounds, groups, total, prevTotal, count: txs.length };
  }, [all, offset]);

  // Nothing logged at all yet — the rest of the dashboard already says so.
  if (all.length === 0) return null;

  const money = (n) => currency(n, homeCurrency);
  const diff = week.total - week.prevTotal;
  const arrowBtn = { ...styles.modalClose, display: "inline-block", margin: 0, padding: "4px 10px", fontSize: 16, lineHeight: 1 };

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ ...styles.sectionHeading, marginBottom: 0 }}>Week by category</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" style={arrowBtn} onClick={() => setOffset((o) => o - 1)} aria-label="Previous week">
            ‹
          </button>
          <span style={{ fontSize: 12.5, color: "#3B4453", minWidth: 104, textAlign: "center" }}>{weekLabel(offset, week.bounds)}</span>
          <button
            type="button"
            style={{ ...arrowBtn, opacity: offset === 0 ? 0.3 : 1 }}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={offset === 0}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={styles.coveragePct}>{money(week.total)}</div>
            <div style={styles.coverageLabel}>
              {week.count} {week.count === 1 ? "purchase" : "purchases"}
            </div>
          </div>
          {week.prevTotal > 0 && (
            <div style={{ fontSize: 12, color: diff > 0 ? "#A83B32" : "#3F6E5B", textAlign: "right" }}>
              {diff > 0 ? "▲" : "▼"} {money(Math.abs(diff))} vs the week before
            </div>
          )}
        </div>

        {week.groups.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8B95A5" }}>Nothing logged this week.</div>
        ) : (
          week.groups.map((g) => {
            const pct = week.total ? (g.total / week.total) * 100 : 0;
            const open = openKey === g.key;
            return (
              <div key={g.key} style={{ borderTop: "1px solid #E7E2D6" }}>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : g.key)}
                  style={{ display: "block", width: "100%", background: "none", border: "none", padding: "10px 0", font: "inherit", textAlign: "left", cursor: "pointer", color: "inherit" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                    <span style={{ ...styles.dot, background: g.color }} />
                    <span style={{ flex: 1 }}>
                      {g.label} <span style={{ color: "#8B95A5", fontSize: 12 }}>· {g.items.length}</span>
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{money(g.total)}</span>
                    <span style={{ color: "#8B95A5", fontSize: 11, width: 12, textAlign: "center" }}>{open ? "▾" : "▸"}</span>
                  </div>
                  <div style={{ height: 5, background: "#F0ECE3", borderRadius: 3, marginTop: 7, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: g.color }} />
                  </div>
                </button>
                {open && (
                  <div style={{ padding: "0 0 10px 16px" }}>
                    {g.items.map((t) => (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "4px 0", color: "#3B4453" }}>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.merchant} <span style={{ color: "#8B95A5" }}>· {t.date}</span>
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(Number(t.amount_home ?? t.amount) || 0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
