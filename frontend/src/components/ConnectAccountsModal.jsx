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

  return (
    <div>
      <div style={{ fontSize: 12, color: "#8B95A5", marginBottom: 10, lineHeight: 1.5 }}>
        PayPal doesn't offer a one-click "log in" connection the way a bank does — you'll need your
        own PayPal REST API credentials (from{" "}
        <a href="https://developer.paypal.com/dashboard/" target="_blank" rel="noreferrer">
          developer.paypal.com
        </a>
        ) for now.
      </div>
      <input style={styles.formInput} placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      <input
        style={styles.formInput}
        placeholder="Client Secret"
        type="password"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
      />
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
            Advanced: connect PayPal with your own API keys
          </button>
        )}

        <button style={{ ...styles.modalClose, marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
