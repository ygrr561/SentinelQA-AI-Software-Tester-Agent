import path from 'node:path';
import { Type, type Schema } from '@google/genai';
import { z } from 'zod';
import type { FailureAnalysisResult, StepExecutionRecord, TestCase } from '../schemas/testPlan.ts';
import { getConfig, type AIProviderId } from '../core/config.ts';
import type { LogEntry } from '../core/logging.ts';
import { generateStructuredJson } from './llmProvider.ts';

const FailureAnalysisSchema = z.object({
  failureCategory: z.enum([
    'APPLICATION_FAILURE',
    'ASSERTION_FAILURE',
    'LOCATOR_FAILURE',
    'TIMEOUT',
    'TEST_EXECUTION_FAILURE',
    'AI_PLANNING_ERROR',
  ]),
  likelyCause: z.string().min(1),
  isApplicationBugLikely: z.boolean(),
  explanation: z.string().min(1),
  suggestedInvestigation: z.string().min(1),
  confidence: z.enum(['High', 'Medium', 'Low']),
});

const FAILURE_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    failureCategory: {
      type: Type.STRING,
      enum: [
        'APPLICATION_FAILURE',
        'ASSERTION_FAILURE',
        'LOCATOR_FAILURE',
        'TIMEOUT',
        'TEST_EXECUTION_FAILURE',
        'AI_PLANNING_ERROR',
      ],
    },
    likelyCause: { type: Type.STRING, description: 'Short 1-sentence root cause summary.' },
    isApplicationBugLikely: {
      type: Type.BOOLEAN,
      description: 'True only if evidence strongly points to an application defect rather than a locator/test/network issue.',
    },
    explanation: { type: Type.STRING, description: 'Concise 2-3 sentence technical explanation of what failed and why.' },
    suggestedInvestigation: { type: Type.STRING, description: 'Concrete next step or fix recommendation.' },
    confidence: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
  },
  required: [
    'failureCategory',
    'likelyCause',
    'isApplicationBugLikely',
    'explanation',
    'suggestedInvestigation',
    'confidence',
  ],
};

/**
 * Failure Analysis Agent:
 * Inspects failed step telemetry, logs, and actual failure PNG screenshot (multimodal)
 * to diagnose root cause without blindly blaming the application.
 */
export async function analyzeTestFailure(params: {
  testCase: TestCase;
  failedStep: StepExecutionRecord;
  allSteps: StepExecutionRecord[];
  recentLogs: LogEntry[];
  screenshotFile?: string;
  provider?: AIProviderId;
  model?: string;
}): Promise<FailureAnalysisResult> {
  const cfg = getConfig();
  const imagePath = params.screenshotFile
    ? path.join(cfg.screenshotsDir, params.screenshotFile)
    : undefined;

  const systemInstruction = `You are a Senior QA Root-Cause Analyst investigating an automated Playwright test failure.
CRITICAL OBJECTIVITY RULES:
1. Do NOT automatically claim the web application has a bug.
2. Carefully distinguish between:
   - APPLICATION_FAILURE (e.g., form accepted invalid input when validation should have blocked it, wrong functional outcome, HTTP 500, broken feature visible in screenshot)
   - ASSERTION_FAILURE (expected text/URL/state did not match actual page state — examine whether test expectation was too strict or app behavior is wrong)
   - LOCATOR_FAILURE (element selector did not exist or timed out because the test plan used a wrong locator/tab/label)
   - TIMEOUT (slow network or page transition exceeded wait limit)
   - TEST_EXECUTION_FAILURE (network error, SSRF block, browser error)
   - AI_PLANNING_ERROR (test step had invalid logic or prerequisites)
3. Inspect the attached failure screenshot (if provided) alongside the execution logs and step trace.
4. Keep explanation concise, factual, and actionable.`;

  const prompt = `Test Case: ${params.testCase.id} — ${params.testCase.name}
Objective: ${params.testCase.objective}
Expected Result: ${params.testCase.expectedResult}

Failed Step (#${params.failedStep.stepNumber}):
- Action: ${params.failedStep.action}
- Description: ${params.failedStep.description}
- Locator: ${params.failedStep.locatorSummary}
- Input: ${params.failedStep.inputSummary || '(none)'}
- Expected: ${params.failedStep.expectedResult}
- Actual: ${params.failedStep.actualResult}
- Initial Classification: ${params.failedStep.failureCategory || 'UNKNOWN'}
- Error Message: ${params.failedStep.errorMessage || 'None'}

Full Step Trace:
${params.allSteps
  .map(
    (s) =>
      `Step ${s.stepNumber} [${s.status}] ${s.action} (${s.locatorSummary}): ${s.actualResult}`
  )
  .join('\n')}

Recent Execution Logs:
${params.recentLogs
  .slice(-10)
  .map((l) => `[${l.level}] ${l.component}: ${l.message}`)
  .join('\n')}

Return your structured failure analysis JSON.`;

  try {
    const llmRes = await generateStructuredJson({
      provider: params.provider,
      model: params.model,
      systemInstruction,
      prompt,
      responseSchema: FAILURE_ANALYSIS_RESPONSE_SCHEMA,
      imagePath,
    });

    const cleaned = llmRes.text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return FailureAnalysisSchema.parse(JSON.parse(cleaned));
  } catch (err) {
    const fallbackCategory = params.failedStep.failureCategory || 'TEST_EXECUTION_FAILURE';
    const isAppLikely = fallbackCategory === 'APPLICATION_FAILURE';
    return {
      failureCategory: fallbackCategory,
      likelyCause: params.failedStep.errorMessage || params.failedStep.actualResult,
      isApplicationBugLikely: isAppLikely,
      explanation: `Deterministic step #${params.failedStep.stepNumber} (${params.failedStep.action}) failed with ${fallbackCategory}: ${params.failedStep.actualResult}. (Automated AI narrative unavailable: ${err instanceof Error ? err.message : 'unknown error'})`,
      suggestedInvestigation:
        fallbackCategory === 'LOCATOR_FAILURE'
          ? 'Verify the target element label/role exists in the active view or tab before executing this step.'
          : 'Inspect the captured failure screenshot and compare the actual browser state against the expected assertion.',
      confidence: 'Medium',
    };
  }
}
