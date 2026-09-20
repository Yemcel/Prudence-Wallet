import { RANKS } from "./ranks.js";

// NOTE: model name — check https://docs.claude.com for the current recommended
// model string before shipping; this is a reasonable default at time of writing.
const MODEL = "claude-sonnet-5";

export async function classifyTransaction({ transaction, userAnswer, learnedRules }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it to backend/.env");
  }

  const rulesContext = learnedRules.length
    ? `Known patterns for this user so far:\n${learnedRules.map((r) => `- ${r}`).join("\n")}`
    : "No patterns learned yet for this user.";

  const system = `You are a spending coach inside a personal finance app. Classify a single transaction into exactly one of these seven prudence tiers, ordered most to least prudent: ${RANKS.map((r) => r.label).join(", ")}.

Use the user's own explanation of the purchase, not generic assumptions. If a clear reusable pattern emerges (e.g. "late-night rides after socializing = Wasteful for this user"), extract it as a short rule written in the user's voice. Otherwise return null for learned_rule.

${rulesContext}

Respond with ONLY a JSON object, no markdown fences, no preamble:
{"rank": "<one of the seven exact labels above>", "reasoning": "<one short sentence>", "learned_rule": "<short reusable rule, or null>"}`;

  const userMsg = `Transaction: ${transaction.merchant}, ${transaction.amount} ${transaction.currency}${
    transaction.time ? `, ${transaction.time}` : ""
  }, category: ${transaction.category || "unknown"}.
User's explanation: "${userAnswer}"`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.content.map((block) => block.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(`Coach returned non-JSON response: ${text}`);
  }
}
