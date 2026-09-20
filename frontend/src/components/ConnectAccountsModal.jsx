import React, { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

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
      await api.syncPaypal();
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
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Connect an account</div>
        <div style={styles.modalSub}>Bank/card feeds cover Apple Pay and Google Pay automatically. Wallet balances need their own connection.</div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Bank or card</div>
          <PlaidConnectButton onConnected={onConnected} />
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>PayPal</div>
          <PaypalConnectForm onConnected={onConnected} />
        </div>

        <button style={{ ...styles.modalClose, marginTop: 16 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
