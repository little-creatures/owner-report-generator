# Owner Report Generator POC

Local POC for small property managers who need to turn CSV/XLSX transaction exports into branded draft owner statements.

## Run Locally

```bash
cd /home/node/.openclaw/workspace/apps/owner-report-generator
npm install
npm run generate:fixtures
npm run dev
```

Open the Vite URL shown in the terminal. Use `fixtures/sample-owner-transactions.csv` or the generated `fixtures/sample-owner-transactions.xlsx`.

## Verification

```bash
npm run lint
npm run build
```

## POC Scope

- Local CSV/XLSX import only.
- Column mapping for owner, property, income, expense, and balance fields.
- Saved reusable mappings in browser local storage.
- Validation warnings for rows missing owner, property, or amount data.
- One branded owner statement template with per-owner notes.
- Batch PDF-ready statement output plus draft/export log in browser local storage.

This is a report-preparation POC. It does not integrate with accounting systems, send email, or claim to be a ledger of record.
