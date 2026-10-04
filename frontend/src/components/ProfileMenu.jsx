import React, { useEffect, useRef, useState } from "react";
import NotificationSettings from "./NotificationSettings.jsx";

// Avatar button in the top-right corner. Opens a panel with who's signed in,
// notification settings, sign out and delete account.

function initials(email) {
  const name = String(email || "").split("@")[0];
  const parts = name.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return (letters || "?").toUpperCase();
}

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  background: "none",
  border: "none",
  borderTop: "1px solid #E7E2D6",
  padding: "12px 16px",
  font: "inherit",
  fontSize: 13.5,
  color: "#1C2430",
  textAlign: "left",
  cursor: "pointer",
};

const pill = {
  fontSize: 12,
  fontWeight: 500,
  color: "#1C2430",
  border: "1px solid #D6D0C2",
  borderRadius: 999,
  padding: "3px 11px",
  background: "#FFFFFF",
  whiteSpace: "nowrap",
};

export default function ProfileMenu({ email, onSignOut, onDeleteAccount }) {
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on a click outside the menu, or on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Your profile"
        title={email}
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          border: open ? "2px solid #C08A2E" : "2px solid transparent",
          background: "#1C2430",
          color: "#F6F4EF",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initials(email)}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 330,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100vh - 90px)",
            overflowY: "auto",
            background: "#FFFFFF",
            border: "1px solid #E7E2D6",
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(28,36,48,0.14)",
            zIndex: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#1C2430",
                color: "#F6F4EF",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: "#8B95A5" }}>Signed in as</div>
              <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            </div>
          </div>

          <button type="button" style={row} onClick={() => setNotificationsOpen((o) => !o)} aria-expanded={notificationsOpen}>
            <span>Notification settings</span>
            <span style={pill}>{notificationsOpen ? "Collapse" : "Expand"}</span>
          </button>
          {notificationsOpen && (
            <div style={{ padding: "0 16px 14px" }}>
              <NotificationSettings embedded />
            </div>
          )}

          <button
            type="button"
            style={row}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            style={{ ...row, color: "#A83B32", borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}
            onClick={() => {
              setOpen(false);
              onDeleteAccount();
            }}
          >
            Delete account
          </button>
        </div>
      )}
    </div>
  );
}
