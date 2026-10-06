import React from "react";
import { currency } from "../constants/ranks.js";

// A purchase amount: the user's home currency on top, and underneath either
// the original amount (when it was in another currency) or the US dollar
// equivalent, as a common reference.
export default function AmountStack({ t, style, subSize = 10.5 }) {
  const home = t.home_currency || t.currency;
  const top = t.home_currency ? currency(t.amount_home, t.home_currency) : currency(t.amount, t.currency);

  let sub = null;
  if (t.home_currency && t.currency !== t.home_currency) sub = currency(t.amount, t.currency);
  else if (home !== "USD" && t.amount_usd != null) sub = `≈ ${currency(t.amount_usd, "USD")}`;

  return (
    <div style={style}>
      {top}
      {sub && <div style={{ fontSize: subSize, color: "#8B95A5", fontWeight: 400 }}>{sub}</div>}
    </div>
  );
}
