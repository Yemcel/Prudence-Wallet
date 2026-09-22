import { db } from "../db/init.js";

// Frankfurter (https://frankfurter.dev) is a free, no-API-key exchange rate
// service built on European Central Bank reference rates, updated daily on
// bank days. Good enough for a personal finance app's totals — not
// appropriate for anything requiring real-time trading-grade rates.
const FX_API_URL = "https://api.frankfurter.app/latest?from=USD";
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // refetch once a day

async function refreshRates() {
  const response = await fetch(FX_API_URL);
  if (!response.ok) {
    throw new Error(`FX rate fetch failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json(); // { base: "USD", date: "...", rates: { EUR: 0.92, GBP: 0.79, ... } }
  const now = new Date().toISOString();

  const upsert = db.prepare(`
    INSERT INTO fx_rates (currency, rate, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(currency) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at
  `);

  upsert.run("USD", 1, now);
  for (const [currency, rate] of Object.entries(data.rates)) {
    upsert.run(currency, rate, now);
  }
}

export async function ensureFreshRates() {
  const row = db.prepare("SELECT MAX(fetched_at) as latest FROM fx_rates").get();
  const isStale = !row.latest || Date.now() - new Date(row.latest).getTime() > STALE_AFTER_MS;
  if (isStale) {
    await refreshRates();
  }
}

// Returns units of `currency` per 1 USD (USD itself is always 1)
function getRate(currency) {
  const row = db.prepare("SELECT rate FROM fx_rates WHERE currency = ?").get(currency);
  if (!row) {
    throw new Error(`No cached FX rate for "${currency}" — call ensureFreshRates() first, or it's an unsupported currency code`);
  }
  return row.rate;
}

export function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const amountInUsd = fromCurrency === "USD" ? amount : amount / getRate(fromCurrency);
  return toCurrency === "USD" ? amountInUsd : amountInUsd * getRate(toCurrency);
}

// Home currency is per-user now (used to be a single global row) —
// defaults a brand-new user to USD until they set their own.
export function getHomeCurrency(userId) {
  const row = db.prepare("SELECT home_currency FROM user_settings WHERE user_id = ?").get(userId);
  return row?.home_currency || "USD";
}

export function setHomeCurrency(userId, currency) {
  db.prepare(
    `INSERT INTO user_settings (user_id, home_currency) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET home_currency = excluded.home_currency`
  ).run(userId, currency);
}
