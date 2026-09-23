import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

export default function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (e) {
      setError(e.message || "Couldn't delete your account — try again.");
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Delete your account</div>
        <div style={styles.modalSub}>
          This permanently removes your login and every transaction, account connection, and rule the coach has
          learned — manual, Plaid, and PayPal alike. There's no undo. Enter your password to confirm.
        </div>
        <input
          style={styles.formInput}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button
            style={{ ...styles.modalBtnPrimary, background: "#A83B32" }}
            onClick={submit}
            disabled={busy || !password}
          >
            {busy ? "Deleting…" : "Permanently delete my account"}
          </button>
        </div>
        <button style={styles.modalClose} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
