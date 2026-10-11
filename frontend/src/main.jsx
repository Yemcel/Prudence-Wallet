import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { getToken } from "./lib/api.js";

// The public front page lives as plain HTML inside #root in index.html, so
// visitors, search engines and the automated filters that judge new sites
// (ISPs, antivirus) see a real page even without running JavaScript. The app
// only takes over when someone is signed in, or follows a "Sign in" /
// "Create account" link (#signin / #signup).
const AUTH_HASHES = ["#signin", "#signup"];
const wantsApp = () => Boolean(getToken()) || AUTH_HASHES.includes(window.location.hash);

let started = false;
function start() {
  if (started) return;
  started = true;
  window.scrollTo(0, 0);
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (wantsApp()) start();
else window.addEventListener("hashchange", () => wantsApp() && start());
