import type { Page } from 'playwright-core';
import type { StepExecutionRecord, TestStep } from '../schemas/testPlan.ts';
import { getConfig } from '../core/config.ts';
import { isDestructiveAction, redactStepValue, validateTargetUrl } from '../core/security.ts';
import { formatLocatorSummary, resolveLocator } from './locatorStrategy.ts';
import { capturePageScreenshot } from './playwrightManager.ts';
import {
  classifyPlaywrightError,
  verifyElementVisibilityAssertion,
  verifyFormValidationAssertion,
  verifyTextAssertion,
  verifyTitleAssertion,
  verifyUrlAssertion,
} from '../validation/assertions.ts';

export async function executeAllowlistedStep(params: {
  page: Page;
  step: TestStep;
  runId: string;
  testCaseId: string;
  baseTargetUrl: string;
  isBuiltinSandbox: boolean;
  allowLocalhostOverride?: boolean;
}): Promise<StepExecutionRecord> {
  const { page, step, runId, testCaseId, baseTargetUrl, isBuiltinSandbox, allowLocalhostOverride } = params;
  const cfg = getConfig();
  const started = Date.now();
  const timestamp = new Date().toISOString();
  const locatorSummary = formatLocatorSummary(step.locator);
  const inputSummary = redactStepValue(step.action, step.locator?.value || step.description, step.value);
  const expectedResult = step.expected || step.description;

  // Destructive action safeguard on non-sandbox targets
  if (
    !isBuiltinSandbox &&
    (step.action === 'click' || step.action === 'fill') &&
    (isDestructiveAction(step.description) || isDestructiveAction(step.locator?.value))
  ) {
    return {
      stepNumber: step.stepNumber,
      action: step.action,
      description: step.description,
      locatorSummary,
      inputSummary,
      expectedResult,
      actualResult: 'Blocked potentially destructive or payment action by security policy.',
      validationMethod: 'Security Policy Guardrail',
      status: 'SKIPPED',
      durationMs: Date.now() - started,
      timestamp,
    };
  }

  try {
    switch (step.action) {
      case 'navigate': {
        const dest = step.value ? resolveDestinationUrl(baseTargetUrl, step.value) : baseTargetUrl;
        const check = await validateTargetUrl(dest, { allowLocalhostOverride });
        if (!check.allowed || !check.normalizedUrl) {
          return {
            stepNumber: step.stepNumber,
            action: step.action,
            description: step.description,
            locatorSummary,
            inputSummary: dest,
            expectedResult,
            actualResult: check.reason || 'Navigation blocked by security policy.',
            validationMethod: 'SSRF & URL Policy Check',
            status: 'ERROR',
            failureCategory: 'TEST_EXECUTION_FAILURE',
            errorMessage: check.reason,
            durationMs: Date.now() - started,
            timestamp,
          };
        }

        const resp = await page.goto(check.normalizedUrl, {
          waitUntil: 'domcontentloaded',
          timeout: Math.min(cfg.maxExecutionTimeoutMs, 20000),
        });
        await page.waitForTimeout(250);
        const statusCode = resp?.status() ?? 200;
        if (statusCode >= 500) {
          return {
            stepNumber: step.stepNumber,
            action: step.action,
            description: step.description,
            locatorSummary,
            inputSummary: check.normalizedUrl,
            expectedResult,
            actualResult: `HTTP ${statusCode} server error returned from ${page.url()}`,
            validationMethod: 'Deterministic HTTP response status check',
            status: 'FAILED',
            failureCategory: 'APPLICATION_FAILURE',
            errorMessage: `Target returned HTTP ${statusCode}`,
            durationMs: Date.now() - started,
            timestamp,
          };
        }
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary: check.normalizedUrl,
          expectedResult,
          actualResult: `Navigated to ${page.url()} (HTTP ${statusCode}, title: "${await page.title()}")`,
          validationMethod: 'Deterministic Playwright navigation & HTTP status verification',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'click': {
        if (!step.locator) {
          throw new Error('Click action requires a valid locator.');
        }
        const el = await resolveLocator(page, step.locator);
        await el.waitFor({ state: 'visible', timeout: cfg.stepTimeoutMs });
        await el.click({ timeout: cfg.stepTimeoutMs });
        await page.waitForTimeout(250);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Clicked element (${locatorSummary}); current URL: ${page.url()}`,
          validationMethod: 'Playwright actionability & DOM click confirmation',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'fill': {
        if (!step.locator) {
          throw new Error('Fill action requires a valid locator.');
        }
        const el = await resolveLocator(page, step.locator);
        await el.waitFor({ state: 'visible', timeout: cfg.stepTimeoutMs });
        await el.fill(step.value ?? '', { timeout: cfg.stepTimeoutMs });
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Filled field (${locatorSummary}) with ${inputSummary || '(empty string)'}`,
          validationMethod: 'Playwright input fill confirmation',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'type': {
        if (!step.locator) {
          throw new Error('Type action requires a valid locator.');
        }
        const el = await resolveLocator(page, step.locator);
        await el.waitFor({ state: 'visible', timeout: cfg.stepTimeoutMs });
        await el.click({ timeout: cfg.stepTimeoutMs });
        await el.pressSequentially(step.value ?? '', { delay: 15, timeout: cfg.stepTimeoutMs });
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Typed ${inputSummary || '(empty)'} into (${locatorSummary})`,
          validationMethod: 'Playwright keystroke entry confirmation',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'select': {
        if (!step.locator) {
          throw new Error('Select action requires a valid locator.');
        }
        const el = await resolveLocator(page, step.locator);
        await el.waitFor({ state: 'visible', timeout: cfg.stepTimeoutMs });
        const val = step.value ?? '';
        try {
          await el.selectOption({ label: val }, { timeout: cfg.stepTimeoutMs });
        } catch {
          await el.selectOption(val, { timeout: cfg.stepTimeoutMs });
        }
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Selected option "${val}" in (${locatorSummary})`,
          validationMethod: 'Playwright selectOption state verification',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'check': {
        if (!step.locator) throw new Error('Check action requires a locator.');
        const el = await resolveLocator(page, step.locator);
        await el.check({ timeout: cfg.stepTimeoutMs });
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Checked (${locatorSummary})`,
          validationMethod: 'Playwright checkbox checked state verification',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'uncheck': {
        if (!step.locator) throw new Error('Uncheck action requires a locator.');
        const el = await resolveLocator(page, step.locator);
        await el.uncheck({ timeout: cfg.stepTimeoutMs });
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Unchecked (${locatorSummary})`,
          validationMethod: 'Playwright checkbox unchecked state verification',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'scroll': {
        if (step.locator) {
          const el = await resolveLocator(page, step.locator);
          await el.scrollIntoViewIfNeeded({ timeout: cfg.stepTimeoutMs });
        } else {
          const deltaY = Number(step.value) || 500;
          await page.evaluate((y) => window.scrollBy(0, y), deltaY);
        }
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: 'Scrolled viewport successfully.',
          validationMethod: 'Browser viewport scroll execution',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'wait_for_visible': {
        if (!step.locator) throw new Error('wait_for_visible requires a locator.');
        const el = await resolveLocator(page, step.locator);
        await el.waitFor({ state: 'visible', timeout: cfg.stepTimeoutMs });
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Element (${locatorSummary}) became visible.`,
          validationMethod: 'Deterministic Playwright waitFor(visible)',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_text': {
        const expected = step.expected || step.value || '';
        const outcome = await verifyTextAssertion(page, expected, step.locator, 4500);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary: expected,
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_visible': {
        if (!step.locator) throw new Error('verify_visible requires a locator.');
        const outcome = await verifyElementVisibilityAssertion(page, step.locator, true, 4500);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_not_visible': {
        if (!step.locator) throw new Error('verify_not_visible requires a locator.');
        const outcome = await verifyElementVisibilityAssertion(page, step.locator, false, 3500);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_url': {
        const expected = step.expected || step.value || '';
        const outcome = await verifyUrlAssertion(page, expected);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary: expected,
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_title': {
        const expected = step.expected || step.value || '';
        const outcome = await verifyTitleAssertion(page, expected);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary: expected,
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'verify_form_validation': {
        const expected = step.expected || step.value;
        const outcome = await verifyFormValidationAssertion(page, expected, step.locator);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary: expected || '',
          expectedResult,
          actualResult: outcome.actualResult,
          validationMethod: outcome.validationMethod,
          status: outcome.passed ? 'PASSED' : 'FAILED',
          failureCategory: outcome.failureCategory,
          errorMessage: outcome.errorMessage,
          durationMs: Date.now() - started,
          timestamp,
        };
      }

      case 'screenshot': {
        const shot = await capturePageScreenshot(page, runId, `${testCaseId}_step${step.stepNumber}`);
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Captured screenshot evidence (${shot.filename})`,
          validationMethod: 'Playwright PNG viewport screenshot capture',
          status: 'PASSED',
          durationMs: Date.now() - started,
          timestamp,
          screenshotFile: shot.filename,
        };
      }

      default:
        return {
          stepNumber: step.stepNumber,
          action: step.action,
          description: step.description,
          locatorSummary,
          inputSummary,
          expectedResult,
          actualResult: `Rejected non-allowlisted action "${String(step.action)}"`,
          validationMethod: 'Allowlisted Action Schema Guard',
          status: 'ERROR',
          failureCategory: 'AI_PLANNING_ERROR',
          errorMessage: `Action "${String(step.action)}" is not permitted.`,
          durationMs: Date.now() - started,
          timestamp,
        };
    }
  } catch (err) {
    const classified = classifyPlaywrightError(err);
    return {
      stepNumber: step.stepNumber,
      action: step.action,
      description: step.description,
      locatorSummary,
      inputSummary,
      expectedResult,
      actualResult: classified.message,
      validationMethod: 'Playwright step execution monitor',
      status: classified.category === 'LOCATOR_FAILURE' || classified.category === 'TIMEOUT' ? 'FAILED' : 'ERROR',
      failureCategory: classified.category,
      errorMessage: classified.message,
      durationMs: Date.now() - started,
      timestamp,
    };
  }
}

function resolveDestinationUrl(baseUrl: string, target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}
