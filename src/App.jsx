import { useMemo, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";

const MAPPING_STORAGE_KEY = "owner-report-generator:mapping:v1";
const LOG_STORAGE_KEY = "owner-report-generator:export-log:v1";

const requiredFields = [
  { key: "owner", label: "Owner", aliases: ["owner", "owner name", "landlord"] },
  { key: "property", label: "Property", aliases: ["property", "building", "address"] },
  { key: "income", label: "Income", aliases: ["income", "rent", "credit"] },
  { key: "expense", label: "Expenses", aliases: ["expense", "expenses", "debit"] },
  { key: "balance", label: "Balance", aliases: ["balance", "ending balance", "net"] },
];

const optionalFields = [
  { key: "unit", label: "Unit" },
  { key: "date", label: "Transaction Date" },
  { key: "category", label: "Category" },
  { key: "notes", label: "Source Notes" },
  { key: "email", label: "Owner Email" },
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const defaultBrand = {
  companyName: "Northline Property Co.",
  tagline: "Draft owner statement",
  period: "May 2026",
  contact: "reports@northline.example",
};

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function guessMapping(headers) {
  const mapping = {};

  for (const field of [...requiredFields, ...optionalFields]) {
    const match = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return (
        normalized === normalizeHeader(field.label) ||
        field.aliases?.some((alias) => normalized === alias)
      );
    });

    if (match) {
      mapping[field.key] = match;
    }
  }

  return mapping;
}

function parseMoney(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const cleaned = String(value).replace(/[$,()\s]/g, "");
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return String(value).includes("(") ? -Math.abs(parsed) : parsed;
}

function hasAmount(row, mapping) {
  const income = row[mapping.income];
  const expense = row[mapping.expense];
  const balance = row[mapping.balance];

  return [income, expense, balance].some((value) => {
    if (value === null || value === undefined || String(value).trim() === "") {
      return false;
    }
    return !Number.isNaN(Number(String(value).replace(/[$,()\s]/g, "")));
  });
}

function buildWarnings(rows, mapping) {
  const warnings = [];
  const missingMappedFields = requiredFields.filter((field) => !mapping[field.key]);

  for (const field of missingMappedFields) {
    warnings.push({
      type: "mapping",
      label: `Map the ${field.label.toLowerCase()} column before export.`,
    });
  }

  rows.forEach((row, index) => {
    if (mapping.owner && !String(row[mapping.owner] || "").trim()) {
      warnings.push({ type: "row", label: `Row ${index + 2}: missing owner.` });
    }
    if (mapping.property && !String(row[mapping.property] || "").trim()) {
      warnings.push({ type: "row", label: `Row ${index + 2}: missing property.` });
    }
    if (mapping.income && mapping.expense && mapping.balance && !hasAmount(row, mapping)) {
      warnings.push({ type: "row", label: `Row ${index + 2}: missing income, expense, and balance.` });
    }
  });

  return warnings;
}

function groupStatements(rows, mapping, ownerNotes) {
  const grouped = new Map();

  rows.forEach((row) => {
    const owner = String(row[mapping.owner] || "").trim();
    const property = String(row[mapping.property] || "").trim();

    if (!owner || !property || !hasAmount(row, mapping)) {
      return;
    }

    const income = parseMoney(row[mapping.income]);
    const expense = parseMoney(row[mapping.expense]);
    const balance = parseMoney(row[mapping.balance]);
    const current = grouped.get(owner) || {
      owner,
      email: mapping.email ? row[mapping.email] : "",
      properties: new Set(),
      rows: [],
      income: 0,
      expenses: 0,
      balance,
      note: ownerNotes[owner] || "",
    };

    current.properties.add(property);
    current.rows.push({
      date: mapping.date ? row[mapping.date] : "",
      property,
      unit: mapping.unit ? row[mapping.unit] : "",
      category: mapping.category ? row[mapping.category] : "",
      income,
      expense,
      balance,
      notes: mapping.notes ? row[mapping.notes] : "",
    });
    current.income += income;
    current.expenses += expense;
    current.balance = balance || current.balance;
    grouped.set(owner, current);
  });

  return [...grouped.values()].map((statement) => ({
    ...statement,
    properties: [...statement.properties],
    net: statement.income - statement.expenses,
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ownerFilename(owner, period) {
  return `${owner.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${period.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf-ready.html`;
}

function buildStatementHtml({ statements, brand }) {
  const pages = statements
    .map(
      (statement) => `
        <section class="page">
          <header>
            <div>
              <strong>${escapeHtml(brand.companyName || defaultBrand.companyName)}</strong>
              <span>${escapeHtml(brand.tagline || defaultBrand.tagline)}</span>
            </div>
            <em>Draft</em>
          </header>
          <h1>Owner Statement: ${escapeHtml(statement.owner)}</h1>
          <p class="meta">Reporting period: ${escapeHtml(brand.period || defaultBrand.period)}</p>
          <p class="meta">Properties: ${escapeHtml(statement.properties.join(", "))}</p>
          <p class="meta">Contact: ${escapeHtml(brand.contact || defaultBrand.contact)}</p>
          <div class="metrics">
            <div><span>Income</span><b>${currencyFormatter.format(statement.income)}</b></div>
            <div><span>Expenses</span><b>${currencyFormatter.format(statement.expenses)}</b></div>
            <div><span>Net</span><b>${currencyFormatter.format(statement.net)}</b></div>
            <div><span>Ending Balance</span><b>${currencyFormatter.format(statement.balance)}</b></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Property / Unit</th>
                <th>Category</th>
                <th>Income</th>
                <th>Expense</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              ${statement.rows
                .map(
                  (row) => `
                    <tr>
                      <td>${escapeHtml(row.date || "-")}</td>
                      <td>${escapeHtml(`${row.property}${row.unit ? ` / ${row.unit}` : ""}`)}</td>
                      <td>${escapeHtml(row.category || "-")}</td>
                      <td>${currencyFormatter.format(row.income)}</td>
                      <td>${currencyFormatter.format(row.expense)}</td>
                      <td>${currencyFormatter.format(row.balance)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
          ${
            statement.note
              ? `<aside><b>Owner note</b><p>${escapeHtml(statement.note)}</p></aside>`
              : ""
          }
          <footer>Draft report prepared from uploaded spreadsheet data. Not a ledger of record.</footer>
        </section>
      `,
    )
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Owner Statements</title>
        <style>
          body { color: #182126; font-family: Arial, sans-serif; margin: 0; }
          .page { min-height: 10.3in; padding: 0.45in; page-break-after: always; }
          header { align-items: center; background: #184655; color: #fff; display: flex; justify-content: space-between; margin: -0.45in -0.45in 0.3in; padding: 0.22in 0.45in; }
          header strong { display: block; font-size: 18px; }
          header span { color: #c3e5df; display: block; font-size: 12px; margin-top: 4px; }
          header em { border: 1px solid rgba(255,255,255,0.4); border-radius: 999px; font-size: 12px; font-style: normal; padding: 5px 10px; }
          h1 { font-size: 20px; margin: 0 0 10px; }
          .meta { color: #536066; margin: 4px 0; }
          .metrics { display: grid; gap: 10px; grid-template-columns: repeat(4, 1fr); margin: 22px 0; }
          .metrics div { background: #eef5f3; border-radius: 6px; padding: 12px; }
          .metrics span { color: #536066; display: block; font-size: 11px; font-weight: 700; margin-bottom: 5px; text-transform: uppercase; }
          table { border-collapse: collapse; font-size: 11px; width: 100%; }
          th, td { border-bottom: 1px solid #dce4e2; padding: 8px 6px; text-align: left; }
          th { color: #536066; }
          aside { background: #fff8e5; border-radius: 6px; color: #5c461a; margin-top: 22px; padding: 12px; }
          aside p { margin-bottom: 0; }
          footer { bottom: 0.3in; color: #687277; font-size: 10px; position: fixed; }
          @page { margin: 0; size: letter; }
          @media print { .page { min-height: auto; } }
        </style>
      </head>
      <body>${pages}</body>
    </html>`;
}

function generatePdfReadyOutput({ statements, brand, addLogEntries }) {
  const timestamp = new Date().toISOString();
  const period = brand.period || defaultBrand.period;
  const html = buildStatementHtml({ statements, brand });
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  window.open(url, "_blank", "noopener,noreferrer");
  addLogEntries(
    statements.map((statement) => ({
      owner: statement.owner,
      period,
      timestamp,
      filename: ownerFilename(statement.owner, period),
    })),
  );
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject,
    });
  });
}

async function parseXlsx(file) {
  const sheetRows = await readXlsxFile(file);
  const headers = sheetRows[0]?.map((header) => String(header || "").trim()) || [];

  if (headers.length === 0) {
    return [];
  }

  return sheetRows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) {
        record[header] = row[index] ?? "";
      }
    });
    return record;
  });
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState(() => loadJson(MAPPING_STORAGE_KEY, {}));
  const [brand, setBrand] = useState(defaultBrand);
  const [ownerNotes, setOwnerNotes] = useState({});
  const [exportLog, setExportLog] = useState(() => loadJson(LOG_STORAGE_KEY, []));
  const [error, setError] = useState("");

  const warnings = useMemo(() => buildWarnings(rows, mapping), [rows, mapping]);
  const statements = useMemo(
    () => groupStatements(rows, mapping, ownerNotes),
    [rows, mapping, ownerNotes],
  );
  const canExport = rows.length > 0 && statements.length > 0 && warnings.length === 0;

  async function handleFile(file) {
    if (!file) {
      return;
    }

    setError("");

    try {
      const extension = file.name.split(".").pop().toLowerCase();
      const parsedRows = extension === "xlsx" || extension === "xls" ? await parseXlsx(file) : await parseCsv(file);
      const cleanRows = parsedRows.filter((row) => Object.values(row).some((value) => String(value || "").trim()));
      const nextHeaders = Object.keys(cleanRows[0] || {});
      const guessed = { ...guessMapping(nextHeaders), ...loadJson(MAPPING_STORAGE_KEY, {}) };

      setRows(cleanRows);
      setHeaders(nextHeaders);
      setFileName(file.name);
      setMapping(guessed);
    } catch (caughtError) {
      setError(caughtError.message || "Could not read the uploaded file.");
    }
  }

  function saveMapping() {
    window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping));
  }

  function resetMapping() {
    const guessed = guessMapping(headers);
    setMapping(guessed);
    window.localStorage.removeItem(MAPPING_STORAGE_KEY);
  }

  function addLogEntries(entries) {
    const nextLog = [...entries, ...exportLog].slice(0, 25);
    setExportLog(nextLog);
    window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(nextLog));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local POC</p>
          <h1>Owner Report Generator</h1>
        </div>
        <div className="status-strip">
          <span>{rows.length} rows</span>
          <span>{statements.length} statements</span>
          <span>{warnings.length} warnings</span>
        </div>
      </header>

      <section className="workflow">
        <aside className="left-rail">
          <label className="upload-target">
            <Upload aria-hidden="true" />
            <strong>Import CSV or XLSX</strong>
            <span>{fileName || "Drop in a local fixture export"}</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </label>

          <div className="panel">
            <div className="panel-title">
              <FileSpreadsheet aria-hidden="true" />
              <h2>Column Mapping</h2>
            </div>
            {[...requiredFields, ...optionalFields].map((field) => (
              <label className="field-row" key={field.key}>
                <span>{field.label}</span>
                <select
                  value={mapping[field.key] || ""}
                  onChange={(event) =>
                    setMapping((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="button-row">
              <button type="button" onClick={saveMapping}>
                <Save size={16} aria-hidden="true" />
                Save mapping
              </button>
              <button type="button" className="secondary" onClick={resetMapping}>
                <RotateCcw size={16} aria-hidden="true" />
                Reset
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Branding</h2>
            {Object.keys(defaultBrand).map((key) => (
              <label className="field-row stacked" key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input
                  value={brand[key]}
                  onChange={(event) => setBrand((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
        </aside>

        <section className="main-stage">
          {error && <div className="error-banner">{error}</div>}

          <div className="summary-band">
            <div>
              <span>Total income</span>
              <strong>{currencyFormatter.format(statements.reduce((sum, item) => sum + item.income, 0))}</strong>
            </div>
            <div>
              <span>Total expenses</span>
              <strong>{currencyFormatter.format(statements.reduce((sum, item) => sum + item.expenses, 0))}</strong>
            </div>
            <div>
              <span>Draft net</span>
              <strong>{currencyFormatter.format(statements.reduce((sum, item) => sum + item.net, 0))}</strong>
            </div>
          </div>

          <div className="split-content">
            <section className="panel warnings-panel">
              <div className="panel-title">
                <AlertTriangle aria-hidden="true" />
                <h2>Validation</h2>
              </div>
              {warnings.length === 0 ? (
                <p className="empty">No blocking warnings for the current import.</p>
              ) : (
                <ul className="warning-list">
                  {warnings.slice(0, 12).map((warning) => (
                    <li key={warning.label}>{warning.label}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <div className="panel-title">
                <FileText aria-hidden="true" />
                <h2>PDF-Ready Batch</h2>
              </div>
              <p className="muted">
                Opens one print-ready document containing a branded statement page for each valid owner.
              </p>
              <button
                type="button"
                className="primary-action"
                disabled={!canExport}
                onClick={() => generatePdfReadyOutput({ statements, brand, addLogEntries })}
              >
                <Download size={17} aria-hidden="true" />
                Prepare PDF-ready batch
              </button>
            </section>
          </div>

          <section className="statement-list">
            {statements.map((statement) => (
              <article className="statement-card" key={statement.owner}>
                <div className="statement-header">
                  <div>
                    <h3>{statement.owner}</h3>
                    <p>{statement.properties.join(", ")}</p>
                  </div>
                  <strong>{currencyFormatter.format(statement.net)}</strong>
                </div>
                <div className="statement-metrics">
                  <span>Income {currencyFormatter.format(statement.income)}</span>
                  <span>Expenses {currencyFormatter.format(statement.expenses)}</span>
                  <span>Balance {currencyFormatter.format(statement.balance)}</span>
                </div>
                <label className="note-box">
                  <span>Per-owner note</span>
                  <textarea
                    value={ownerNotes[statement.owner] || ""}
                    onChange={(event) =>
                      setOwnerNotes((current) => ({ ...current, [statement.owner]: event.target.value }))
                    }
                    placeholder="Add a note for this owner statement"
                  />
                </label>
              </article>
            ))}
          </section>

          <section className="panel export-log">
            <h2>Draft / Export Log</h2>
            {exportLog.length === 0 ? (
              <p className="empty">Prepared statement batches will be logged here.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Period</th>
                    <th>Timestamp</th>
                    <th>Filename</th>
                  </tr>
                </thead>
                <tbody>
                  {exportLog.map((entry) => (
                    <tr key={`${entry.timestamp}-${entry.owner}`}>
                      <td>{entry.owner}</td>
                      <td>{entry.period}</td>
                      <td>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td>{entry.filename}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
