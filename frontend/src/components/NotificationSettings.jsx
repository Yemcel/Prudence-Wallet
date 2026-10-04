import React, { useEffect, useState } from "react";
import { styles } from "../styles/theme.js";
import { api } from "../lib/api.js";

// Lets a user switch push notifications on for this device and choose which
// kinds they get. The browser only allows the permission prompt right after
// a tap, which is why it's a button rather than something asked on load.

const KINDS = [
  { key: "nudges", label: "Spending nudges", hint: "When a purchase looks like a pattern worth a second look" },
  { key: "daily", label: "Evening reminder", hint: "Only if nothing's logged that day, or purchases are waiting to be ranked" },
  { key: "weekly", label: "Weekly summary", hint: "Sunday evening: your week's total and what went where" },
];

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIosBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  return ios && !installed;
}

export default function NotificationSettings() {
  const [config, setConfig] = useState(null); // { publicKey, prefs }
  const [subscription, setSubscription] = useState(null);
  const [permission, setPermission] = useState(pushSupported() ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { text, error }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.getPushConfig();
        if (cancelled) return;
        setConfig(cfg);
        if (pushSupported()) {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          if (!cancelled) setSubscription(existing);
        }
      } catch (e) {
        if (!cancelled) setMessage({ text: e.message, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) }));
      await api.subscribePush(sub.toJSON());
      setSubscription(sub);
      setMessage({ text: "Notifications are on for this device." });
    } catch (e) {
      setMessage({ text: `Couldn't turn notifications on: ${e.message}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscription(null);
      setMessage({ text: "Notifications are off for this device." });
    } catch (e) {
      setMessage({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const toggleKind = async (key) => {
    const next = { ...config.prefs, [key]: !config.prefs[key] };
    setConfig({ ...config, prefs: next }); // optimistic
    try {
      const { prefs } = await api.updatePushPrefs({ [key]: next[key] });
      setConfig((c) => ({ ...c, prefs }));
    } catch (e) {
      setConfig((c) => ({ ...c, prefs: { ...c.prefs, [key]: !next[key] } }));
      setMessage({ text: e.message, error: true });
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.sendTestPush();
      setMessage({ text: "Test sent — it should pop up in a few seconds." });
    } catch (e) {
      setMessage({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  };

  const note = { fontSize: 12.5, color: "#6B7280", lineHeight: 1.5 };
  let body;

  if (!config && !message) {
    body = <div style={note}>Loading…</div>;
  } else if (permission === "unsupported") {
    body = (
      <div style={note}>
        {isIosBrowserTab()
          ? "On iPhone, notifications work once the app is on your home screen: tap Share, then “Add to Home Screen”, and open it from there."
          : "This browser doesn't support notifications. Try Chrome, Edge or Firefox, or the installed app."}
      </div>
    );
  } else if (config && !config.publicKey) {
    body = <div style={note}>Notifications aren't available yet.</div>;
  } else if (permission === "denied") {
    body = (
      <div style={note}>
        Notifications are blocked for this app. To allow them, open your browser or phone settings for prudencewallet.com and set
        Notifications to Allow, then come back here.
      </div>
    );
  } else if (!subscription) {
    body = (
      <div>
        <div style={{ ...note, marginBottom: 12 }}>
          Get a heads-up when a spending pattern is worth a second look, a gentle evening reminder, and a summary of your week.
        </div>
        <button style={styles.addBtn} onClick={turnOn} disabled={busy || !config}>
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      </div>
    );
  } else {
    body = (
      <div>
        {KINDS.map((k) => (
          <label
            key={k.key}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: "1px solid #E7E2D6", cursor: "pointer" }}
          >
            <input type="checkbox" checked={Boolean(config.prefs[k.key])} onChange={() => toggleKind(k.key)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{k.label}</span>
              <span style={{ display: "block", fontSize: 12, color: "#8B95A5", marginTop: 2 }}>{k.hint}</span>
            </span>
          </label>
        ))}
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button style={styles.addBtn} onClick={sendTest} disabled={busy}>
            Send a test
          </button>
          <button style={{ ...styles.modalClose, display: "inline-block", margin: 0 }} onClick={turnOff} disabled={busy}>
            Turn off on this device
          </button>
        </div>
      </div>
    );
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>Notifications</div>
      <div style={styles.card}>
        {body}
        {message && (
          <div style={{ fontSize: 12.5, marginTop: 12, color: message.error ? "#A83B32" : "#3F6E5B" }}>{message.text}</div>
        )}
      </div>
    </section>
  );
}
