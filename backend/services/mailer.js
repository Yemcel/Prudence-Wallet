// Sends email through Resend's HTTP API (https://resend.com). Plain HTTPS, so
// it works on Render's free tier, which blocks outgoing SMTP.
//
// Environment:
//   RESEND_API_KEY   — from the Resend dashboard (API Keys)
//   ALERT_FROM_EMAIL — sender, on the domain verified in Resend, e.g.
//                      "Prudence Wallet <alerts@prudencewallet.com>"
// Without RESEND_API_KEY nothing is sent; callers get { skipped: true }.

export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail({ to, subject, text }) {
  if (!mailerConfigured()) return { skipped: true };
  const from = process.env.ALERT_FROM_EMAIL?.trim() || "Prudence Wallet <alerts@prudencewallet.com>";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
  }
  return response.json();
}
