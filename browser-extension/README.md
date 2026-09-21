# Prudence Wallet -- Checkout Reflection (browser extension)

A lightweight companion to the Prudence Wallet app: a one-time reflection
prompt that appears when a page looks like a checkout / "complete purchase"
moment, before you finish buying.

## What it actually does (and doesn't)

This is a **speed bump, not a block**. A browser extension has no authority
over your bank, card network, or a shopping site's own checkout button --
closing the overlay doesn't cancel anything, and "Continue to checkout"
just dismisses it so the page works as normal. It's meant to interrupt an
automatic, unconsidered click for a moment, not to enforce anything.

Real pre-authorization blocking of a card transaction (an actual pop-up
that can stop the charge) needs the app to sit inside the payment
authorization path itself -- see the "point of intervention" discussion
in the project history. That's a much bigger build (issuing your own card
via a program like Marqeta or Unit) and isn't what this is.

Nothing this extension sees is sent anywhere -- there's no network call in
it at all. It only reads the current page's own text/URL, runs entirely in
your browser, and remembers your on/off setting locally.

## How it detects a checkout page

- The page URL, or the text of any button/link on the page, matches common
  checkout language ("Place order", "Pay now", "Complete purchase",
  "Checkout", "Buy now", "Confirm order"...).
- It re-checks a couple of times after the page loads, and again on URL
  changes, to catch single-page-app checkouts (Amazon and similar) that
  render the real button after the page first loads.
- It only shows once per page load -- dismiss it and it won't reappear on
  that same page.

## Install it (unpacked, for personal use)

This isn't published to the Chrome Web Store -- that's a separate
developer-account and review process. To use it in Edge or Chrome as-is:

1. Open `edge://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `browser-extension` folder.
4. Optionally pin it to the toolbar for quick access to the on/off toggle.

## Turning it off

Click the extension's toolbar icon and flip the toggle off. The overlay
stops appearing; the extension stays installed.

## What's not built yet

- It doesn't talk to the Prudence Wallet backend -- nothing here is logged
  or saved anywhere, it's a pure in-the-moment prompt.
- No phone/app-level version -- this only covers browser checkouts, not a
  shopping app on a phone or a physical card tap.
- The checkout detection is a text heuristic, not a guarantee -- it will
  miss some sites and occasionally fire on non-checkout pages that happen
  to use similar wording.
