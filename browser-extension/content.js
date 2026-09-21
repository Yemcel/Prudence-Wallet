// Prudence Wallet -- Checkout Reflection
//
// Honesty check before you build on this, same as backend/services/nudges.js:
// a content script has no authority over the page's real checkout button,
// the card network, or the bank. Dismissing this overlay does not cancel
// anything -- it is a deliberate speed bump before an easy, automatic click,
// not a block. Nothing here is sent anywhere; it only reads the current
// page's own text and runs entirely in the browser.

(function () {
  const STORAGE_KEY = "prudenceReflectEnabled";
  const SHOWN_FLAG = "__prudenceReflectShown";

  const CHECKOUT_PATTERNS = [
    /\bplace\s*order\b/i,
    /\bpay\s*now\b/i,
    /\bcomplete\s*(your\s*)?purchase\b/i,
    /\bconfirm\s*(and\s*)?(pay|order|purchase)\b/i,
    /\bcheckout\b/i,
    /\bbuy\s*now\b/i,
    /\breview\s*(your\s*)?order\b/i,
  ];

  const RANKS = [
    { label: "Important", color: "#3F6E5B" },
    { label: "Necessary", color: "#5C8168" },
    { label: "Needed", color: "#8B9A5B" },
    { label: "Leisure", color: "#C08A2E" },
    { label: "Luxury", color: "#BD6A2E" },
    { label: "Once in a while treat", color: "#A8502F" },
    { label: "Wasteful", color: "#A83B32" },
  ];

  function looksLikeCheckout() {
    if (window.top !== window) return false; // skip ads/embeds in iframes

    if (CHECKOUT_PATTERNS.some((p) => p.test(location.href))) return true;

    const clickable = document.querySelectorAll(
      "button, [role='button'], input[type='submit'], a.button, a.btn"
    );
    for (const el of clickable) {
      const text = (el.innerText || el.value || "").trim();
      if (text && CHECKOUT_PATTERNS.some((p) => p.test(text))) return true;
    }
    return false;
  }

  function injectOverlay() {
    if (window[SHOWN_FLAG]) return;
    window[SHOWN_FLAG] = true;

    const overlay = document.createElement("div");
    overlay.id = "prudence-reflect-overlay";
    overlay.innerHTML =
      '<div class="pr-card">' +
      '<div class="pr-eyebrow">PRUDENCE WALLET</div>' +
      "<h2>Before you complete this</h2>" +
      "<p>How would you rank this purchase?</p>" +
      '<div class="pr-ranks">' +
      RANKS.map(
        (r) =>
          '<span class="pr-chip" style="border-color:' +
          r.color +
          "66;color:" +
          r.color +
          '">' +
          r.label +
          "</span>"
      ).join("") +
      "</div>" +
      '<p class="pr-sub">Just a moment to think it over -- closing this won’t cancel anything on the page.</p>' +
      '<div class="pr-actions">' +
      '<button id="pr-continue" type="button">Continue to checkout</button>' +
      '<button id="pr-close" type="button">Not right now</button>' +
      "</div>" +
      "</div>";
    document.documentElement.appendChild(overlay);

    document.getElementById("pr-continue").addEventListener("click", () => {
      overlay.remove();
    });
    document.getElementById("pr-close").addEventListener("click", () => {
      overlay.remove();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close(); // best-effort only; browsers may ignore this on a tab they didn't open
      }
    });
  }

  function maybeShow() {
    if (!(window.chrome && chrome.storage && chrome.storage.local)) return;
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const enabled = result[STORAGE_KEY] !== false; // default ON
      if (enabled && looksLikeCheckout()) injectOverlay();
    });
  }

  maybeShow();
  // Re-check after short delays -- many checkout buttons render client-side
  // after the initial page load.
  setTimeout(maybeShow, 1500);
  setTimeout(maybeShow, 4000);

  // Re-check on URL changes for single-page-app checkouts (Amazon, etc.)
  // that never do a full page navigation between cart and checkout.
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      window[SHOWN_FLAG] = false;
      maybeShow();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
