import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

export default function AddManualModal({ onClose, onAdded }) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!merchant.trim() || !amount) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.addManualTransaction({ merchant: merchant.trim(), amount: parseFloat(amount) });
      onAdded(created);
    } catch (e) {
      setError("Couldn't save that — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalTitle}>Add manual spend</div>
        <div style={styles.modalSub}>Cash, local vendors, anything not connected. We'll ask what it was for right after.</div>
        <input style={styles.formInput} placeholder="Merchant or what it was" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        <input style={styles.formInput} placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {error && <div style={styles.errorText}>{error}</div>}
        <div style={styles.modalActions}>
          <button style={styles.modalBtnPrimary} onClick={submit} disabled={saving || !merchant.trim() || !amount}>
            {saving ? "Saving…" : "Add & continue"}
          </button>
        </div>
        <button style={styles.modalClose} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
