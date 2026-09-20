import React, { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { styles } from "../styles/theme.js";
import { RANKS, currency } from "../constants/ranks.js";

export default function SpendingDonut({ summary }) {
  const [activeSlice, setActiveSlice] = useState(null);

  const sliceData = useMemo(() => {
    if (!summary) return [];
    return RANKS.map((r) => ({ key: r.key, name: r.label, value: summary.byRank[r.key] || 0, color: r.color })).filter(
      (d) => d.value > 0
    );
  }, [summary]);

  if (!summary || sliceData.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Spending by tier</div>
      <div style={{ ...styles.card, ...styles.sliceRow }}>
        <div style={styles.sliceChartWrap}>
          <PieChart width={168} height={168}>
            <Pie
              data={sliceData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              stroke="none"
              onMouseEnter={(_, i) => setActiveSlice(sliceData[i])}
              onMouseLeave={() => setActiveSlice(null)}
            >
              {sliceData.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => currency(value, summary.homeCurrency)}
              contentStyle={{ background: "#1C2430", border: "none", borderRadius: 8, fontSize: 12, fontFamily: "'Inter', sans-serif", color: "#F6F4EF" }}
              itemStyle={{ color: "#F6F4EF" }}
              labelStyle={{ color: "#A8B0BE" }}
            />
          </PieChart>
          <div style={styles.sliceCenter}>
            <div style={styles.sliceCenterAmt}>{currency(activeSlice ? activeSlice.value : summary.total, summary.homeCurrency)}</div>
            <div style={styles.sliceCenterLabel}>{activeSlice ? activeSlice.name : "Total"}</div>
          </div>
        </div>
        <div style={styles.sliceLegend}>
          {sliceData.map((d) => (
            <div key={d.key} style={styles.sliceLegendRow}>
              <span style={{ ...styles.dot, background: d.color }} />
              <span style={styles.sliceLegendLabel}>{d.name}</span>
              <span style={styles.sliceLegendPct}>{summary.total ? Math.round((d.value / summary.total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
