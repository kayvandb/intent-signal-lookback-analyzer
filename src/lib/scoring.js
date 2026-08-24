import { clamp, round } from "./stats.js";
import { daysBetween } from "./dates.js";

export const TIERS = {
  PRIORITY: { key: "priority", label: "Priority", min: 70, color: "#1a7f4b" },
  WATCH: { key: "watch", label: "Watch", min: 40, color: "#b8860b" },
  LOW: { key: "low", label: "Low", min: 0, color: "#6b7280" },
};

export function tierFor(score) {
  if (score >= TIERS.PRIORITY.min) return TIERS.PRIORITY;
  if (score >= TIERS.WATCH.min) return TIERS.WATCH;
  return TIERS.LOW;
}

/**
 * Scores current accounts against the selected topics from the historical
 * analysis. Aggregates each account's recent intent per topic within a
 * trailing lookback window anchored at the most recent date in the current
 * file (there's no pipeline event to anchor on for current accounts).
 */
export function scoreCurrentAccounts({
  currentRows,
  selectedTopics,
  weights,
  elevatedThresholds,
  lookbackDays,
  actionDays,
}) {
  let maxDate = null;
  for (const row of currentRows) {
    if (row.date && (!maxDate || row.date > maxDate)) maxDate = row.date;
  }

  const byAccount = new Map();
  for (const row of currentRows) {
    if (!byAccount.has(row.account)) byAccount.set(row.account, new Map());
    if (!maxDate || !row.date) continue;
    const age = daysBetween(maxDate, row.date);
    if (age < 0 || age > lookbackDays) continue;
    const topicMap = byAccount.get(row.account);
    topicMap.set(row.topic, (topicMap.get(row.topic) || 0) + row.value);
  }

  const results = [];

  for (const [account, topicMap] of byAccount.entries()) {
    const contributions = [];

    for (const topic of selectedTopics) {
      const value = topicMap.get(topic) || 0;
      const threshold = elevatedThresholds.get(topic) || 0;
      const normalized = threshold > 0 ? clamp(value / threshold, 0, 1) : 0;
      const weight = weights.get(topic) || 0;
      const contribution = weight * normalized;
      contributions.push({
        topic,
        value: round(value, 2),
        threshold: round(threshold, 2),
        normalized: round(normalized, 3),
        weight: round(weight, 3),
        contribution,
      });
    }

    const rawScore = contributions.reduce((s, c) => s + c.contribution, 0);
    const score = Math.round(clamp(rawScore, 0, 1) * 100);
    const tier = tierFor(score);

    // Only count a topic as a driver if it contributes at least ~1 point of
    // the 0-100 score — otherwise a rounding-invisible sliver of "signal"
    // can label a 0-scored account as having a topic surge.
    const rankedContributions = [...contributions]
      .filter((c) => c.contribution * 100 >= 1)
      .sort((a, b) => b.contribution - a.contribution);

    const topTopics = rankedContributions.slice(0, 2).map((c) => c.topic);

    const actionLine =
      topTopics.length > 0
        ? `Surge on ${topTopics[0]} — recommend outbound referencing ${topTopics[0]} within ${actionDays} business days`
        : `No significant topic surge detected — monitor, do not prioritize outbound yet`;

    results.push({
      account,
      score,
      tier,
      contributions,
      topTopics,
      actionLine,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return { accounts: results, asOfDate: maxDate };
}
