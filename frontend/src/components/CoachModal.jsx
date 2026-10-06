import React, { useEffect, useRef, useState } from "react";
import { styles } from "../styles/theme.js";
import { currency, rankLabel, PURPOSE_SUGGESTIONS } from "../constants/ranks.js";
import { api } from "../lib/api.js";

export default function CoachModal({ transaction, onClose, onResolved }) {
  const [chatLog, setChatLog] = useState([
    { from: "app", text: `Quick one — the ${currency(transaction.amount, transaction.currency)} at ${transaction.merchant} — what was that for?` },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Tapping a suggestion adds it to the answer (so "Night out" + "Saw it and
  // wanted it" can be combined), and it can still be edited before sending.
  const addSuggestion = (text) => {
    setInput((current) => {
      const parts = current.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.some((p) => p.toLowerCase() === text.toLowerCase())) return current;
      return [...parts, text].join(", ");
    });
    inputRef.current?.focus();
  };

  const submit = async () => {
    if (!input.trim() || loading) return;
    const answer = input.trim();
    setChatLog((log) => [...log, { from: "user", text: answer }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const { transaction: updated, reasoning } = await api.classify(transaction.id, answer);
      setChatLog((log) => [...log, { from: "app", text: `Tagged as ${rankLabel(updated.rank)}. ${reasoning || ""}` }]);
      setTimeout(() => onResolved(updated), 1200);
    } catch (e) {
      setError("Couldn't reach the coach — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalMerchant}>{transaction.merchant}</div>
          <div style={styles.modalAmount}>{currency(transaction.amount, transaction.currency)}</div>
        </div>
        <div style={styles.chatLog}>
          {chatLog.map((m, i) => (
            <div key={i} style={m.from === "app" ? styles.bubbleApp : styles.bubbleUser}>
              {m.text}
            </div>
          ))}
          {loading && <div style={styles.bubbleApp}>thinking…</div>}
          {error && <div style={styles.errorText}>{error}</div>}
        </div>
        <div style={styles.suggestionRow} aria-label="Suggested answers">
          {PURPOSE_SUGGESTIONS.map((s) => (
            <button key={s} type="button" style={styles.suggestionChip} onClick={() => addSuggestion(s)} disabled={loading}>
              {s}
            </button>
          ))}
        </div>
        <div style={styles.chatInputRow}>
          <input
            ref={inputRef}
            style={styles.chatInput}
            value={input}
            placeholder="Tap a suggestion or type your own…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={loading}
          />
          <button style={styles.chatSend} onClick={submit} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
        <button type="button" style={styles.modalCancel} onClick={onClose}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
