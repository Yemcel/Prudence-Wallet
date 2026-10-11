import React, { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

// Plaid runs in Sandbox (fake test banks) until the production decision is
// made, so the "Connect a bank" button is hidden from closed-test users.
// To show it, set VITE_PLAID_ENABLED=true in the static site's environment
// variables on Render and redeploy.
const PLAID_ENABLED = import.meta.env.VITE_PLAID_ENABLED === "true";

function PlaidConnectButton({ onConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    api
      .getPlaidLinkToken()
      .then((r) => setLinkToken(r.linkToken))
      .catch((e) => setError(e.message));
  }, []);

  const onSuccess = useCallback(
    async (publicToken) => {
      setConnecting(true);
      try {
        const result = await api.exchangePlaidPublicToken(publicToken);
        await api.syncPlaid();
        onConnected(result);
      } catch (e) {
        setError(e.message);
      } finally {
        setConnecting(false);
      }
    },
    [onConnected]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  if (error) return <div style={styles.errorText}>Plaid: {error}</div>;

  return (
    <button style={styles.modalBtnPrimary} onClick={() => open()} disabled={!ready || connecting}>
      {connecting ? "Connecting…" : "Connect a bank via Plaid"}
    </button>
  );
}

function PaypalConnectForm({ onConnected }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.connectPaypal({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      // The sync endpoint reports each connection's outcome rather than
      // failing the request, so check it — otherwise a failed first sync
      // would close this window looking exactly like success.
      const sync = await api.syncPaypal();
      const failed = (sync?.results || []).find((r) => r.error);
      if (failed) {
        setError(`PayPal connected, but the first sync failed: ${failed.error}`);
        return;
      }
      onConnected(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const hint = { fontSize: 12, color: "#6B7280", lineHeight: 1.55 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 500, margin: "4px 0 6px" };

  // Worded so it can't be mistaken for a request for someone's PayPal login
  // (people, and the automated phishing filters that scan sites, both read it).
  return (
    <div>
      <div style={{ ...hint, background: "#F6F4EF", border: "1px solid #E7E2D6", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <b style={{ color: "#1C2430" }}>Never enter your PayPal email or password here.</b> This option uses a{" "}
        <b style={{ color: "#1C2430" }}>developer API key</b> that you create yourself in PayPal's developer
        dashboard. Prudence uses it only to read your PayPal transactions, and you can revoke it there at any time.
      </div>
      <ol style={{ ...hint, margin: "0 0 12px", paddingLeft: 18 }}>
        <li>
          Open{" "}
          <a href="https://developer.paypal.com/dashboard/applications/live" target="_blank" rel="noopener noreferrer" style={{ color: "#3F6E5B" }}>
            PayPal Developer → Apps &amp; Credentials
          </a>{" "}
          and sign in there, on PayPal's own site.
        </li>
        <li>Create an app with the <i>Transaction search</i> feature switched on.</li>
        <li>Copy its client ID and secret key into the boxes below.</li>
      </ol>
      <label style={label} htmlFor="pp-client-id">PayPal API client ID</label>
      <input
        id="pp-client-id"
        style={styles.formInput}
        placeholder="From Apps & Credentials"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <label style={label} htmlFor="pp-secret">PayPal API secret key</label>
      <input
        id="pp-secret"
        style={styles.formInput}
        placeholder="The app's secret key"
        type="password"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        autoComplete="off"
      />
      <div style={{ ...hint, margin: "-2px 0 10px" }}>Stored encrypted. Remove the connection any time from the Connections list.</div>
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={styles.modalBtnPrimary} onClick={submit} disabled={saving || !clientId.trim() || !clientSecret.trim()}>
        {saving ? "Connecting…" : "Connect PayPal"}
      </button>
    </div>
  );
}

export default function ConnectAccountsModal({ onClose, onConnected }) {
  // PayPal currently needs the user's own developer API keys, which most
  // people won't have — so it's tucked behind a link rather than shown as a
  // main option. Replace with "Log in with PayPal" once partner access exists.
  const [showPaypal, setShowPaypal] = useState(false);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Connect an account</div>
        <div style={styles.modalSub}>
          Bank/card feeds cover Apple Pay and Google Pay automatically, and PayPal purchases paid by card or bank usually
          show up there too. Anything else can be added by hand.
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Bank or card</div>
          {PLAID_ENABLED ? (
            <PlaidConnectButton onConnected={onConnected} />
          ) : (
            <div style={{ fontSize: 13, color: "#8B95A5", lineHeight: 1.5 }}>
              Bank connections are coming soon. For now, log your spending with "+ Add manual spend" on the main screen.
            </div>
          )}
        </div>

        {showPaypal ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>PayPal (advanced)</div>
            <PaypalConnectForm onConnected={onConnected} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPaypal(true)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#8B95A5", textDecoration: "underline", cursor: "pointer" }}
          >
            Advanced: connect PayPal with a developer API key
          </button>
        )}

        <button type="button" style={styles.modalCancel} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
