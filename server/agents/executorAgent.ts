import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  StepExecutionRecord,
  TestCase,
  TestCaseExecutionRecord,
  TestStatus,
} from '../schemas/testPlan.ts';
import type { AIProviderId } from '../core/config.ts';
import { createLogEntry, logToConsole, type LogEntry } from '../core/logging.ts';
import { resolveSandboxUrl, validateTargetUrl } from '../core/security.ts';
import {
  appendExecutionLog,
  clearExecutionDataForRun,
  getTestRunDetail,
  saveExecutionResult,
  saveScreenshotMetadata,
  updateTestRunStatus,
} from '../database/database.ts';
import { createBrowserSession, capturePageScreenshot } from '../browser/playwrightManager.ts';
import { executeAllowlistedStep } from '../browser/browserActions.ts';
import { analyzeTestFailure } from './failureAgent.ts';
import { generateAndPersistReport } from '../reports/reportGenerator.ts';

export interface ExecutionLiveEvent {
  type:
    | 'run_started'
    | 'case_started'
    | 'step_completed'
    | 'case_completed'
    | 'log'
    | 'run_completed'
    | 'run_error';
  runId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

const activeRunEmitters = new Map<string, EventEmitter>();
const activeRunPromises = new Map<string, Promise<void>>();

export function getRunEmitter(runId: string): EventEmitter {
  let emitter = activeRunEmitters.get(runId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(30);
    activeRunEmitters.set(runId, emitter);
  }
  return emitter;
}

export function isRunCurrentlyExecuting(runId: string): boolean {
  return activeRunPromises.has(runId);
}

function emitEvent(runId: string, type: ExecutionLiveEvent['type'], payload: Record<string, unknown>) {
  const emitter = activeRunEmitters.get(runId);
  if (emitter) {
    emitter.emit('event', {
      type,
      runId,
      timestamp: new Date().toISOString(),
      payload,
    } satisfies ExecutionLiveEvent);
  }
}

/**
 * Starts asynchronous Playwright test execution for an approved run and streams live progress events.
 */
export function startTestRunExecution(params: {
  runId: string;
  allowLocalhostOverride?: boolean;
}): { started: boolean; alreadyRunning: boolean } {
  if (activeRunPromises.has(params.runId)) {
    return { started: false, alreadyRunning: true };
  }

  getRunEmitter(params.runId);
  const promise = runExecutionPipeline(params.runId, params.allowLocalhostOverride)
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      updateTestRunStatus(params.runId, { status: 'ERROR', errorMessage: msg });
      emitEvent(params.runId, 'run_error', { message: msg });
    })
    .finally(() => {
      activeRunPromises.delete(params.runId);
      setTimeout(() => {
        activeRunEmitters.delete(params.runId);
      }, 60_000);
    });

  activeRunPromises.set(params.runId, promise);
  return { started: true, alreadyRunning: false };
}

async function runExecutionPipeline(runId: string, allowLocalhostOverride?: boolean): Promise<void> {
  const run = getTestRunDetail(runId);
  if (!run) {
    throw new Error(`Test run ${runId} not found.`);
  }
  if (!run.testCases || run.testCases.length === 0) {
    throw new Error(`Test run ${runId} has no generated test cases to execute.`);
  }

  const executionStart = Date.now();
  clearExecutionDataForRun(runId);

  const runLogs: LogEntry[] = [];
  const log = (
    level: LogEntry['level'],
    component: string,
    message: string,
    meta?: { testCaseId?: string; stepIndex?: number }
  ) => {
    const entry = createLogEntry(level, component, message, meta);
    runLogs.push(entry);
    appendExecutionLog(runId, entry);
    logToConsole(entry);
    emitEvent(runId, 'log', { ...entry });
  };

  const urlCheck = await validateTargetUrl(run.targetUrl, { allowLocalhostOverride });
  if (!urlCheck.allowed || !urlCheck.normalizedUrl) {
    throw new Error(urlCheck.reason || 'Target URL rejected by security policy.');
  }
  const isBuiltinSandbox = resolveSandboxUrl(run.targetUrl).isSandbox;

  updateTestRunStatus(runId, {
    status: 'RUNNING',
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
    errorCases: 0,
    passPercentage: 0,
    errorMessage: null,
  });

  log('INFO', 'ExecutorAgent', `Starting Playwright Chromium execution for ${run.displayUrl} (${run.testCases.length} test cases)`);
  emitEvent(runId, 'run_started', {
    totalCases: run.testCases.length,
    targetUrl: run.displayUrl,
  });

  const session = await createBrowserSession({
    isBuiltinSandbox,
    allowLocalhostOverride,
  });

  // Listen to real browser console/page errors for diagnostic evidence
  session.page.on('pageerror', (err) => {
    log('WARN', 'BrowserPageError', `Uncaught page exception: ${err.message}`);
  });

  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    for (let caseIdx = 0; caseIdx < run.testCases.length; caseIdx++) {
      const tc = run.testCases[caseIdx];
      const caseStart = Date.now();
      const startedAt = new Date().toISOString();

      if (!tc.approved) {
        skippedCount++;
        const skippedRecord: TestCaseExecutionRecord = {
          testCaseId: tc.id,
          testCaseName: tc.name,
          priority: tc.priority,
          category: tc.category,
          objective: tc.objective,
          expectedResult: tc.expectedResult,
          actualResult: 'Skipped during test plan review (not approved for execution).',
          validationMethod: 'User Test Plan Approval Gate',
          status: 'SKIPPED',
          durationMs: 0,
          startedAt,
          finishedAt: new Date().toISOString(),
          steps: [],
        };
        saveExecutionResult(runId, skippedRecord);
        log('INFO', 'ExecutorAgent', `Skipped ${tc.id} (${tc.name}) — unchecked by reviewer.`, {
          testCaseId: tc.id,
        });
        emitEvent(runId, 'case_completed', {
          index: caseIdx,
          total: run.testCases.length,
          result: skippedRecord,
        });
        continue;
      }

      emitEvent(runId, 'case_started', {
        index: caseIdx,
        total: run.testCases.length,
        testCaseId: tc.id,
        testCaseName: tc.name,
        totalSteps: tc.steps.length,
      });

      log('INFO', 'ExecutorAgent', `Executing ${tc.id}: ${tc.name}`, { testCaseId: tc.id });

      // Reset browser state cleanly before every test case
      try {
        await session.context.clearCookies();
        await session.page.goto(urlCheck.normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
        await session.page.evaluate(() => {
          try {
            window.localStorage.clear();
            window.sessionStorage.clear();
          } catch {
            // ignore cross-origin restrictions
          }
        });
        await session.page.waitForTimeout(250);
      } catch (navErr) {
        const errMsg = navErr instanceof Error ? navErr.message : String(navErr);
        errorCount++;
        const errRecord: TestCaseExecutionRecord = {
          testCaseId: tc.id,
          testCaseName: tc.name,
          priority: tc.priority,
          category: tc.category,
          objective: tc.objective,
          expectedResult: tc.expectedResult,
          actualResult: `Failed to load initial target URL before test steps: ${errMsg}`,
          validationMethod: 'Playwright initial page load',
          status: 'ERROR',
          failureCategory: 'TEST_EXECUTION_FAILURE',
          errorMessage: errMsg,
          durationMs: Date.now() - caseStart,
          startedAt,
          finishedAt: new Date().toISOString(),
          steps: [],
        };
        saveExecutionResult(runId, errRecord);
        log('ERROR', 'ExecutorAgent', `Initial navigation failed for ${tc.id}: ${errMsg}`, { testCaseId: tc.id });
        emitEvent(runId, 'case_completed', {
          index: caseIdx,
          total: run.testCases.length,
          result: errRecord,
        });
        continue;
      }

      const stepRecords: StepExecutionRecord[] = [];
      let caseStatus: TestStatus = 'PASSED';
      let failedStep: StepExecutionRecord | undefined;
      let lastScreenshotFile: string | undefined;

      for (const step of tc.steps) {
        log('INFO', 'PlaywrightAction', `Step ${step.stepNumber}: [${step.action}] ${step.description}`, {
          testCaseId: tc.id,
          stepIndex: step.stepNumber,
        });

        const stepRec = await executeAllowlistedStep({
          page: session.page,
          step,
          runId,
          testCaseId: tc.id,
          baseTargetUrl: urlCheck.normalizedUrl,
          isBuiltinSandbox,
          allowLocalhostOverride,
        });

        if (stepRec.screenshotFile) {
          lastScreenshotFile = stepRec.screenshotFile;
          saveScreenshotMetadata({
            id: `shot_${crypto.randomBytes(4).toString('hex')}`,
            runId,
            testCaseId: tc.id,
            stepNumber: step.stepNumber,
            filename: stepRec.screenshotFile,
            caption: `${tc.id} Step ${step.stepNumber}: ${step.description}`,
          });
        }

        stepRecords.push(stepRec);

        emitEvent(runId, 'step_completed', {
          testCaseId: tc.id,
          step: stepRec,
          stepIndex: step.stepNumber,
          totalSteps: tc.steps.length,
        });

        if (stepRec.status === 'FAILED' || stepRec.status === 'ERROR') {
          caseStatus = stepRec.status;
          failedStep = stepRec;
          log(
            'ERROR',
            'ValidationEngine',
            `Step ${step.stepNumber} ${stepRec.status} (${stepRec.failureCategory || 'ERROR'}): ${stepRec.errorMessage || stepRec.actualResult}`,
            { testCaseId: tc.id, stepIndex: step.stepNumber }
          );
          break;
        } else {
          log('INFO', 'ValidationEngine', `Step ${step.stepNumber} ${stepRec.status}: ${stepRec.actualResult}`, {
            testCaseId: tc.id,
            stepIndex: step.stepNumber,
          });
        }
      }

      // Always capture end-of-case evidence screenshot (on pass or failure)
      try {
        const shot = await capturePageScreenshot(
          session.page,
          runId,
          `${tc.id}_${caseStatus.toLowerCase()}`
        );
        lastScreenshotFile = shot.filename;
        if (failedStep) {
          failedStep.screenshotFile = shot.filename;
        }
        saveScreenshotMetadata({
          id: `shot_${crypto.randomBytes(4).toString('hex')}`,
          runId,
          testCaseId: tc.id,
          stepNumber: failedStep?.stepNumber ?? tc.steps.length,
          filename: shot.filename,
          caption: `${tc.id} (${caseStatus}) — ${tc.name}`,
        });
      } catch (shotErr) {
        log('WARN', 'PlaywrightManager', `Could not capture screenshot for ${tc.id}: ${shotErr instanceof Error ? shotErr.message : String(shotErr)}`, {
          testCaseId: tc.id,
        });
      }

      // Run Failure Analysis Agent when test fails or errors
      let failureAnalysis = undefined;
      if ((caseStatus === 'FAILED' || caseStatus === 'ERROR') && failedStep) {
        log('INFO', 'FailureAnalysisAgent', `Analyzing root cause for ${tc.id} failure...`, {
          testCaseId: tc.id,
        });
        failureAnalysis = await analyzeTestFailure({
          testCase: tc,
          failedStep,
          allSteps: stepRecords,
          recentLogs: runLogs.filter((l) => !l.testCaseId || l.testCaseId === tc.id),
          screenshotFile: lastScreenshotFile,
          provider: run.aiProvider as AIProviderId,
          model: run.aiModel,
        });
        log(
          'INFO',
          'FailureAnalysisAgent',
          `Root cause (${failureAnalysis.failureCategory}, confidence ${failureAnalysis.confidence}): ${failureAnalysis.likelyCause}`,
          { testCaseId: tc.id }
        );
      }

      if (caseStatus === 'PASSED') passedCount++;
      else if (caseStatus === 'FAILED') failedCount++;
      else if (caseStatus === 'ERROR') errorCount++;
      else skippedCount++;

      const lastStep = stepRecords[stepRecords.length - 1];
      const caseRecord: TestCaseExecutionRecord = {
        testCaseId: tc.id,
        testCaseName: tc.name,
        priority: tc.priority,
        category: tc.category,
        objective: tc.objective,
        expectedResult: tc.expectedResult,
        actualResult: failedStep
          ? failedStep.actualResult
          : lastStep?.actualResult || 'All steps completed and assertions passed.',
        validationMethod: failedStep
          ? failedStep.validationMethod
          : lastStep?.validationMethod || 'Deterministic Playwright Assertions',
        status: caseStatus,
        failureCategory: failureAnalysis?.failureCategory || failedStep?.failureCategory,
        errorMessage: failedStep?.errorMessage,
        durationMs: Date.now() - caseStart,
        startedAt,
        finishedAt: new Date().toISOString(),
        screenshotFile: lastScreenshotFile,
        steps: stepRecords,
        failureAnalysis,
      };

      saveExecutionResult(runId, caseRecord);

      const executedSoFar = passedCount + failedCount + errorCount;
      updateTestRunStatus(runId, {
        passedCases: passedCount,
        failedCases: failedCount,
        skippedCases: skippedCount,
        errorCases: errorCount,
        passPercentage: executedSoFar > 0 ? Number(((passedCount / executedSoFar) * 100).toFixed(1)) : 0,
      });

      emitEvent(runId, 'case_completed', {
        index: caseIdx,
        total: run.testCases.length,
        result: caseRecord,
      });
    }
  } finally {
    await session.close();
  }

  const totalDurationMs = Date.now() - executionStart;
  const totalExecuted = passedCount + failedCount + errorCount;
  const passPercentage = totalExecuted > 0 ? Number(((passedCount / totalExecuted) * 100).toFixed(1)) : 0;
  const finalStatus = failedCount > 0 || errorCount > 0 ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED';

  updateTestRunStatus(runId, {
    status: finalStatus,
    executionDurationMs: totalDurationMs,
    passedCases: passedCount,
    failedCases: failedCount,
    skippedCases: skippedCount,
    errorCases: errorCount,
    passPercentage,
  });

  log(
    'INFO',
    'ReportGenerator',
    `Execution complete in ${(totalDurationMs / 1000).toFixed(2)}s — Passed: ${passedCount}, Failed: ${failedCount}, Errors: ${errorCount}, Skipped: ${skippedCount} (${passPercentage}%)`
  );

  const report = generateAndPersistReport(runId);

  emitEvent(runId, 'run_completed', {
    status: finalStatus,
    executionDurationMs: totalDurationMs,
    passedCases: passedCount,
    failedCases: failedCount,
    skippedCases: skippedCount,
    errorCases: errorCount,
    passPercentage,
    reportId: report?.reportId,
  });
}
