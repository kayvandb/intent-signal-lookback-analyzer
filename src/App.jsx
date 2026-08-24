import React, { useMemo, useState } from "react";
import Dropzone from "./components/Dropzone.jsx";
import ColumnMapper from "./components/ColumnMapper.jsx";
import Section from "./components/Section.jsx";
import TopicTable from "./components/TopicTable.jsx";
import ScoredTable from "./components/ScoredTable.jsx";
import Disclaimer from "./components/Disclaimer.jsx";
import { mapRows, isMappingComplete } from "./lib/mapping.js";
import { runLookbackAnalysis } from "./lib/analysis.js";
import { scoreCurrentAccounts } from "./lib/scoring.js";
import { toCsv, downloadCsv } from "./lib/csv.js";

const INTENT_FIELDS = [
  { key: "account", label: "Account", type: "text", help: "Account or company identifier." },
  { key: "topic", label: "Topic / Category", type: "text", help: "The intent topic or keyword cluster." },
  { key: "value", label: "Intent score / volume", type: "number", help: "Numeric score or volume for this observation." },
  { key: "date", label: "Observation date", type: "date", help: "Date this intent activity was observed." },
];
const INTENT_ROLE_TYPES = { account: "text", topic: "text", value: "number", date: "date" };

const PIPELINE_FIELDS = [
  { key: "account", label: "Account", type: "text", help: "Must match the account names used in the intent file." },
  { key: "date", label: "Pipeline event date", type: "date", help: "See date concept selection below." },
];
const PIPELINE_ROLE_TYPES = { account: "text", date: "date" };

const CURRENT_FIELDS = [
  { key: "account", label: "Account", type: "text", help: "Account or company identifier." },
  { key: "topic", label: "Topic / Category", type: "text", help: "Should use the same topic names as the historical file." },
  { key: "value", label: "Intent score / volume", type: "number", help: "Recent numeric score or volume." },
  { key: "date", label: "Observation date", type: "date", help: "Date this recent intent activity was observed." },
];

const DATE_CONCEPTS = {
  first_meeting: {
    label: "First meeting / sales engagement date (recommended)",
    note: "Best choice. The lookback window ends right before a rep engaged, so intent activity in that window reflects organic buyer research — not the sales conversation itself.",
    tone: "good",
  },
  opportunity_created: {
    label: "Opportunity created date",
    note: "Reasonable substitute if first-meeting date isn't tracked. In many CRMs this fires close to first engagement, but check whether opportunities get created after initial contact in your process — if so, some real signal will be missed just after the window.",
    tone: "ok",
  },
  close_date: {
    label: "Close date (won)",
    note: "Not recommended. The lookback window will span the entire sales cycle, so it captures activity driven by the sales process itself (demos, proposal research, etc.), not the buyer-initiated intent that predates outreach. Correlations computed this way tend to overstate how predictive a topic really is.",
    tone: "bad",
  },
};

function useCsvUpload() {
  const [state, setState] = useState(null); // { file, headers, rows }
  const [mapping, setMapping] = useState({});
  return { state, setState, mapping, setMapping };
}

export default function App() {
  const intentUpload = useCsvUpload();
  const pipelineUpload = useCsvUpload();
  const currentUpload = useCsvUpload();

  const [dateConcept, setDateConcept] = useState("first_meeting");
  const [lookbackDays, setLookbackDays] = useState(60);
  const [significanceThreshold, setSignificanceThreshold] = useState(0.3);
  const [collinearityThreshold, setCollinearityThreshold] = useState(0.7);
  const [elevatedPercentile, setElevatedPercentile] = useState(75);
  const [actionDays, setActionDays] = useState(3);

  // --- Step 1: historical intent -------------------------------------
  const intentMappingComplete = isMappingComplete(intentUpload.mapping, INTENT_FIELDS);
  const intentMapped = useMemo(() => {
    if (!intentUpload.state || !intentMappingComplete) return null;
    return mapRows(intentUpload.state.rows, intentUpload.mapping, INTENT_ROLE_TYPES);
  }, [intentUpload.state, intentUpload.mapping, intentMappingComplete]);

  // --- Step 2: historical pipeline ------------------------------------
  const pipelineMappingComplete = isMappingComplete(pipelineUpload.mapping, PIPELINE_FIELDS);
  const pipelineMapped = useMemo(() => {
    if (!pipelineUpload.state || !pipelineMappingComplete) return null;
    return mapRows(pipelineUpload.state.rows, pipelineUpload.mapping, PIPELINE_ROLE_TYPES);
  }, [pipelineUpload.state, pipelineUpload.mapping, pipelineMappingComplete]);

  const step1Complete = !!intentMapped && intentMapped.rows.length > 0;
  const step2Complete = !!pipelineMapped && pipelineMapped.rows.length > 0;

  // --- Step 3/4: analysis ----------------------------------------------
  const analysis = useMemo(() => {
    if (!step1Complete || !step2Complete) return null;
    return runLookbackAnalysis({
      intentRows: intentMapped.rows,
      pipelineRows: pipelineMapped.rows,
      lookbackDays,
      significanceThreshold,
      collinearityThreshold,
      elevatedPercentile,
    });
  }, [
    step1Complete,
    step2Complete,
    intentMapped,
    pipelineMapped,
    lookbackDays,
    significanceThreshold,
    collinearityThreshold,
    elevatedPercentile,
  ]);

  const step3Complete = !!analysis && analysis.selectedTopics.length > 0;

  // --- Step 5: current accounts ------------------------------------
  const currentMappingComplete = isMappingComplete(currentUpload.mapping, CURRENT_FIELDS);
  const currentMapped = useMemo(() => {
    if (!currentUpload.state || !currentMappingComplete) return null;
    return mapRows(currentUpload.state.rows, currentUpload.mapping, INTENT_ROLE_TYPES);
  }, [currentUpload.state, currentUpload.mapping, currentMappingComplete]);

  const scored = useMemo(() => {
    if (!analysis || !currentMapped || currentMapped.rows.length === 0) return null;
    return scoreCurrentAccounts({
      currentRows: currentMapped.rows,
      selectedTopics: analysis.selectedTopics,
      weights: analysis.weights,
      elevatedThresholds: analysis.elevatedThresholds,
      lookbackDays,
      actionDays,
    });
  }, [analysis, currentMapped, lookbackDays, actionDays]);

  function exportTopicsCsv() {
    if (!analysis) return;
    const csv = toCsv(analysis.topics, [
      { key: "topic", label: "Topic" },
      { key: "accountsWithActivity", label: "Accounts Active" },
      { key: "correlation", label: "Correlation (r)" },
      { key: "surgeRate", label: "Surge Rate %" },
      { key: "baselineRate", label: "Baseline Rate %" },
      { key: "lift", label: "Lift (pts)" },
      { key: "weight", label: "Weight" },
      { key: "selected", label: "Selected" },
      { key: "reason", label: "Reason" },
    ]);
    downloadCsv("topic-analysis.csv", csv);
  }

  function exportScoredCsv() {
    if (!scored) return;
    const rows = scored.accounts.map((a, i) => ({
      rank: i + 1,
      account: a.account,
      score: a.score,
      tier: a.tier.label,
      topTopics: a.topTopics.join("; "),
      actionLine: a.actionLine,
      breakdown: a.contributions
        .filter((c) => c.contribution > 0)
        .map((c) => `${c.topic}: ${(c.contribution * 100).toFixed(1)}pts`)
        .join("; "),
    }));
    const csv = toCsv(rows, [
      { key: "rank", label: "Rank" },
      { key: "account", label: "Account" },
      { key: "score", label: "Surge Propensity Score" },
      { key: "tier", label: "Tier" },
      { key: "topTopics", label: "Top Topic(s)" },
      { key: "actionLine", label: "Suggested Next Action" },
      { key: "breakdown", label: "Score Breakdown" },
    ]);
    downloadCsv("scored-accounts.csv", csv);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Intent Signal Lookback Analyzer</h1>
        <p className="app-subtitle">
          Find which intent topics actually predict pipeline — then score current accounts
          on their surge propensity.
        </p>
      </header>

      <main className="app-main">
        <Section
          number={1}
          title="Historical intent signal export"
          subtitle="One row per account · topic · observation"
          status={step1Complete ? "complete" : "active"}
        >
          <p className="section__intro">
            Upload a CSV where each row is a single intent observation for an account on a
            topic — e.g. weekly research-activity exports from an intent data provider.
          </p>
          <Dropzone
            label="Upload historical intent CSV"
            fileName={intentUpload.state?.file?.name}
            rowCount={intentUpload.state?.rows?.length}
            onLoaded={({ file, headers, rows }) => {
              intentUpload.setState({ file, headers, rows });
              intentUpload.setMapping({});
            }}
          />
          {intentUpload.state && (
            <>
              <ColumnMapper
                headers={intentUpload.state.headers}
                fields={INTENT_FIELDS}
                mapping={intentUpload.mapping}
                onChange={(key, header) =>
                  intentUpload.setMapping((m) => ({ ...m, [key]: header }))
                }
                previewRows={intentUpload.state.rows}
              />
              {intentMapped && (
                <div className="mapping-summary">
                  {intentMapped.rows.length} row{intentMapped.rows.length === 1 ? "" : "s"} mapped
                  successfully.
                  {intentMapped.skipped > 0 && (
                    <span className="mapping-summary__warn">
                      {" "}
                      {intentMapped.skipped} row(s) skipped — missing account/topic, or an
                      unparseable value/date.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </Section>

        <Section
          number={2}
          title="Historical pipeline events"
          subtitle="One row per account · the date real pipeline was created"
          status={!step1Complete ? "locked" : step2Complete ? "complete" : "active"}
        >
          <p className="section__intro">
            Upload a CSV with one row per account that produced pipeline, and the date that
            happened.
          </p>
          <Dropzone
            label="Upload historical pipeline CSV"
            fileName={pipelineUpload.state?.file?.name}
            rowCount={pipelineUpload.state?.rows?.length}
            onLoaded={({ file, headers, rows }) => {
              pipelineUpload.setState({ file, headers, rows });
              pipelineUpload.setMapping({});
            }}
          />
          {pipelineUpload.state && (
            <>
              <ColumnMapper
                headers={pipelineUpload.state.headers}
                fields={PIPELINE_FIELDS}
                mapping={pipelineUpload.mapping}
                onChange={(key, header) =>
                  pipelineUpload.setMapping((m) => ({ ...m, [key]: header }))
                }
                previewRows={pipelineUpload.state.rows}
              />

              <div className="date-concept">
                <label className="mapper__label">What does this date represent?</label>
                <div className="date-concept__options">
                  {Object.entries(DATE_CONCEPTS).map(([key, cfg]) => (
                    <label key={key} className="date-concept__option">
                      <input
                        type="radio"
                        name="dateConcept"
                        checked={dateConcept === key}
                        onChange={() => setDateConcept(key)}
                      />
                      {cfg.label}
                    </label>
                  ))}
                </div>
                <div className={`date-concept__note date-concept__note--${DATE_CONCEPTS[dateConcept].tone}`}>
                  {DATE_CONCEPTS[dateConcept].note}
                </div>
              </div>

              {pipelineMapped && (
                <div className="mapping-summary">
                  {pipelineMapped.rows.length} row{pipelineMapped.rows.length === 1 ? "" : "s"} mapped
                  successfully.
                  {pipelineMapped.skipped > 0 && (
                    <span className="mapping-summary__warn">
                      {" "}
                      {pipelineMapped.skipped} row(s) skipped — missing account or unparseable
                      date.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </Section>

        <Section
          number={3}
          title="Lookback configuration & topic analysis"
          subtitle="Configure the window, then review which topics predict pipeline"
          status={!step2Complete ? "locked" : step3Complete ? "complete" : "active"}
        >
          <div className="config-grid">
            <ConfigField
              label="Lookback window (days)"
              help="How far before the pipeline event to look for intent activity."
              value={lookbackDays}
              onChange={setLookbackDays}
              min={1}
              max={365}
            />
            <ConfigField
              label="Significance threshold"
              help="Minimum |correlation| with pipeline creation for a topic to be auto-selected."
              value={significanceThreshold}
              onChange={setSignificanceThreshold}
              min={0}
              max={1}
              step={0.05}
            />
            <ConfigField
              label="Collinearity threshold"
              help="Topics correlated with each other above this are treated as redundant."
              value={collinearityThreshold}
              onChange={setCollinearityThreshold}
              min={0}
              max={1}
              step={0.05}
            />
            <ConfigField
              label="Elevated percentile"
              help="Percentile of a topic's active accounts used to define 'elevated' intent for surge rate."
              value={elevatedPercentile}
              onChange={setElevatedPercentile}
              min={50}
              max={99}
            />
          </div>

          {analysis && (
            <>
              <div className="analysis-summary">
                <SummaryStat label="Accounts analyzed" value={analysis.accountCount} />
                <SummaryStat label="Produced pipeline" value={analysis.pipelineAccountCount} />
                <SummaryStat label="Controls (no pipeline)" value={analysis.controlAccountCount} />
                <SummaryStat label="Topics selected" value={`${analysis.selectedTopics.length} / ${analysis.topics.length}`} />
              </div>

              <TopicTable topics={analysis.topics} significanceThreshold={significanceThreshold} />

              <button className="btn btn--secondary" onClick={exportTopicsCsv}>
                Export topic analysis (CSV)
              </button>

              {analysis.selectedTopics.length === 0 && (
                <div className="empty-note">
                  No topics cleared the significance threshold. Try lowering it, widening the
                  lookback window, or checking that account names line up between the two
                  files.
                </div>
              )}
            </>
          )}
        </Section>

        <Section
          number={4}
          title="Current accounts to score"
          subtitle="Same topic structure, recent activity, no outcome needed"
          status={!step3Complete ? "locked" : scored ? "complete" : "active"}
        >
          <p className="section__intro">
            Upload accounts you want scored today, using the same account/topic/value/date
            structure as the historical intent file.
          </p>
          <Dropzone
            label="Upload current accounts CSV"
            fileName={currentUpload.state?.file?.name}
            rowCount={currentUpload.state?.rows?.length}
            onLoaded={({ file, headers, rows }) => {
              currentUpload.setState({ file, headers, rows });
              currentUpload.setMapping({});
            }}
          />
          {currentUpload.state && (
            <>
              <ColumnMapper
                headers={currentUpload.state.headers}
                fields={CURRENT_FIELDS}
                mapping={currentUpload.mapping}
                onChange={(key, header) =>
                  currentUpload.setMapping((m) => ({ ...m, [key]: header }))
                }
                previewRows={currentUpload.state.rows}
              />
              <ConfigField
                label="Action window (business days)"
                help="Used in the suggested next-action line for each account."
                value={actionDays}
                onChange={setActionDays}
                min={1}
                max={30}
              />
              {currentMapped && (
                <div className="mapping-summary">
                  {currentMapped.rows.length} row{currentMapped.rows.length === 1 ? "" : "s"} mapped
                  successfully.
                  {currentMapped.skipped > 0 && (
                    <span className="mapping-summary__warn">
                      {" "}
                      {currentMapped.skipped} row(s) skipped — missing account/topic, or an
                      unparseable value/date.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </Section>

        <Section
          number={5}
          title="Surge Propensity scores"
          subtitle="Ranked account list with tier, driver topics, and suggested action"
          status={!scored ? "locked" : "complete"}
        >
          {scored && (
            <>
              <Disclaimer />
              <div className="tier-legend">
                <span className="tier-legend__item"><i className="dot" style={{ background: "#1a7f4b" }} /> Priority ≥ 70</span>
                <span className="tier-legend__item"><i className="dot" style={{ background: "#b8860b" }} /> Watch 40–69</span>
                <span className="tier-legend__item"><i className="dot" style={{ background: "#6b7280" }} /> Low &lt; 40</span>
              </div>
              <ScoredTable accounts={scored.accounts} />
              <button className="btn btn--primary" onClick={exportScoredCsv}>
                Export ranked list (CSV)
              </button>
            </>
          )}
        </Section>
      </main>

      <footer className="app-footer">
        Methodology and CSV format details are in the project README.
      </footer>
    </div>
  );
}

function ConfigField({ label, help, value, onChange, min, max, step = 1 }) {
  return (
    <div className="config-field">
      <label className="mapper__label">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value === "" ? "" : Number(e.target.value);
          onChange(v);
        }}
      />
      {help && <div className="mapper__help">{help}</div>}
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="summary-stat">
      <div className="summary-stat__value">{value}</div>
      <div className="summary-stat__label">{label}</div>
    </div>
  );
}
