import React, { useState } from "react";

// Bottom of the dashboard: the privacy policy (shown in place, from the same
// /privacy.html page the signup screen links to, so there's one copy to keep
// up to date) and the copyright line.

const pill = {
  fontSize: 12,
  fontWeight: 500,
  color: "#1C2430",
  border: "1px solid #D6D0C2",
  borderRadius: 999,
  padding: "4px 12px",
  background: "#FFFFFF",
  whiteSpace: "nowrap",
};

export default function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <footer style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #E7E2D6" }}>
      <button
        type="button"
        onClick={() => setPrivacyOpen((o) => !o)}
        aria-expanded={privacyOpen}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 500 }}>Privacy policy</span>
        <span style={pill}>{privacyOpen ? "Collapse" : "Expand"}</span>
      </button>

      {privacyOpen && (
        <div style={{ marginTop: 12 }}>
          <iframe
            src="/privacy.html"
            title="Privacy policy"
            style={{ width: "100%", height: 480, border: "1px solid #E7E2D6", borderRadius: 14, background: "#F6F4EF" }}
          />
          <a
            href="/privacy.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: "#3F6E5B" }}
          >
            Open the full policy in a new tab
          </a>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
        © {new Date().getFullYear()} Prudence Wallet. All rights reserved.
      </div>
    </footer>
  );
}
