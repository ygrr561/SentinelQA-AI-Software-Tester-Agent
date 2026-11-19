import { DatabaseSync } from 'node:sqlite';
import { getConfig } from '../core/config.ts';
import type {
  FailureAnalysisResult,
  PageAnalysis,
  StepExecutionRecord,
  TestCase,
  TestCaseExecutionRecord,
  TestMode,
  TestStatus,
} from '../schemas/testPlan.ts';
import type { LogEntry } from '../core/logging.ts';

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const cfg = getConfig();
  const db = new DatabaseSync(cfg.sqliteDbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  initializeSchema(db);
  dbInstance = db;
  return db;
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      display_url TEXT NOT NULL,
      objective TEXT NOT NULL,
      mode TEXT NOT NULL,
      requested_count INTEGER NOT NULL DEFAULT 6,
      ai_provider TEXT NOT NULL,
      ai_model TEXT NOT NULL,
      status TEXT NOT NULL,
      page_analysis_json TEXT,
      plan_generation_ms INTEGER DEFAULT 0,
      execution_duration_ms INTEGER DEFAULT 0,
      total_cases INTEGER DEFAULT 0,
      passed_cases INTEGER DEFAULT 0,
      failed_cases INTEGER DEFAULT 0,
      skipped_cases INTEGER DEFAULT 0,
      error_cases INTEGER DEFAULT 0,
      pass_percentage REAL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_suites (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      suite_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      preconditions_json TEXT NOT NULL,
      expected_result TEXT NOT NULL,
      priority TEXT NOT NULL,
      category TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (run_id, id),
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      locator_json TEXT,
      value TEXT,
      expected TEXT,
      FOREIGN KEY (run_id, test_case_id) REFERENCES test_cases(run_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS execution_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      status TEXT NOT NULL,
      actual_result TEXT NOT NULL,
      validation_method TEXT NOT NULL,
      failure_category TEXT,
      error_message TEXT,
      failure_analysis_json TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      screenshot_file TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      UNIQUE (run_id, test_case_id),
      FOREIGN KEY (run_id, test_case_id) REFERENCES test_cases(run_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS step_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_case_id TEXT NOT NULL,
      step_number INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      locator_summary TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      expected_result TEXT NOT NULL,
      actual_result TEXT NOT NULL,
      validation_method TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_category TEXT,
      error_message TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      screenshot_file TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (run_id, test_case_id) REFERENCES test_cases(run_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      test_case_id TEXT,
      step_number INTEGER,
      filename TEXT NOT NULL,
      caption TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS execution_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      test_case_id TEXT,
      step_index INTEGER,
      level TEXT NOT NULL,
      component TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      generated_at TEXT NOT NULL,
      report_json TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_test_runs_created_at ON test_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_execution_logs_run_id ON execution_logs(run_id, id);
    CREATE INDEX IF NOT EXISTS idx_step_results_run_case ON step_results(run_id, test_case_id, step_number);
  `);
}

export interface StoredTestRunRow {
  id: string;
  target_url: string;
  display_url: string;
  objective: string;
  mode: TestMode;
  requested_count: number;
  ai_provider: string;
  ai_model: string;
  status: string;
  page_analysis_json: string | null;
  plan_generation_ms: number;
  execution_duration_ms: number;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  skipped_cases: number;
  error_cases: number;
  pass_percentage: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export function createTestRunRecord(params: {
  id: string;
  targetUrl: string;
  displayUrl: string;
  objective: string;
  mode: TestMode;
  requestedCount: number;
  aiProvider: string;
  aiModel: string;
  status: string;
  pageAnalysis?: PageAnalysis;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO test_runs (
      id, target_url, display_url, objective, mode, requested_count,
      ai_provider, ai_model, status, page_analysis_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.targetUrl,
    params.displayUrl,
    params.objective,
    params.mode,
    params.requestedCount,
    params.aiProvider,
    params.aiModel,
    params.status,
    params.pageAnalysis ? JSON.stringify(params.pageAnalysis) : null,
    now,
    now
  );
}

export function updateTestRunStatus(
  runId: string,
  updates: {
    status?: string;
    pageAnalysis?: PageAnalysis;
    planGenerationMs?: number;
    executionDurationMs?: number;
    totalCases?: number;
    passedCases?: number;
    failedCases?: number;
    skippedCases?: number;
    errorCases?: number;
    passPercentage?: number;
    errorMessage?: string | null;
  }
): void {
  const db = getDb();
  const sets: string[] = ['updated_at = ?'];
  const values: Array<string | number | null> = [new Date().toISOString()];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.pageAnalysis !== undefined) {
    sets.push('page_analysis_json = ?');
    values.push(JSON.stringify(updates.pageAnalysis));
  }
  if (updates.planGenerationMs !== undefined) {
    sets.push('plan_generation_ms = ?');
    values.push(updates.planGenerationMs);
  }
  if (updates.executionDurationMs !== undefined) {
    sets.push('execution_duration_ms = ?');
    values.push(updates.executionDurationMs);
  }
  if (updates.totalCases !== undefined) {
    sets.push('total_cases = ?');
    values.push(updates.totalCases);
  }
  if (updates.passedCases !== undefined) {
    sets.push('passed_cases = ?');
    values.push(updates.passedCases);
  }
  if (updates.failedCases !== undefined) {
    sets.push('failed_cases = ?');
    values.push(updates.failedCases);
  }
  if (updates.skippedCases !== undefined) {
    sets.push('skipped_cases = ?');
    values.push(updates.skippedCases);
  }
  if (updates.errorCases !== undefined) {
    sets.push('error_cases = ?');
    values.push(updates.errorCases);
  }
  if (updates.passPercentage !== undefined) {
    sets.push('pass_percentage = ?');
    values.push(updates.passPercentage);
  }
  if (updates.errorMessage !== undefined) {
    sets.push('error_message = ?');
    values.push(updates.errorMessage);
  }

  values.push(runId);
  db.prepare(`UPDATE test_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function saveTestSuiteAndCases(params: {
  runId: string;
  suiteId: string;
  suiteName: string;
  summary: string;
  testCases: TestCase[];
}): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM test_suites WHERE run_id = ?').run(params.runId);

    db.prepare(
      `INSERT INTO test_suites (id, run_id, name, summary, approved, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).run(params.suiteId, params.runId, params.suiteName, params.summary, now);

    const insertCase = db.prepare(
      `INSERT INTO test_cases (
        id, run_id, suite_id, order_index, name, objective,
        preconditions_json, expected_result, priority, category, approved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertStep = db.prepare(
      `INSERT INTO test_steps (
        run_id, test_case_id, step_number, action, description, locator_json, value, expected
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    params.testCases.forEach((tc, idx) => {
      insertCase.run(
        tc.id,
        params.runId,
        params.suiteId,
        idx,
        tc.name,
        tc.objective,
        JSON.stringify(tc.preconditions || []),
        tc.expectedResult,
        tc.priority,
        tc.category,
        tc.approved === false ? 0 : 1
      );

      tc.steps.forEach((step) => {
        insertStep.run(
          params.runId,
          tc.id,
          step.stepNumber,
          step.action,
          step.description,
          step.locator ? JSON.stringify(step.locator) : null,
          step.value ?? null,
          step.expected ?? null
        );
      });
    });

    db.prepare('UPDATE test_runs SET total_cases = ?, updated_at = ? WHERE id = ?').run(
      params.testCases.length,
      now,
      params.runId
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function approveTestPlan(
  runId: string,
  approvedCaseIds?: string[],
  editedCases?: TestCase[]
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    if (editedCases && editedCases.length > 0) {
      const suite = db
        .prepare('SELECT id, name, summary FROM test_suites WHERE run_id = ?')
        .get(runId) as { id: string; name: string; summary: string } | undefined;

      if (suite) {
        db.prepare('DELETE FROM test_cases WHERE run_id = ?').run(runId);
        const insertCase = db.prepare(
          `INSERT INTO test_cases (
            id, run_id, suite_id, order_index, name, objective,
            preconditions_json, expected_result, priority, category, approved
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertStep = db.prepare(
          `INSERT INTO test_steps (
            run_id, test_case_id, step_number, action, description, locator_json, value, expected
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );

        editedCases.forEach((tc, idx) => {
          const isApproved = approvedCaseIds ? approvedCaseIds.includes(tc.id) : tc.approved !== false;
          insertCase.run(
            tc.id,
            runId,
            suite.id,
            idx,
            tc.name,
            tc.objective,
            JSON.stringify(tc.preconditions || []),
            tc.expectedResult,
            tc.priority,
            tc.category,
            isApproved ? 1 : 0
          );
          tc.steps.forEach((step) => {
            insertStep.run(
              runId,
              tc.id,
              step.stepNumber,
              step.action,
              step.description,
              step.locator ? JSON.stringify(step.locator) : null,
              step.value ?? null,
              step.expected ?? null
            );
          });
        });
      }
    } else if (approvedCaseIds) {
      const allCases = db
        .prepare('SELECT id FROM test_cases WHERE run_id = ?')
        .all(runId) as Array<{ id: string }>;
      const updateStmt = db.prepare('UPDATE test_cases SET approved = ? WHERE run_id = ? AND id = ?');
      for (const row of allCases) {
        updateStmt.run(approvedCaseIds.includes(row.id) ? 1 : 0, runId, row.id);
      }
    }

    db.prepare('UPDATE test_suites SET approved = 1, approved_at = ? WHERE run_id = ?').run(now, runId);
    db.prepare('UPDATE test_runs SET status = ?, updated_at = ? WHERE id = ?').run('PLAN_APPROVED', now, runId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function clearExecutionDataForRun(runId: string): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM execution_results WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM step_results WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM execution_logs WHERE run_id = ?').run(runId);
    db.prepare('DELETE FROM reports WHERE run_id = ?').run(runId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function saveExecutionResult(runId: string, result: TestCaseExecutionRecord): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT OR REPLACE INTO execution_results (
        run_id, test_case_id, status, actual_result, validation_method,
        failure_category, error_message, failure_analysis_json, duration_ms,
        screenshot_file, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      runId,
      result.testCaseId,
      result.status,
      result.actualResult,
      result.validationMethod,
      result.failureCategory ?? null,
      result.errorMessage ?? null,
      result.failureAnalysis ? JSON.stringify(result.failureAnalysis) : null,
      result.durationMs,
      result.screenshotFile ?? null,
      result.startedAt,
      result.finishedAt
    );

    db.prepare('DELETE FROM step_results WHERE run_id = ? AND test_case_id = ?').run(runId, result.testCaseId);

    const insertStep = db.prepare(
      `INSERT INTO step_results (
        run_id, test_case_id, step_number, action, description, locator_summary,
        input_summary, expected_result, actual_result, validation_method,
        status, failure_category, error_message, duration_ms, screenshot_file, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const s of result.steps) {
      insertStep.run(
        runId,
        result.testCaseId,
        s.stepNumber,
        s.action,
        s.description,
        s.locatorSummary,
        s.inputSummary,
        s.expectedResult,
        s.actualResult,
        s.validationMethod,
        s.status,
        s.failureCategory ?? null,
        s.errorMessage ?? null,
        s.durationMs,
        s.screenshotFile ?? null,
        s.timestamp
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function saveScreenshotMetadata(params: {
  id: string;
  runId: string;
  testCaseId?: string;
  stepNumber?: number;
  filename: string;
  caption: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO screenshots (id, run_id, test_case_id, step_number, filename, caption, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.runId,
    params.testCaseId ?? null,
    params.stepNumber ?? null,
    params.filename,
    params.caption,
    new Date().toISOString()
  );
}

export function appendExecutionLog(runId: string, entry: LogEntry): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO execution_logs (run_id, test_case_id, step_index, level, component, message, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    entry.testCaseId ?? null,
    entry.stepIndex ?? null,
    entry.level,
    entry.component,
    entry.message,
    entry.timestamp
  );
}

export function saveReportRecord(runId: string, reportId: string, reportObj: unknown): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO reports (id, run_id, generated_at, report_json)
     VALUES (?, ?, ?, ?)`
  ).run(reportId, runId, new Date().toISOString(), JSON.stringify(reportObj));
}

export function listTestRuns(limit = 50): StoredTestRunRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as StoredTestRunRow[];
}

export function getTestRunDetail(runId: string) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId) as unknown as StoredTestRunRow | undefined;
  if (!run) return null;

  const suite = db.prepare('SELECT * FROM test_suites WHERE run_id = ?').get(runId) as
    | { id: string; run_id: string; name: string; summary: string; approved: number; approved_at: string | null; created_at: string }
    | undefined;

  const caseRows = db
    .prepare('SELECT * FROM test_cases WHERE run_id = ? ORDER BY order_index ASC')
    .all(runId) as Array<{
    id: string;
    name: string;
    objective: string;
    preconditions_json: string;
    expected_result: string;
    priority: TestCase['priority'];
    category: string;
    approved: number;
  }>;

  const stepRows = db
    .prepare('SELECT * FROM test_steps WHERE run_id = ? ORDER BY test_case_id, step_number ASC')
    .all(runId) as Array<{
    test_case_id: string;
    step_number: number;
    action: TestCase['steps'][number]['action'];
    description: string;
    locator_json: string | null;
    value: string | null;
    expected: string | null;
  }>;

  const stepsByCase = new Map<string, TestCase['steps']>();
  for (const s of stepRows) {
    const arr = stepsByCase.get(s.test_case_id) || [];
    arr.push({
      stepNumber: s.step_number,
      action: s.action,
      description: s.description,
      locator: s.locator_json ? JSON.parse(s.locator_json) : undefined,
      value: s.value ?? undefined,
      expected: s.expected ?? undefined,
    });
    stepsByCase.set(s.test_case_id, arr);
  }

  const testCases: TestCase[] = caseRows.map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    preconditions: JSON.parse(c.preconditions_json || '[]'),
    steps: stepsByCase.get(c.id) || [],
    expectedResult: c.expected_result,
    priority: c.priority,
    category: c.category,
    approved: c.approved === 1,
  }));

  const screenshots = db
    .prepare('SELECT * FROM screenshots WHERE run_id = ? ORDER BY captured_at ASC')
    .all(runId) as Array<{
    id: string;
    test_case_id: string | null;
    step_number: number | null;
    filename: string;
    caption: string;
    captured_at: string;
  }>;

  return {
    id: run.id,
    targetUrl: run.target_url,
    displayUrl: run.display_url,
    objective: run.objective,
    mode: run.mode,
    requestedCount: run.requested_count,
    aiProvider: run.ai_provider,
    aiModel: run.ai_model,
    status: run.status,
    pageAnalysis: run.page_analysis_json ? (JSON.parse(run.page_analysis_json) as PageAnalysis) : null,
    planGenerationMs: run.plan_generation_ms,
    executionDurationMs: run.execution_duration_ms,
    totalCases: run.total_cases,
    passedCases: run.passed_cases,
    failedCases: run.failed_cases,
    skippedCases: run.skipped_cases,
    errorCases: run.error_cases,
    passPercentage: run.pass_percentage,
    errorMessage: run.error_message,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    suite: suite
      ? {
          id: suite.id,
          name: suite.name,
          summary: suite.summary,
          approved: suite.approved === 1,
          approvedAt: suite.approved_at,
          createdAt: suite.created_at,
        }
      : null,
    testCases,
    screenshots,
  };
}

export function getTestRunResults(runId: string) {
  const db = getDb();
  const detail = getTestRunDetail(runId);
  if (!detail) return null;

  const execRows = db
    .prepare('SELECT * FROM execution_results WHERE run_id = ? ORDER BY id ASC')
    .all(runId) as Array<{
    test_case_id: string;
    status: TestStatus;
    actual_result: string;
    validation_method: string;
    failure_category: TestCaseExecutionRecord['failureCategory'] | null;
    error_message: string | null;
    failure_analysis_json: string | null;
    duration_ms: number;
    screenshot_file: string | null;
    started_at: string;
    finished_at: string;
  }>;

  const stepResRows = db
    .prepare('SELECT * FROM step_results WHERE run_id = ? ORDER BY test_case_id, step_number ASC')
    .all(runId) as Array<{
    test_case_id: string;
    step_number: number;
    action: StepExecutionRecord['action'];
    description: string;
    locator_summary: string;
    input_summary: string;
    expected_result: string;
    actual_result: string;
    validation_method: string;
    status: TestStatus;
    failure_category: StepExecutionRecord['failureCategory'] | null;
    error_message: string | null;
    duration_ms: number;
    screenshot_file: string | null;
    timestamp: string;
  }>;

  const stepResultsByCase = new Map<string, StepExecutionRecord[]>();
  for (const sr of stepResRows) {
    const arr = stepResultsByCase.get(sr.test_case_id) || [];
    arr.push({
      stepNumber: sr.step_number,
      action: sr.action,
      description: sr.description,
      locatorSummary: sr.locator_summary,
      inputSummary: sr.input_summary,
      expectedResult: sr.expected_result,
      actualResult: sr.actual_result,
      validationMethod: sr.validation_method,
      status: sr.status,
      failureCategory: sr.failure_category ?? undefined,
      errorMessage: sr.error_message ?? undefined,
      durationMs: sr.duration_ms,
      screenshotFile: sr.screenshot_file ?? undefined,
      timestamp: sr.timestamp,
    });
    stepResultsByCase.set(sr.test_case_id, arr);
  }

  const caseLookup = new Map(detail.testCases.map((tc) => [tc.id, tc]));

  const results: TestCaseExecutionRecord[] = execRows.map((row) => {
    const tc = caseLookup.get(row.test_case_id);
    return {
      testCaseId: row.test_case_id,
      testCaseName: tc?.name || row.test_case_id,
      priority: tc?.priority || 'Medium',
      category: tc?.category || 'General',
      objective: tc?.objective || '',
      expectedResult: tc?.expectedResult || '',
      actualResult: row.actual_result,
      validationMethod: row.validation_method,
      status: row.status,
      failureCategory: row.failure_category ?? undefined,
      errorMessage: row.error_message ?? undefined,
      durationMs: row.duration_ms,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      screenshotFile: row.screenshot_file ?? undefined,
      steps: stepResultsByCase.get(row.test_case_id) || [],
      failureAnalysis: row.failure_analysis_json
        ? (JSON.parse(row.failure_analysis_json) as FailureAnalysisResult)
        : undefined,
    };
  });

  const logs = db
    .prepare('SELECT level, component, message, test_case_id, step_index, timestamp FROM execution_logs WHERE run_id = ? ORDER BY id ASC')
    .all(runId) as Array<{
    level: LogEntry['level'];
    component: string;
    message: string;
    test_case_id: string | null;
    step_index: number | null;
    timestamp: string;
  }>;

  return {
    run: detail,
    results,
    logs: logs.map((l) => ({
      level: l.level,
      component: l.component,
      message: l.message,
      testCaseId: l.test_case_id ?? undefined,
      stepIndex: l.step_index ?? undefined,
      timestamp: l.timestamp,
    })),
  };
}

export function getStoredReport(runId: string) {
  const db = getDb();
  const row = db
    .prepare('SELECT id, run_id, generated_at, report_json FROM reports WHERE run_id = ? OR id = ?')
    .get(runId, runId) as { id: string; run_id: string; generated_at: string; report_json: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.report_json);
}

export function getDashboardStats() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) as totalRuns,
        COALESCE(SUM(total_cases), 0) as totalCases,
        COALESCE(SUM(passed_cases), 0) as passedCases,
        COALESCE(SUM(failed_cases), 0) as failedCases,
        COALESCE(SUM(skipped_cases), 0) as skippedCases,
        COALESCE(SUM(error_cases), 0) as errorCases,
        COALESCE(AVG(NULLIF(plan_generation_ms, 0)), 0) as avgPlanMs,
        COALESCE(AVG(NULLIF(execution_duration_ms, 0)), 0) as avgExecMs
      FROM test_runs`
    )
    .get() as {
    totalRuns: number;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    skippedCases: number;
    errorCases: number;
    avgPlanMs: number;
    avgExecMs: number;
  };

  const executedTotal = totals.passedCases + totals.failedCases + totals.errorCases;
  const successPercentage = executedTotal > 0 ? Number(((totals.passedCases / executedTotal) * 100).toFixed(1)) : 0;

  const recentRuns = listTestRuns(10).map((r) => ({
    id: r.id,
    displayUrl: r.display_url,
    objective: r.objective,
    mode: r.mode,
    status: r.status,
    totalCases: r.total_cases,
    passedCases: r.passed_cases,
    failedCases: r.failed_cases,
    skippedCases: r.skipped_cases,
    errorCases: r.error_cases,
    passPercentage: r.pass_percentage,
    executionDurationMs: r.execution_duration_ms,
    planGenerationMs: r.plan_generation_ms,
    createdAt: r.created_at,
  }));

  const modeBreakdown = db
    .prepare(
      `SELECT mode, COUNT(*) as runCount,
        COALESCE(SUM(passed_cases), 0) as passed,
        COALESCE(SUM(failed_cases + error_cases), 0) as failed
       FROM test_runs GROUP BY mode ORDER BY runCount DESC`
    )
    .all() as Array<{ mode: string; runCount: number; passed: number; failed: number }>;

  const failureBreakdown = db
    .prepare(
      `SELECT failure_category as category, COUNT(*) as count
       FROM execution_results
       WHERE failure_category IS NOT NULL
       GROUP BY failure_category
       ORDER BY count DESC`
    )
    .all() as Array<{ category: string; count: number }>;

  return {
    totalRuns: totals.totalRuns,
    totalCases: totals.totalCases,
    passedCases: totals.passedCases,
    failedCases: totals.failedCases,
    skippedCases: totals.skippedCases,
    errorCases: totals.errorCases,
    successPercentage,
    avgPlanGenerationMs: Math.round(totals.avgPlanMs),
    avgExecutionDurationMs: Math.round(totals.avgExecMs),
    recentRuns,
    modeBreakdown,
    failureBreakdown,
  };
}

export function getEvaluationMetrics() {
  const db = getDb();
  const completedRuns = db
    .prepare(
      `SELECT id, display_url, mode, plan_generation_ms, execution_duration_ms,
              total_cases, passed_cases, failed_cases, skipped_cases, error_cases, pass_percentage, created_at
       FROM test_runs
       WHERE status IN ('COMPLETED', 'COMPLETED_WITH_FAILURES')
       ORDER BY created_at DESC LIMIT 30`
    )
    .all() as Array<{
    id: string;
    display_url: string;
    mode: string;
    plan_generation_ms: number;
    execution_duration_ms: number;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    skipped_cases: number;
    error_cases: number;
    pass_percentage: number;
    created_at: string;
  }>;

  const failureAnalysisCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM execution_results WHERE failure_analysis_json IS NOT NULL')
      .get() as { c: number }
  ).c;

  const appBugDetectedCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM execution_results
         WHERE status IN ('FAILED', 'ERROR') AND failure_category IN ('APPLICATION_FAILURE', 'ASSERTION_FAILURE')`
      )
      .get() as { c: number }
  ).c;

  const totalFailedOrError = (
    db
      .prepare(`SELECT COUNT(*) as c FROM execution_results WHERE status IN ('FAILED', 'ERROR')`)
      .get() as { c: number }
  ).c;

  const totalStepResults = (
    db.prepare('SELECT COUNT(*) as c FROM step_results').get() as { c: number }
  ).c;

  const validStepResults = (
    db
      .prepare(`SELECT COUNT(*) as c FROM step_results WHERE failure_category IS NULL OR failure_category NOT IN ('LOCATOR_FAILURE', 'AI_PLANNING_ERROR')`)
      .get() as { c: number }
  ).c;

  const avgPlanGenMs =
    completedRuns.length > 0
      ? Math.round(completedRuns.reduce((s, r) => s + r.plan_generation_ms, 0) / completedRuns.length)
      : 0;

  const totalCases = completedRuns.reduce((s, r) => s + r.total_cases, 0);
  const totalPassed = completedRuns.reduce((s, r) => s + r.passed_cases, 0);
  const totalExecuted = completedRuns.reduce((s, r) => s + r.passed_cases + r.failed_cases + r.error_cases, 0);

  return {
    evaluatedRunsCount: completedRuns.length,
    avgPlanGenerationMs: avgPlanGenMs,
    totalGeneratedCases: totalCases,
    executionSuccessRate: totalExecuted > 0 ? Number(((totalPassed / totalExecuted) * 100).toFixed(1)) : 0,
    validStepPercentage: totalStepResults > 0 ? Number(((validStepResults / totalStepResults) * 100).toFixed(1)) : 0,
    applicationFailuresDetected: appBugDetectedCount,
    totalFailuresAnalyzed: failureAnalysisCount,
    failureAnalysisCoverageRate:
      totalFailedOrError > 0 ? Number(((failureAnalysisCount / totalFailedOrError) * 100).toFixed(1)) : 100,
    runs: completedRuns,
  };
}
