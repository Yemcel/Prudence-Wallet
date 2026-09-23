import { db } from "../db/init.js";

// Frankfurter (https://frankfurter.dev) is a free, no-API-key exchange rate
// service built on European Central Bank reference rates, updated daily on
// bank days. Good enough for a personal finance app's totals — not
// appropriate for anything requiring real-time trading-grade rates.
const FX_API_URL = "https://api.frankfurter.app/latest?from=USD";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // refetch once a day

// convert()/getRate() are called synchronously in hot loops (summary totals,
// mapping a whole page of transactions) all over the codebase, and rewriting
// every call site to thread a Promise through would be invasive. Since the
// database itself is now network-backed (Turso) and can't be read
// synchronously, this in-memory cache is the bridge: ensureFreshRates()
// (already async, already awaited by every caller before it relies on
// convert()) is the only thing that populates it. If a route somehow calls
// convert() before any ensureFreshRates() has ever run, getRate() below
// throws a clear error rather than silently using stale/empty data.
let rateCache = null; // { USD: 1, EUR: 0.92, ... }

async function refreshRates() {
  const response = await fetch(FX_API_URL);
  if (!response.ok) {
    throw new Error(`FX rate fetch failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json(); // { base: "USD", date: "...", rates: { EUR: 0.92, GBP: 0.79, ... } }
  const now = new Date().toISOString();

  const rates = { USD: 1, ...data.rates };
  const statements = Object.entries(rates).map(([currency, rate]) => ({
    sql: `INSERT INTO fx_rates (currency, rate, fetched_at) VALUES (?, ?, ?)
          ON CONFLICT(currency) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at`,
    args: [currency, rate, now],
  }));
  await db.batch(statements);

  rateCache = rates;
}

export async function ensureFreshRates() {
  const row = await db.get("SELECT MAX(fetched_at) as latest FROM fx_rates");
  const isStale = !row?.latest || Date.now() - new Date(row.latest).getTime() > STALE_AFTER_MS;
  if (isStale) {
    await refreshRates();
  } else if (!rateCache) {
    // Rates are fresh in the DB (e.g. another server instance fetched them
    // recently) but this process hasn't loaded them into memory yet.
    const rows = await db.all("SELECT currency, rate FROM fx_rates");
    rateCache = Object.fromEntries(rows.map((r) => [r.currency, r.rate]));
  }
}

// Returns units of `currency` per 1 USD (USD itself is always 1)
function getRate(currency) {
  const rate = rateCache?.[currency];
  if (rate == null) {
    throw new Error(`No cached FX rate for "${currency}" — call ensureFreshRates() first, or it's an unsupported currency code`);
  }
  return rate;
}

export function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const amountInUsd = fromCurrency === "USD" ? amount : amount / getRate(fromCurrency);
  return toCurrency === "USD" ? amountInUsd : amountInUsd * getRate(toCurrency);
}

// Home currency is per-user now (used to be a single global row) —
// defaults a brand-new user to USD until they set their own.
export async function getHomeCurrency(userId) {
  const row = await db.get("SELECT home_currency FROM user_settings WHERE user_id = ?", [userId]);
  return row?.home_currency || "USD";
}

export async function setHomeCurrency(userId, currency) {
  await db.run(
    `INSERT INTO user_settings (user_id, home_currency) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET home_currency = excluded.home_currency`,
    [userId, currency]
  );
}
