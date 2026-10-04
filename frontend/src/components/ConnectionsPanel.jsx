import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { TIERS } from "../constants/ranks.js";
import { api } from "../lib/api.js";

export default function ConnectionsPanel({ accounts, onRemoved }) {
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  if (!accounts || accounts.length === 0) return null;

  const remove = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      await api.removeAccount(id);
      setConfirmId(null);
      onRemoved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const linkBtn = { background: "none", border: "none", padding: 0, fontSize: 12, cursor: "pointer", textDecoration: "underline" };

  return (
    <section style={{ marginBottom: 24 }}>
      <div>
        {accounts.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid #E7E2D6" }}>
            <div style={{ ...styles.connectRow, borderBottom: "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIERS[a.tier].color, flexShrink: 0 }} />
              <div style={styles.connectMain}>
                <div style={styles.connectName}>{a.name}</div>
                <div style={styles.connectSub}>{a.note}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={a.tier === "manual" ? styles.connectStatusManual : styles.connectStatusOk}>
                  {a.tier === "manual" ? "Manual" : "Connected"}
                </div>
                {a.tier !== "manual" && confirmId !== a.id && (
                  <button type="button" style={{ ...linkBtn, color: "#8B95A5", marginTop: 4 }} onClick={() => setConfirmId(a.id)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {confirmId === a.id && (
              <div style={{ fontSize: 12.5, color: "#3B4453", padding: "0 0 12px 20px", lineHeight: 1.5 }}>
                Remove {a.name}? This disconnects it and deletes every transaction that came in through it. Your manual entries
                aren't affected.
                <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                  <button type="button" style={{ ...linkBtn, color: "#A83B32", fontWeight: 500 }} disabled={busyId === a.id} onClick={() => remove(a.id)}>
                    {busyId === a.id ? "Removing…" : "Yes, remove it"}
                  </button>
                  <button type="button" style={{ ...linkBtn, color: "#8B95A5" }} disabled={busyId === a.id} onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <div style={{ ...styles.errorText, marginTop: 8 }}>{error}</div>}
    </section>
  );
}
