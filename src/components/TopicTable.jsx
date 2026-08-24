import React from "react";

export default function TopicTable({ topics, significanceThreshold }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Topic</th>
            <th className="num">Accounts active</th>
            <th className="num">Correlation (r)</th>
            <th className="num">Surge rate</th>
            <th className="num">Baseline rate</th>
            <th className="num">Lift</th>
            <th className="num">Weight</th>
            <th>Status</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.topic} className={t.selected ? "row--selected" : ""}>
              <td className="cell-strong">{t.topic}</td>
              <td className="num">{t.accountsWithActivity}</td>
              <td className={`num ${corrClass(t.correlation, significanceThreshold)}`}>
                {t.correlation.toFixed(3)}
              </td>
              <td className="num">{t.surgeRate === null ? "—" : `${t.surgeRate}%`}</td>
              <td className="num">{t.baselineRate === null ? "—" : `${t.baselineRate}%`}</td>
              <td className={`num ${t.lift > 0 ? "text-positive" : t.lift < 0 ? "text-negative" : ""}`}>
                {t.lift === null ? "—" : `${t.lift > 0 ? "+" : ""}${t.lift} pts`}
              </td>
              <td className="num">{t.selected ? t.weight.toFixed(3) : "—"}</td>
              <td>
                <span className={`badge ${t.selected ? "badge--selected" : "badge--dropped"}`}>
                  {t.selected ? "Selected" : "Not selected"}
                </span>
              </td>
              <td className="cell-reason">{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function corrClass(r, threshold) {
  if (r >= threshold) return "text-positive";
  if (r <= -threshold) return "text-negative";
  return "";
}
