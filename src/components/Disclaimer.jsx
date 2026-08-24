import React from "react";

export default function Disclaimer() {
  return (
    <div className="disclaimer">
      <span className="disclaimer__icon">⚠</span>
      <div>
        <strong>Directional indicator, not a calibrated probability.</strong> The Surge
        Propensity Score is derived from how strongly each topic correlated with pipeline
        creation in your historical data. It is meant to help prioritize outbound effort —
        not to predict individual account outcomes, and not a substitute for rep judgment
        or deal context.
      </div>
    </div>
  );
}
