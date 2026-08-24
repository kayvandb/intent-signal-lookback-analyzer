import React from "react";

export default function ScoredTable({ accounts }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="num">Rank</th>
            <th>Account</th>
            <th className="num">Surge Propensity Score</th>
            <th>Tier</th>
            <th>Top topic(s)</th>
            <th>Suggested next action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a, i) => (
            <tr key={a.account}>
              <td className="num">{i + 1}</td>
              <td className="cell-strong">{a.account}</td>
              <td className="num">
                <span className="score-pill" style={{ "--tier-color": a.tier.color }}>
                  {a.score}
                </span>
              </td>
              <td>
                <span className="badge badge--tier" style={{ "--tier-color": a.tier.color }}>
                  {a.tier.label}
                </span>
              </td>
              <td>{a.topTopics.length > 0 ? a.topTopics.join(", ") : "—"}</td>
              <td className="cell-action">{a.actionLine}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
