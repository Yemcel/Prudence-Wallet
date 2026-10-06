import { db } from "../db/init.js";

// Exchange rates come from two free, no-API-key services, updated daily —
// fine for a personal finance app's totals, not for trading.
//   1. ExchangeRate-API's open endpoint (https://www.exchangerate-api.com),
//      which covers 160+ currencies including the Nigerian naira (NGN).
//      Its terms ask for an attribution link wherever rates are shown — see
//      the footer.
//   2. Frankfurter (https://frankfurter.dev), built on European Central Bank
//      reference rates (~30 currencies, no NGN), used if the first is down.
const FX_SOURCES = [
  {
    name: "ExchangeRate-API",
    url: "https://open.er-api.com/v6/latest/USD",
    parse: (data) => {
      if (data.result !== "success" || !data.rates) throw new Error(`unexpected response: ${data["error-type"] || data.result}`);
      return data.rates;
    },
  },
  {
    name: "Frankfurter",
    url: "https://api.frankfurter.app/latest?from=USD",
    parse: (data) => {
      if (!data.rates) throw new Error("unexpected response");
      return data.rates;
    },
  },
];
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

async function fetchRates() {
  const failures = [];
  for (const source of FX_SOURCES) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return source.parse(await response.json()); // { EUR: 0.92, GBP: 0.79, NGN: 1530.2, ... } per 1 USD
    } catch (err) {
      failures.push(`${source.name}: ${err.message}`);
    }
  }
  throw new Error(`FX rate fetch failed — ${failures.join("; ")}`);
}

async function refreshRates() {
  const fetched = await fetchRates();
  const now = new Date().toISOString();

  const rates = { USD: 1, ...fetched };
  const statements = Object.entries(rates).map(([currency, rate]) => ({
    sql: `INSERT INTO fx_rates (currency, rate, fetched_at) VALUES (?, ?, ?)
          ON CONFLICT(currency) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at`,
    args: [currency, rate, now],
  }));
  await db.batch(statements);

  rateCache = rates;
}

// Rates stored by the old ECB-only source (~30 currencies, no NGN) are
// replaced on the first call after an upgrade, without waiting a day. Tried
// once per process, so a fallback to the ECB source can't cause a fetch on
// every request.
let triedFullRefresh = false;

export async function ensureFreshRates() {
  const row = await db.get("SELECT MAX(fetched_at) as latest, COUNT(*) as n FROM fx_rates");
  const isStale = !row?.latest || Date.now() - new Date(row.latest).getTime() > STALE_AFTER_MS;
  const isPartial = Number(row?.n || 0) < 50 && !triedFullRefresh;
  if (isStale) {
    triedFullRefresh = true;
    await refreshRates();
    return;
  }
  if (isPartial) {
    triedFullRefresh = true;
    try {
      await refreshRates();
      return;
    } catch (err) {
      // The stored rates are still fresh — keep using them.
      console.warn("FX upgrade refresh failed, using stored rates:", err.message);
    }
  }
  if (!rateCache) {
    // Rates are fresh in the DB (e.g. another server instance fetched them
    // recently) but this process hasn't loaded them into memory yet.
    const rows = await db.all("SELECT currency, rate FROM fx_rates");
    rateCache = Object.fromEntries(rows.map((r) => [r.currency, r.rate]));
  }
}

// Whether a home currency can be used (rates must be loaded first).
export function isSupportedCurrency(currency) {
  return rateCache?.[currency] != null;
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
