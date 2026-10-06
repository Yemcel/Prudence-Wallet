import React, { useState } from "react";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && !agreedToPolicy) {
      setError("Please agree to the Terms of Use and Privacy Policy to continue.");
      return;
    }
    setBusy(true);
    try {
      const result = mode === "login" ? await api.login(email, password) : await api.signup(email, password);
      onAuthenticated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...styles.page, display: "flex", alignItems: "center", minHeight: "100vh" }}>
      <div style={{ width: "100%" }}>
        <div style={styles.eyebrow}>Prudence Wallet</div>
        <h1 style={{ ...styles.title, marginBottom: 8 }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        {/* Says plainly what the site is: helps people, and the automated
            filters (ISPs, antivirus) that judge new sites with a login page. */}
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>
          A personal spending tracker that helps you see which purchases really mattered. Not a bank, and not a crypto
          wallet: it never holds or moves your money.
        </p>

        <form onSubmit={submit} style={styles.card}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.formInput}
            autoComplete="email"
            required
          />
          <input
            type="password"
            placeholder={mode === "signup" ? "Password (at least 8 characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.formInput}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />

          {mode === "signup" && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "12px 0", fontSize: 14 }}>
              <input
                type="checkbox"
                checked={agreedToPolicy}
                onChange={(e) => setAgreedToPolicy(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                I agree to the{" "}
                <a href="/terms.html" target="_blank" rel="noopener noreferrer" style={{ color: "#3F6E5B" }}>
                  Terms of Use
                </a>{" "}
                and{" "}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style={{ color: "#3F6E5B" }}>
                  Privacy Policy
                </a>
              </span>
            </label>
          )}

          {error && <div style={{ ...styles.errorText, marginBottom: 10 }}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.modalBtnPrimary, width: "100%" }}
            disabled={busy || (mode === "signup" && !agreedToPolicy)}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          style={{ ...styles.modalClose, marginTop: 16 }}
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError(null);
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>

        <div style={{ marginTop: 28, fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
          <a href="/about.html" style={{ color: "inherit" }}>About</a>
          {" · "}
          <a href="/privacy.html" style={{ color: "inherit" }}>Privacy</a>
          {" · "}
          <a href="/terms.html" style={{ color: "inherit" }}>Terms</a>
          {" · "}
          <a href="mailto:yemcels@gmail.com" style={{ color: "inherit" }}>Contact</a>
        </div>
      </div>
    </div>
  );
}