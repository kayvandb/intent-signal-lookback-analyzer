import { pearson, percentile, round, clamp } from "./stats.js";
import { daysBetween } from "./dates.js";

/**
 * Aggregates intent rows into per-account, per-topic sums within a lookback
 * window that trails a per-account anchor date.
 *
 * intentRows: [{ account, topic, value, date }]
 * anchorByAccount: Map<account, Date>  (the date each account's window trails from)
 * lookbackDays: number
 *
 * Returns Map<account, Map<topic, number>>
 */
function aggregateByAccountTopic(intentRows, anchorByAccount, lookbackDays) {
  const result = new Map();

  for (const row of intentRows) {
    const anchor = anchorByAccount.get(row.account);
    if (!anchor || !row.date) continue;

    const age = daysBetween(anchor, row.date); // days before anchor, positive = in the past
    if (age < 0 || age > lookbackDays) continue;

    if (!result.has(row.account)) result.set(row.account, new Map());
    const topicMap = result.get(row.account);
    topicMap.set(row.topic, (topicMap.get(row.topic) || 0) + row.value);
  }

  return result;
}

/**
 * Core historical lookback analysis: builds the case/control account set,
 * computes per-topic surge rate + correlation, checks pairwise collinearity,
 * and auto-selects topics that clear the significance threshold and aren't
 * redundant with a stronger topic already selected.
 */
export function runLookbackAnalysis({
  intentRows,
  pipelineRows,
  lookbackDays,
  significanceThreshold,
  collinearityThreshold,
  elevatedPercentile,
}) {
  // 1. Earliest qualifying pipeline date per account (outcome = 1)
  const pipelineDateByAccount = new Map();
  for (const row of pipelineRows) {
    if (!row.date) continue;
    const existing = pipelineDateByAccount.get(row.account);
    if (!existing || row.date < existing) {
      pipelineDateByAccount.set(row.account, row.date);
    }
  }

  // 2. Reference "as of" date for accounts with no pipeline event: the most
  // recent observation in the intent file. This gives control accounts a
  // comparable trailing window even though they have no event to anchor on.
  let maxIntentDate = null;
  const allAccounts = new Set();
  for (const row of intentRows) {
    allAccounts.add(row.account);
    if (row.date && (!maxIntentDate || row.date > maxIntentDate)) {
      maxIntentDate = row.date;
    }
  }
  for (const account of pipelineDateByAccount.keys()) allAccounts.add(account);

  const anchorByAccount = new Map();
  const outcomeByAccount = new Map();
  for (const account of allAccounts) {
    if (pipelineDateByAccount.has(account)) {
      anchorByAccount.set(account, pipelineDateByAccount.get(account));
      outcomeByAccount.set(account, 1);
    } else {
      anchorByAccount.set(account, maxIntentDate);
      outcomeByAccount.set(account, 0);
    }
  }

  // 3. Aggregate topic intent within each account's trailing lookback window
  const aggByAccount = aggregateByAccountTopic(
    intentRows,
    anchorByAccount,
    lookbackDays
  );

  const accounts = Array.from(allAccounts).sort();
  const topics = Array.from(new Set(intentRows.map((r) => r.topic))).sort();

  const outcomes = accounts.map((a) => outcomeByAccount.get(a));

  // 4. Per-topic vectors, correlation, elevated threshold, surge rate
  const topicVectors = new Map(); // topic -> array of aggregate values (account order)
  const topicStats = [];

  for (const topic of topics) {
    const xs = accounts.map((a) => aggByAccount.get(a)?.get(topic) || 0);
    topicVectors.set(topic, xs);

    const correlation = pearson(xs, outcomes);

    const activeValues = xs.filter((v) => v > 0);
    const elevatedThreshold =
      activeValues.length > 0 ? percentile(activeValues, elevatedPercentile) : 0;

    let elevatedCount = 0;
    let elevatedOutcomeSum = 0;
    let nonElevatedCount = 0;
    let nonElevatedOutcomeSum = 0;

    xs.forEach((v, i) => {
      const isElevated = v > 0 && v >= elevatedThreshold && elevatedThreshold > 0;
      if (isElevated) {
        elevatedCount++;
        elevatedOutcomeSum += outcomes[i];
      } else {
        nonElevatedCount++;
        nonElevatedOutcomeSum += outcomes[i];
      }
    });

    const surgeRate = elevatedCount > 0 ? elevatedOutcomeSum / elevatedCount : null;
    const baselineRate =
      nonElevatedCount > 0 ? nonElevatedOutcomeSum / nonElevatedCount : null;

    topicStats.push({
      topic,
      accountsWithActivity: activeValues.length,
      correlation: round(correlation, 3),
      elevatedThreshold: round(elevatedThreshold, 2),
      elevatedCount,
      nonElevatedCount,
      surgeRate: surgeRate === null ? null : round(surgeRate * 100, 1),
      baselineRate: baselineRate === null ? null : round(baselineRate * 100, 1),
      lift:
        surgeRate === null || baselineRate === null
          ? null
          : round((surgeRate - baselineRate) * 100, 1),
    });
  }

  // 5. Pairwise collinearity matrix between topic vectors
  const collinearity = new Map(); // "topicA|||topicB" -> r
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const r = pearson(topicVectors.get(topics[i]), topicVectors.get(topics[j]));
      collinearity.set(pairKey(topics[i], topics[j]), r);
    }
  }

  // 6. Auto-selection: eligible topics sorted by correlation desc, greedily
  // keep unless highly collinear with an already-selected (stronger) topic.
  const eligible = topicStats
    .filter((t) => t.correlation >= significanceThreshold)
    .sort((a, b) => b.correlation - a.correlation);

  const selected = [];
  const decisions = new Map(); // topic -> { selected, reason }

  for (const t of eligible) {
    let droppedFor = null;
    for (const chosen of selected) {
      const r = collinearity.get(pairKey(t.topic, chosen.topic));
      if (r !== undefined && Math.abs(r) >= collinearityThreshold) {
        droppedFor = chosen;
        break;
      }
    }
    if (droppedFor) {
      decisions.set(t.topic, {
        selected: false,
        reason: `Dropped — collinear with "${droppedFor.topic}" (r=${round(
          collinearity.get(pairKey(t.topic, droppedFor.topic)),
          2
        )}), which has a stronger correlation with pipeline creation.`,
      });
    } else {
      selected.push(t);
      decisions.set(t.topic, {
        selected: true,
        reason: `Selected — correlation r=${t.correlation} meets threshold (${significanceThreshold}).`,
      });
    }
  }

  for (const t of topicStats) {
    if (decisions.has(t.topic)) continue;
    if (t.correlation <= -significanceThreshold) {
      decisions.set(t.topic, {
        selected: false,
        reason: `Not selected — correlation r=${t.correlation} is negative, so elevated activity here does not predict pipeline creation.`,
      });
    } else {
      decisions.set(t.topic, {
        selected: false,
        reason: `Not selected — correlation r=${t.correlation} does not meet the ${significanceThreshold} threshold.`,
      });
    }
  }

  const correlationSumSelected = selected.reduce((s, t) => s + t.correlation, 0);
  const weights = new Map();
  for (const t of selected) {
    weights.set(
      t.topic,
      correlationSumSelected > 0 ? t.correlation / correlationSumSelected : 0
    );
  }

  const topicResults = topicStats
    .map((t) => ({
      ...t,
      selected: decisions.get(t.topic).selected,
      reason: decisions.get(t.topic).reason,
      weight: weights.has(t.topic) ? round(weights.get(t.topic), 3) : 0,
    }))
    .sort((a, b) => b.correlation - a.correlation);

  return {
    accounts,
    accountCount: accounts.length,
    pipelineAccountCount: outcomes.filter((o) => o === 1).length,
    controlAccountCount: outcomes.filter((o) => o === 0).length,
    topics: topicResults,
    selectedTopics: selected.map((t) => t.topic),
    weights,
    elevatedThresholds: new Map(
      topicStats.map((t) => [t.topic, t.elevatedThreshold])
    ),
    lookbackDays,
    significanceThreshold,
    collinearityThreshold,
    maxIntentDate,
  };
}

function pairKey(a, b) {
  return [a, b].sort().join("|||");
}
