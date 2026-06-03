import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Database, Search } from "lucide-react";
import data from "./data/reservoir_explorer_data.json";
import "./styles.css";

const METRIC_LABELS = {
  kge: "KGE",
  nse: "NSE",
  mae_norm: "Norm. MAE",
  rmse_norm: "Norm. RMSE",
};
const SPLIT_OPTIONS = [
  { key: "in_test", label: "In-test", summaryLabel: "Best in-test model", timeseriesLabel: "In-test time series" },
  { key: "out_test", label: "Held-out reservoirs", summaryLabel: "Best held-out model",  timeseriesLabel: "Out-test time series" },
];

function fmtNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : "n/a";
}

function searchText(reservoir) {
  return [
    reservoir.id,
    reservoir.name,
    reservoir.state,
    reservoir.mainUse,
    reservoir.climateGroup,
  ]
    .join(" ")
    .toLowerCase();
}

function firstReservoirWithSeries(split) {
  return (
    data.reservoirs.find((reservoir) => reservoir.timeSeriesBySplit?.[split]?.length) ||
    data.reservoirs[0]
  );
}

function App() {
  const [split, setSplit] = useState("in_test");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(firstReservoirWithSeries("in_test").id);
  const splitOption = SPLIT_OPTIONS.find((option) => option.key === split);

  const searchableReservoirs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.reservoirs
      .filter((reservoir) => reservoir.timeSeriesBySplit?.[split]?.length)
      .filter((reservoir) => !normalized || searchText(reservoir).includes(normalized))
      .slice(0, 40);
  }, [query, split]);

  useEffect(() => {
    if (!searchableReservoirs.some((reservoir) => reservoir.id === selectedId)) {
      setSelectedId((searchableReservoirs[0] || firstReservoirWithSeries(split)).id);
    }
  }, [searchableReservoirs, selectedId, split]);

  const selected =
    data.reservoirs.find((reservoir) => reservoir.id === selectedId) ||
    searchableReservoirs[0] ||
    firstReservoirWithSeries(split);

  const summaryRows = data.summary.filter((row) => row.split === split);

  const bestSummary = summaryRows.reduce((winner, row) =>
    Number(row.in_test_median_kge) > Number(winner.in_test_median_kge) ? row : winner,
  );
  const predictionModel = data.metadata.predictionModel;
  const selectedModels = selected.modelsBySplit?.[split] || [];
  const selectedSeries = selected.timeSeriesBySplit?.[split] || [];
  const selectedSplit = splitStats(selected, split);

  return (
    <main className="demo-card">
      <header className="card-header">
        <div>
          <p className="eyebrow">Reservoir operation model</p>
          <h1>Predicted vs observed releases</h1>
        </div>
        <div className="mini-stat">
          <Database size={16} aria-hidden="true" />
          <span>{data.metadata.reservoirCount} reservoirs</span>
        </div>
      </header>

      <div className="split-toggle" role="group" aria-label="Evaluation split">
        {SPLIT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={split === option.key ? "active" : ""}
            onClick={() => setSplit(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="summary-row" aria-label="Model summary">
        <MetricPill icon={<BarChart3 size={12} />} label={splitOption.summaryLabel} value={bestSummary.architecture_label} />
        <MetricPill label="Median KGE" value={fmtNumber(bestSummary.in_test_median_kge, 2)} />
        <MetricPill label="Median NSE" value={fmtNumber(bestSummary.in_test_median_nse, 2)} />
      </section>

      <section className="selector-row">
        <label className="search-field">
          <Search size={12} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search reservoir"
          />
        </label>
        <select value={selected.id} onChange={(event) => setSelectedId(Number(event.target.value))}>
          {searchableReservoirs.map((reservoir) => (
            <option key={reservoir.id} value={reservoir.id}>
              {reservoir.name} · {reservoir.state}
            </option>
          ))}
        </select>
      </section>

      <section className="reservoir-strip" aria-label="Selected reservoir">
        <div>
          <h2>{selected.name}</h2>
          <p>
            {selected.state} · {selected.mainUse} · {selected.climateGroup}
          </p>
        </div>
        <div className="reservoir-facts">
          <span>{fmtNumber(selected.capacityMcm, 0)} MCM</span>
          <span>{shortDate(selectedSplit?.start_date)} to {shortDate(selectedSplit?.end_date)}</span>
        </div>
      </section>

      <TimeSeriesChart series={selectedSeries} splitLabel={splitOption} predictionModel={predictionModel} />

      <section className="model-grid" aria-label={`${splitOption.label} model metrics`}>
        {selectedModels.map((model) => (
          <ModelMetric key={model.run_id} model={model} />
        ))}
      </section>
    </main>
  );
}

function splitStats(reservoir, split) {
  return reservoir.splits?.find((item) => item.split === split);
}

function MetricPill({ icon, label, value }) {
  return (
    <div className="metric-pill">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TimeSeriesChart({ series, splitLabel, predictionModel }) {
  const width = 720;
  const height = 220;
  const padding = { top: 14, right: 16, bottom: 30, left: 38 };
  const values = series.flatMap((point) => [point.observed, point.predicted]).filter(Number.isFinite);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const spread = Math.max(maxValue - minValue, 0.000001);
  const xStep = series.length > 1 ? (width - padding.left - padding.right) / (series.length - 1) : 0;

  const pointFor = (point, index, key) => {
    const x = padding.left + index * xStep;
    const y =
      padding.top +
      (1 - (Number(point[key]) - minValue) / spread) *
        (height - padding.top - padding.bottom);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const observedPath = series.map((point, index) => pointFor(point, index, "observed")).join(" ");
  const predictedPath = series.map((point, index) => pointFor(point, index, "predicted")).join(" ");

  return (
    <section className="chart-panel" aria-label="Monthly observed and predicted release series">
      <div className="chart-heading">
        <div>
          <h2>{splitLabel.timeseriesLabel}</h2>
          <p>
            Monthly mean normalised release, 2016-2020 · predictions from{" "}
            {predictionModel.architectureLabel} ({predictionModel.description}) · {splitLabel.label}
          </p>
        </div>
        <div className="legend">
          <span className="observed">Observed</span>
          <span className="predicted">Predicted</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line className="axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
        <line className="axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        <text x="4" y={padding.top + 6}>{fmtNumber(maxValue, 1)}</text>
        <text x="4" y={height - padding.bottom}>{fmtNumber(minValue, 1)}</text>
        <text x={padding.left} y={height - 8}>{shortDate(series[0]?.month).slice(0, 4)}</text>
        <text x={width - 64} y={height - 8}>{shortDate(series.at(-1)?.month).slice(0, 4)}</text>
        <polyline className="series observed-line" points={observedPath} />
        <polyline className="series predicted-line" points={predictedPath} />
      </svg>
    </section>
  );
}

function ModelMetric({ model }) {
  return (
    <article className="model-card">
      <div>
        <strong>{model.architecture_label}</strong>
        <span>{model.configuration}</span>
      </div>
      <dl>
        {["kge", "nse", "mae_norm", "rmse_norm"].map((key) => (
          <React.Fragment key={key}>
            <dt>{METRIC_LABELS[key]}</dt>
            <dd>{fmtNumber(model[key], 2)}</dd>
          </React.Fragment>
        ))}
      </dl>
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
