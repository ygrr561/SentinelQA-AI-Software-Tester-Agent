import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { getAvailableProviders, getConfig, type AIProviderId } from '../core/config.ts';
import {
  TestCaseSchema,
  TestModeSchema,
  type PageAnalysis,
} from '../schemas/testPlan.ts';
import {
  approveTestPlan,
  createTestRunRecord,
  getDashboardStats,
  getDb,
  getEvaluationMetrics,
  getStoredReport,
  getTestRunDetail,
  getTestRunResults,
  listTestRuns,
  saveScreenshotMetadata,
  saveTestSuiteAndCases,
  updateTestRunStatus,
} from '../database/database.ts';
import { analyzeWebApplication } from '../agents/analyzerAgent.ts';
import { generateTestPlan } from '../agents/plannerAgent.ts';
import {
  getRunEmitter,
  isRunCurrentlyExecuting,
  startTestRunExecution,
  type ExecutionLiveEvent,
} from '../agents/executorAgent.ts';
import { generateAndPersistReport } from '../reports/reportGenerator.ts';
import { renderDemoTargetAppHtml } from '../demo/demoTargetApp.ts';

const AnalyzeRequestSchema = z.object({
  url: z.string().min(1, 'Target URL is required'),
  allowLocalhostOverride: z.boolean().optional(),
});

const GeneratePlanRequestSchema = z.object({
  url: z.string().min(1, 'Target URL is required'),
  objective: z.string().min(3, 'Testing objective must be at least 3 characters'),
  mode: TestModeSchema.default('functional'),
  requestedCount: z.number().int().min(2).max(12).default(6),
  provider: z.enum(['gemini', 'openai_compatible']).optional(),
  model: z.string().optional(),
  existingAnalysis: z.any().optional(),
  allowLocalhostOverride: z.boolean().optional(),
});

const ApprovePlanRequestSchema = z.object({
  runId: z.string().min(1),
  approvedCaseIds: z.array(z.string()).optional(),
  editedCases: z.array(TestCaseSchema).optional(),
});

const ExecuteRunRequestSchema = z.object({
  runId: z.string().min(1),
  allowLocalhostOverride: z.boolean().optional(),
});

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Built-in Demo Target Application (authorized evaluation sandbox)
  router.get('/sandbox-app', (req: Request, res: Response) => {
    const injectDefects = req.query.defects === 'true' || req.query.defects === '1';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDemoTargetAppHtml(injectDefects));
  });

  // System & AI Provider Configuration (read-only metadata; never exposes keys)
  router.get('/api/config/providers', (_req: Request, res: Response) => {
    const cfg = getConfig();
    res.json({
      activeProvider: cfg.aiProvider,
      activeModel: cfg.aiModel,
      playwrightDetected: Boolean(cfg.playwrightExecutablePath),
      allowLocalhostTesting: cfg.allowLocalhostTesting,
      sandboxUrl: '/sandbox-app',
      sandboxDefectsUrl: '/sandbox-app?defects=true',
      providers: getAvailableProviders(),
    });
  });

  // Dashboard Aggregate Statistics
  router.get('/api/dashboard/stats', (_req: Request, res: Response) => {
    try {
      res.json(getDashboardStats());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load dashboard stats' });
    }
  });

  // Academic Evaluation & Benchmark Metrics (computed purely from real SQLite runs)
  router.get('/api/evaluation/metrics', (_req: Request, res: Response) => {
    try {
      res.json(getEvaluationMetrics());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load evaluation metrics' });
    }
  });

  // Phase 2: Real Playwright Web Interface Analysis
  router.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const parsed = AnalyzeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      const { analysis, normalizedUrl, isBuiltinSandbox } = await analyzeWebApplication({
        url: parsed.data.url,
        allowLocalhostOverride: parsed.data.allowLocalhostOverride,
      });

      return res.json({
        analysis,
        normalizedUrl,
        isBuiltinSandbox,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Page analysis failed';
      const status = /blocked|ssrf|invalid url|protocol/i.test(msg) ? 400 : 500;
      return res.status(status).json({ error: msg });
    }
  });

  // Phase 3: Analyze (if needed) + AI Test Plan Generation + SQLite Persistence
  router.post('/api/test-plans/generate', async (req: Request, res: Response) => {
    const parsed = GeneratePlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const cfg = getConfig();
    const runId = `run_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const displayUrl = parsed.data.url.trim();
    const aiProvider: AIProviderId = parsed.data.provider || cfg.aiProvider;
    const aiModel = parsed.data.model || (aiProvider === 'gemini' ? cfg.aiModel : cfg.openaiModel);

    try {
      let pageAnalysis: PageAnalysis;
      let normalizedUrl = displayUrl;

      if (parsed.data.existingAnalysis && parsed.data.existingAnalysis.url === displayUrl) {
        pageAnalysis = parsed.data.existingAnalysis as PageAnalysis;
        normalizedUrl = displayUrl;
      } else {
        const analyzed = await analyzeWebApplication({
          url: displayUrl,
          runId,
          allowLocalhostOverride: parsed.data.allowLocalhostOverride,
        });
        pageAnalysis = analyzed.analysis;
        normalizedUrl = analyzed.normalizedUrl;
      }

      createTestRunRecord({
        id: runId,
        targetUrl: normalizedUrl,
        displayUrl,
        objective: parsed.data.objective,
        mode: parsed.data.mode,
        requestedCount: parsed.data.requestedCount,
        aiProvider,
        aiModel,
        status: 'PLANNING',
        pageAnalysis,
      });

      if (pageAnalysis.initialScreenshotFile) {
        saveScreenshotMetadata({
          id: `shot_${crypto.randomBytes(4).toString('hex')}`,
          runId,
          filename: pageAnalysis.initialScreenshotFile,
          caption: `Initial Playwright inspection — ${pageAnalysis.title}`,
        });
      }

      const generated = await generateTestPlan({
        pageAnalysis,
        objective: parsed.data.objective,
        mode: parsed.data.mode,
        requestedCount: parsed.data.requestedCount,
        provider: aiProvider,
        model: aiModel,
      });

      const suiteId = `suite_${crypto.randomBytes(4).toString('hex')}`;
      saveTestSuiteAndCases({
        runId,
        suiteId,
        suiteName: generated.plan.suiteName,
        summary: generated.plan.summary,
        testCases: generated.plan.testCases,
      });

      updateTestRunStatus(runId, {
        status: 'PLAN_READY',
        planGenerationMs: generated.durationMs,
        totalCases: generated.plan.testCases.length,
      });

      const fullRun = getTestRunDetail(runId);
      return res.status(201).json({
        run: fullRun,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test plan generation failed';
      try {
        if (getTestRunDetail(runId)) {
          updateTestRunStatus(runId, { status: 'ERROR', errorMessage: msg });
        }
      } catch {
        // ignore if run record not yet created
      }
      const status = /blocked|ssrf|invalid url|protocol/i.test(msg) ? 400 : 500;
      return res.status(status).json({ error: msg, runId });
    }
  });

  // Approve (and optionally filter/edit) Generated Test Plan
  router.post('/api/test-plans/approve', (req: Request, res: Response) => {
    const parsed = ApprovePlanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const existing = getTestRunDetail(parsed.data.runId);
    if (!existing) {
      return res.status(404).json({ error: 'Test run not found.' });
    }

    try {
      approveTestPlan(parsed.data.runId, parsed.data.approvedCaseIds, parsed.data.editedCases);
      return res.json({ run: getTestRunDetail(parsed.data.runId) });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Approval failed' });
    }
  });

  // Phase 4 & 5: Execute Approved Test Plan using Real Playwright
  router.post('/api/test-runs/execute', (req: Request, res: Response) => {
    const parsed = ExecuteRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join('; '),
      });
    }

    const run = getTestRunDetail(parsed.data.runId);
    if (!run) {
      return res.status(404).json({ error: 'Test run not found.' });
    }
    if (!run.testCases || run.testCases.length === 0) {
      return res.status(400).json({ error: 'No test cases exist for this run.' });
    }

    // Automatically mark approved if user launches straight from approved/ready state
    if (!run.suite?.approved) {
      approveTestPlan(run.id);
    }

    const launch = startTestRunExecution({
      runId: run.id,
      allowLocalhostOverride: parsed.data.allowLocalhostOverride,
    });

    return res.status(202).json({
      runId: run.id,
      started: launch.started,
      alreadyRunning: launch.alreadyRunning,
      streamUrl: `/api/test-runs/${run.id}/stream`,
    });
  });

  // Live SSE Execution Stream
  router.get('/api/test-runs/:id/stream', (req: Request, res: Response) => {
    const runId = String(req.params.id);
    const run = getTestRunDetail(runId);
    if (!run) {
      return res.status(404).json({ error: 'Test run not found.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSse = (event: ExecutionLiveEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Send initial heartbeat snapshot
    res.write(
      `data: ${JSON.stringify({
        type: 'snapshot',
        runId,
        executing: isRunCurrentlyExecuting(runId),
        status: run.status,
      })}\n\n`
    );

    const emitter = getRunEmitter(runId);
    const listener = (evt: ExecutionLiveEvent) => {
      sendSse(evt);
    };
    emitter.on('event', listener);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      emitter.off('event', listener);
    });
  });

  // List All Test Runs
  router.get('/api/test-runs', (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit || 50), 100);
      const runs = listTestRuns(limit).map((r) => ({
        id: r.id,
        targetUrl: r.target_url,
        displayUrl: r.display_url,
        objective: r.objective,
        mode: r.mode,
        aiProvider: r.ai_provider,
        aiModel: r.ai_model,
        status: r.status,
        totalCases: r.total_cases,
        passedCases: r.passed_cases,
        failedCases: r.failed_cases,
        skippedCases: r.skipped_cases,
        errorCases: r.error_cases,
        passPercentage: r.pass_percentage,
        planGenerationMs: r.plan_generation_ms,
        executionDurationMs: r.execution_duration_ms,
        errorMessage: r.error_message,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list test runs' });
    }
  });

  // Get Single Test Run with Suite & Test Cases
  router.get('/api/test-runs/:id', (req: Request, res: Response) => {
    const run = getTestRunDetail(String(req.params.id));
    if (!run) return res.status(404).json({ error: 'Test run not found.' });
    return res.json({ run, executing: isRunCurrentlyExecuting(run.id) });
  });

  // Get Test Run Execution Results & Logs
  router.get('/api/test-runs/:id/results', (req: Request, res: Response) => {
    const data = getTestRunResults(String(req.params.id));
    if (!data) return res.status(404).json({ error: 'Test run not found.' });
    return res.json({
      ...data,
      executing: isRunCurrentlyExecuting(String(req.params.id)),
    });
  });

  // Delete a Test Run
  router.delete('/api/test-runs/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (isRunCurrentlyExecuting(id)) {
      return res.status(409).json({ error: 'Cannot delete a test run while it is actively executing.' });
    }
    const db = getDb();
    db.prepare('DELETE FROM test_runs WHERE id = ?').run(id);
    return res.json({ deleted: true, id });
  });

  // Get Structured Report by Run ID or Report ID
  router.get('/api/reports/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    let report = getStoredReport(id);
    if (!report) {
      report = generateAndPersistReport(id);
    }
    if (!report) {
      return res.status(404).json({ error: 'Report not found for this test run.' });
    }
    return res.json({ report });
  });

  // Export Report as Downloadable JSON
  router.get('/api/reports/:id/export/json', (req: Request, res: Response) => {
    const id = String(req.params.id);
    let report = getStoredReport(id);
    if (!report) {
      report = generateAndPersistReport(id);
    }
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="sentinelqa-report-${id}.json"`);
    return res.send(JSON.stringify(report, null, 2));
  });

  // Secure Static Screenshot Serving (prevents path traversal)
  router.get('/api/screenshots/:filename', (req: Request, res: Response) => {
    const cfg = getConfig();
    const safeName = path.basename(String(req.params.filename));
    if (!safeName.endsWith('.png')) {
      return res.status(400).json({ error: 'Invalid screenshot filename.' });
    }
    const fullPath = path.join(cfg.screenshotsDir, safeName);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Screenshot not found.' });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(fullPath);
  });

  return router;
}
