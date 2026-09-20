import React, { useState } from "react";
import { api } from "../lib/api.js";

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NGN", "INR", "MXN"];

const styles = {
  wrap: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#6B7280" },
  select: {
    border: "1px solid #E7E2D6",
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 12.5,
    fontFamily: "inherit",
    background: "#FFFFFF",
    color: "#1C2430",
  },
};

export default function HomeCurrencySelector({ homeCurrency, onChanged }) {
  const [saving, setSaving] = useState(false);

  const change = async (e) => {
    const value = e.target.value;
    setSaving(true);
    try {
      await api.updateSettings({ homeCurrency: value });
      onChanged(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <span>Home currency</span>
      <select style={styles.select} value={homeCurrency || "USD"} onChange={change} disabled={saving}>
        {COMMON_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
