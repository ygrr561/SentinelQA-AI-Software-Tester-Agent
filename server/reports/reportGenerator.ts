import crypto from 'node:crypto';
import { getTestRunResults, saveReportRecord } from '../database/database.ts';

export interface StructuredTestReport {
  reportId: string;
  runId: string;
  generatedAt: string;
  targetApplication: {
    url: string;
    pageTitle: string;
    detectedFeatures: string[];
  };
  configuration: {
    objective: string;
    mode: string;
    aiProvider: string;
    aiModel: string;
    suiteName: string;
    suiteSummary: string;
  };
  summary: {
    status: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    executionErrors: number;
    passPercentage: number;
    planGenerationMs: number;
    totalExecutionDurationMs: number;
  };
  testCases: Array<{
    testId: string;
    name: string;
    priority: string;
    category: string;
    objective: string;
    expectedResult: string;
    actualResult: string;
    validationMethod: string;
    status: string;
    failureCategory?: string;
    errorMessage?: string;
    durationMs: number;
    screenshotUrl?: string;
    failureAnalysis?: unknown;
    steps: unknown[];
    logs: unknown[];
  }>;
  screenshots: Array<{
    id: string;
    testCaseId: string | null;
    stepNumber: number | null;
    url: string;
    caption: string;
    capturedAt: string;
  }>;
}

export function generateAndPersistReport(runId: string): StructuredTestReport | null {
  const data = getTestRunResults(runId);
  if (!data) return null;

  const { run, results, logs } = data;
  const reportId = `RPT-${run.id.slice(-8).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const report: StructuredTestReport = {
    reportId,
    runId: run.id,
    generatedAt: new Date().toISOString(),
    targetApplication: {
      url: run.displayUrl,
      pageTitle: run.pageAnalysis?.title || 'Unknown',
      detectedFeatures: run.pageAnalysis?.detectedFeatures || [],
    },
    configuration: {
      objective: run.objective,
      mode: run.mode,
      aiProvider: run.aiProvider,
      aiModel: run.aiModel,
      suiteName: run.suite?.name || 'Automated Test Suite',
      suiteSummary: run.suite?.summary || '',
    },
    summary: {
      status: run.status,
      totalTests: run.totalCases,
      passedTests: run.passedCases,
      failedTests: run.failedCases,
      skippedTests: run.skippedCases,
      executionErrors: run.errorCases,
      passPercentage: run.passPercentage,
      planGenerationMs: run.planGenerationMs,
      totalExecutionDurationMs: run.executionDurationMs,
    },
    testCases: results.map((r) => ({
      testId: r.testCaseId,
      name: r.testCaseName,
      priority: r.priority,
      category: r.category,
      objective: r.objective,
      expectedResult: r.expectedResult,
      actualResult: r.actualResult,
      validationMethod: r.validationMethod,
      status: r.status,
      failureCategory: r.failureCategory,
      errorMessage: r.errorMessage,
      durationMs: r.durationMs,
      screenshotUrl: r.screenshotFile ? `/api/screenshots/${r.screenshotFile}` : undefined,
      failureAnalysis: r.failureAnalysis,
      steps: r.steps,
      logs: logs.filter((l) => l.testCaseId === r.testCaseId),
    })),
    screenshots: run.screenshots.map((s) => ({
      id: s.id,
      testCaseId: s.test_case_id,
      stepNumber: s.step_number,
      url: `/api/screenshots/${s.filename}`,
      caption: s.caption,
      capturedAt: s.captured_at,
    })),
  };

  saveReportRecord(runId, reportId, report);
  return report;
}
