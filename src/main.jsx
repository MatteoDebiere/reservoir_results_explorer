import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BarChart3, Search } from "lucide-react";
import data from "./data/reservoir_explorer_data.json";
import "./styles.css";

const METRIC_LABELS = {
  kge: "KGE",
  nse: "NSE",
  mae_norm: "Norm. MAE",
  rmse_norm: "Norm. RMSE",
};
const CONFIG_LABELS = {
  units: "Units",
  d: "Dropout",
  lr: "LR",
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

function displayConfigValue(value) {
  return String(value)
    .replace(/\\?\(?10\^\{-3\}\\?\)?/g, "0.001")
    .replace(/\\?\(?10\^-3\\?\)?/g, "0.001");
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
    data.reservoirs.find((reservoir) => reservoirHasSeries(reservoir, split)) ||
    data.reservoirs[0]
  );
}

function App() {
  const [split, setSplit] = useState("in_test");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(firstReservoirWithSeries("in_test").id);
  const [selectedModelChoice, setSelectedModelChoice] = useState(null);
  const splitOption = SPLIT_OPTIONS.find((option) => option.key === split);

  const searchableReservoirs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.reservoirs
      .filter((reservoir) => reservoirHasSeries(reservoir, split))
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
  const selectedModels = selected.modelsBySplit?.[split] || [];
  const selectedSplit = splitStats(selected, split);
  const bestKge = Math.max(
    ...selectedModels.map((model) => Number(model.kge)).filter(Number.isFinite),
  );
  const bestModel =
    selectedModels.find((model) => Number(model.kge) === bestKge) ||
    selectedModels[0] ||
    null;
  const selectedModelRunId =
    selectedModelChoice?.reservoirId === selected.id && selectedModelChoice?.split === split
      ? selectedModelChoice.runId
      : null;
  const selectedModel =
    selectedModels.find((model) => model.run_id === selectedModelRunId) ||
    bestModel;
  const selectedSeries = timeSeriesForModel(selected, split, selectedModel?.run_id);

  useEffect(() => {
    setSelectedModelChoice({
      reservoirId: selected.id,
      split,
      runId: bestModel?.run_id || null,
    });
  }, [selected.id, split, bestModel?.run_id]);

  return (
    <main className="demo-card">
      <header className="card-header">
        <div>
          <p className="eyebrow">Modelling Historical Reservoir Releases with Recurrent Deep Learning Methods</p>
          <h1>Results explorer</h1>
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

      <TimeSeriesChart series={selectedSeries} splitLabel={splitOption} selectedModel={selectedModel} />

      <section className="model-grid" aria-label={`${splitOption.label} model metrics`}>
        {selectedModels.map((model) => (
          <ModelMetric
            key={model.run_id}
            model={model}
            isBestKge={Number(model.kge) === bestKge}
            isSelected={model.run_id === selectedModel?.run_id}
            onSelect={() =>
              setSelectedModelChoice({
                reservoirId: selected.id,
                split,
                runId: model.run_id,
              })
            }
          />
        ))}
      </section>
    </main>
  );
}

function reservoirHasSeries(reservoir, split) {
  return Boolean(
    reservoir.timeSeriesBySplit?.[split]?.length ||
      Object.keys(reservoir.timeSeriesBySplitAndModel?.[split] || {}).length,
  );
}

function splitStats(reservoir, split) {
  return reservoir.splits?.find((item) => item.split === split);
}

function timeSeriesForModel(reservoir, split, runId) {
  const byModel = reservoir.timeSeriesBySplitAndModel?.[split] || {};
  return byModel[runId] || reservoir.timeSeriesBySplit?.[split] || [];
}

function configRows(model) {
  const [architectureSegment = "", ...parameterSegments] = String(model.configuration || "")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const architectureParts = architectureSegment.split(/\s+/).filter(Boolean);
  const units = architectureParts.length > 1 ? architectureParts.at(-1) : null;
  const architecture = architectureParts.length > 1
    ? architectureParts.slice(0, -1).join(" ")
    : model.architecture_label;
  const parsed = { architecture, units };

  parameterSegments.forEach((segment) => {
    const [key, ...valueParts] = segment.split("=");
    const normalizedKey = key?.trim();
    const value = valueParts.join("=").trim();
    if (normalizedKey && value) parsed[normalizedKey] = value;
  });

  return ["units", "d", "lr"]
    .filter((key) => parsed[key])
    .map((key) => ({
      key,
      label: CONFIG_LABELS[key] || key,
      value: displayConfigValue(parsed[key]),
    }));
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

function TimeSeriesChart({ series, splitLabel, selectedModel }) {
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
  const selectedModelLabel =
    selectedModel?.architecture_label ||
    selectedModel?.architectureLabel ||
    "selected model";

  return (
    <section className="chart-panel" aria-label="Monthly observed and predicted release series">
      <div className="chart-heading">
        <div>
          <h2>{splitLabel.timeseriesLabel}</h2>
          <p>
            Monthly mean normalised release, 2016-2020 · predictions from{" "}
            <strong>{selectedModelLabel}</strong>
            {selectedModel?.kge !== undefined ? ` · KGE ${fmtNumber(selectedModel.kge, 2)}` : ""} · {splitLabel.label}
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

function ModelMetric({ model, isBestKge, isSelected, onSelect }) {
  const selectWithKeyboard = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      className={`model-card${isBestKge ? " best-kge" : ""}${isSelected ? " is-selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${model.architecture_label} model metrics${isBestKge ? ", best KGE" : ""}${isSelected ? ", selected" : ""}`}
      onClick={onSelect}
      onKeyDown={selectWithKeyboard}
    >
      <div className="model-card-heading">
        <strong>{model.architecture_label}</strong>
        {isSelected && <span className="selected-pill">Selected</span>}
      </div>

      <table className="config-table" aria-label={`${model.architecture_label} configuration`}>
        <tbody>
          {configRows(model).map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="metric-list">
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
