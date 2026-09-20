import React from "react";
import { styles } from "../styles/theme.js";

export default function LearnedRules({ rules }) {
  if (!rules || rules.length === 0) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={styles.sectionHeading}>What it's learned about you</div>
      {rules.map((r) => (
        <div key={r.rule_text} style={styles.ruleItem}>
          "{r.rule_text}"
        </div>
      ))}
    </section>
  );
}
