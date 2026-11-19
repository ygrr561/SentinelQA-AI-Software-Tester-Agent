# SentinelQA — AI Software Tester Agent

An autonomous full-stack AI software testing platform that inspects live web interfaces with **Playwright (Chromium)**, synthesizes structured test plans grounded in real DOM/accessibility elements, requires human review & approval, executes deterministic browser assertions, captures PNG screenshots, performs multimodal root-cause failure analysis, and exports formal JSON and PDF testing reports.

## Architecture Overview

> **Runtime Note:** Because the AI Studio host container provides Node.js 22 (with built-in SQLite and pre-installed Playwright Chromium) without Python `pip`, the live backend is implemented in modular **TypeScript + Express + Playwright-Core + Node SQLite** on port 3000 with full architectural and REST API parity.

```text
server.ts                           # Express + Vite middleware server (port 3000)
server/
  api/routes.ts                     # REST endpoints + SSE live stream + /sandbox-app
  agents/
    analyzerAgent.ts                # Playwright DOM & accessible locator inspector
    plannerAgent.ts                 # AI Test Planning Agent (structured JSON + Zod)
    executorAgent.ts                # Playwright Test Execution Agent + SSE progress
    failureAgent.ts                 # Multimodal Failure Analysis Agent (screenshot + logs)
    llmProvider.ts                  # Modular LLM gateway (Gemini default + OpenAI-compatible)
  browser/
    playwrightManager.ts            # Headless Chromium lifecycle, SSRF filtering, screenshots
    locatorStrategy.ts              # Accessible-first locators (role/label/placeholder/text)
    browserActions.ts               # Strict allowlisted action runner
  validation/
    assertions.ts                   # Deterministic browser assertions & failure categorization
  reports/
    reportGenerator.ts              # Structured QA report builder
  database/
    database.ts                     # Relational SQLite schema (test_runs, suites, cases, steps, results, screenshots, logs, reports)
  core/
    config.ts                       # Environment config & Chromium auto-detection
    security.ts                     # SSRF & private IP protection, redaction, destructive guards
    logging.ts                      # Redacted execution logger
  demo/
    demoTargetApp.ts                # Built-in authorized target app (/sandbox-app)
src/
  layouts/AppShell.tsx              # Dark engineering dashboard shell
  pages/
    DashboardPage.tsx               # Live SQLite KPIs, activity breakdown, recent runs
    NewTestRunPage.tsx              # Target URL, Playwright inspector, modes, plan launcher
    TestPlanPage.tsx                # Structured review, per-case approval checkboxes
    ExecutionPage.tsx               # Real-time SSE progress, step traces, logs, screenshots
    ReportsPage.tsx                 # Filterable report viewer + JSON & PDF export
    EvaluationPage.tsx              # Empirical benchmark metrics & Northstar Portal preview
```

## REST API Endpoints

- `POST /api/analyze` — Opens target URL in real Chromium and extracts bounded accessible DOM elements + initial screenshot.
- `POST /api/test-plans/generate` — Runs analysis (if needed) and synthesizes Zod-validated test cases via AI.
- `POST /api/test-plans/approve` — Approves selected test cases before execution.
- `POST /api/test-runs/execute` — Launches real Playwright execution asynchronously.
- `GET /api/test-runs/:id/stream` — Server-Sent Events (SSE) real-time execution stream.
- `GET /api/test-runs` & `GET /api/test-runs/:id` — Retrieve persisted test runs and suites.
- `GET /api/test-runs/:id/results` — Retrieve step-level results, failure analysis, screenshots, and logs.
- `GET /api/reports/:id` & `GET /api/reports/:id/export/json` — Retrieve or download structured JSON reports.
- `GET /api/dashboard/stats` — Aggregate pass/fail KPIs and failure classification breakdown.
- `GET /api/evaluation/metrics` — Empirical evaluation metrics computed from real SQLite runs.
- `GET /sandbox-app` (`?defects=true`) — Built-in authorized Northstar Portal test target.

## Security Safeguards

1. **SSRF & Private IP Protection:** Blocks `localhost`, loopback (`127.0.0.0/8`, `::1`), RFC1918 private networks, link-local metadata endpoints (`169.254.169.254`), and non-HTTP schemes at both URL validation and Playwright network-route levels.
2. **Allowlisted Actions Only:** The execution engine strictly enforces 16 allowlisted browser actions via Zod; arbitrary shell execution or code evaluation is never permitted.
3. **Credential Redaction & Guardrails:** Password/token inputs are redacted in execution logs, CAPTCHA/payment fields are flagged during inspection, and destructive clicks are blocked on external targets.

## Local Setup & Commands

1. Copy `.env.example` to `.env` and configure `GEMINI_API_KEY`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Ensure Chromium is available (auto-detected from `/ms-playwright` or install via `npx playwright install chromium`).
4. Start the development server (SQLite database initializes automatically in `data/sentinelqa.db`):
   ```bash
   npm run dev
   ```
5. Build for production:
   ```bash
   npm run build
   ```
