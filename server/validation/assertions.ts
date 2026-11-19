import type { Page } from 'playwright-core';
import type { FailureCategory, StepLocator } from '../schemas/testPlan.ts';
import { resolveLocator } from '../browser/locatorStrategy.ts';

export interface AssertionOutcome {
  passed: boolean;
  actualResult: string;
  validationMethod: string;
  failureCategory?: FailureCategory;
  errorMessage?: string;
}

export function classifyPlaywrightError(err: unknown): {
  category: FailureCategory;
  message: string;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const firstLine = raw.split('\n').slice(0, 2).join(' ').trim();

  if (/timeout|exceeded/i.test(raw)) {
    if (/locator|waiting for/i.test(raw)) {
      return { category: 'LOCATOR_FAILURE', message: firstLine };
    }
    return { category: 'TIMEOUT', message: firstLine };
  }
  if (/strict mode violation|not found|no element|resolved to 0 elements/i.test(raw)) {
    return { category: 'LOCATOR_FAILURE', message: firstLine };
  }
  if (/net::err_|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|blockedbyclient/i.test(raw)) {
    return { category: 'TEST_EXECUTION_FAILURE', message: firstLine };
  }
  return { category: 'TEST_EXECUTION_FAILURE', message: firstLine };
}

export async function verifyTextAssertion(
  page: Page,
  expectedText: string,
  locator?: StepLocator,
  timeoutMs = 5000
): Promise<AssertionOutcome> {
  const target = expectedText.trim();
  const needle = target.toLowerCase();

  if (locator) {
    try {
      const el = await resolveLocator(page, locator);
      await el.waitFor({ state: 'visible', timeout: timeoutMs });
      const actual = ((await el.innerText()) || (await el.textContent()) || '').trim();
      const matched = actual.toLowerCase().includes(needle);
      if (matched) {
        return {
          passed: true,
          actualResult: `Element text matched: "${actual.slice(0, 160)}"`,
          validationMethod: 'Deterministic DOM innerText containment check on target locator',
        };
      }
      return {
        passed: false,
        actualResult: `Element text was "${actual.slice(0, 160)}" (did not contain "${target}")`,
        validationMethod: 'Deterministic DOM innerText containment check on target locator',
        failureCategory: 'ASSERTION_FAILURE',
        errorMessage: `Expected element text to contain "${target}", but found "${actual.slice(0, 160)}"`,
      };
    } catch (err) {
      // Fallback: check full visible page text if locator was actually the expected text itself
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      if (bodyText.toLowerCase().includes(needle)) {
        return {
          passed: true,
          actualResult: `Expected text "${target}" is visible in rendered page content.`,
          validationMethod: 'Deterministic visible document body text verification',
        };
      }
      const classified = classifyPlaywrightError(err);
      return {
        passed: false,
        actualResult: `Text "${target}" was not found via locator or visible page text.`,
        validationMethod: 'Deterministic DOM text verification',
        failureCategory: classified.category === 'LOCATOR_FAILURE' ? 'ASSERTION_FAILURE' : classified.category,
        errorMessage: `Expected visible text "${target}" not found. ${classified.message}`,
      };
    }
  }

  // Wait briefly for dynamic UI text to appear
  const deadline = Date.now() + timeoutMs;
  let lastBody = '';
  while (Date.now() < deadline) {
    lastBody = await page.evaluate(() => document.body?.innerText || '');
    if (lastBody.toLowerCase().includes(needle)) {
      return {
        passed: true,
        actualResult: `Found expected text "${target}" in visible page content.`,
        validationMethod: 'Deterministic visible document body text verification',
      };
    }
    await page.waitForTimeout(200);
  }

  return {
    passed: false,
    actualResult: `Visible page text did not contain "${target}".`,
    validationMethod: 'Deterministic visible document body text verification',
    failureCategory: 'ASSERTION_FAILURE',
    errorMessage: `Expected page text to contain "${target}", but it was absent after ${timeoutMs}ms.`,
  };
}

export async function verifyElementVisibilityAssertion(
  page: Page,
  locator: StepLocator,
  shouldBeVisible: boolean,
  timeoutMs = 5000
): Promise<AssertionOutcome> {
  const el = await resolveLocator(page, locator, { allowFallback: shouldBeVisible });
  if (shouldBeVisible) {
    try {
      await el.waitFor({ state: 'visible', timeout: timeoutMs });
      return {
        passed: true,
        actualResult: `Target element (${locator.strategy}="${locator.value}") is visible.`,
        validationMethod: 'Deterministic Playwright visibility assertion (state=visible)',
      };
    } catch (err) {
      const classified = classifyPlaywrightError(err);
      return {
        passed: false,
        actualResult: `Target element (${locator.strategy}="${locator.value}") is NOT visible.`,
        validationMethod: 'Deterministic Playwright visibility assertion (state=visible)',
        failureCategory: classified.category,
        errorMessage: classified.message,
      };
    }
  } else {
    try {
      await el.waitFor({ state: 'hidden', timeout: timeoutMs });
      return {
        passed: true,
        actualResult: `Target element (${locator.strategy}="${locator.value}") is hidden or detached.`,
        validationMethod: 'Deterministic Playwright non-visibility assertion (state=hidden)',
      };
    } catch {
      return {
        passed: false,
        actualResult: `Target element (${locator.strategy}="${locator.value}") remained visible.`,
        validationMethod: 'Deterministic Playwright non-visibility assertion (state=hidden)',
        failureCategory: 'ASSERTION_FAILURE',
        errorMessage: `Expected element (${locator.strategy}="${locator.value}") to be hidden, but it is still visible.`,
      };
    }
  }
}

export async function verifyUrlAssertion(page: Page, expectedFragment: string): Promise<AssertionOutcome> {
  await page.waitForTimeout(250);
  const currentUrl = page.url();
  const normalizedExpected = expectedFragment.trim().toLowerCase();
  const matched = currentUrl.toLowerCase().includes(normalizedExpected);
  if (matched) {
    return {
      passed: true,
      actualResult: `Browser URL "${currentUrl}" matches expected "${expectedFragment}".`,
      validationMethod: 'Deterministic browser URL verification (page.url)',
    };
  }
  return {
    passed: false,
    actualResult: `Browser URL is "${currentUrl}", expected substring "${expectedFragment}".`,
    validationMethod: 'Deterministic browser URL verification (page.url)',
    failureCategory: 'ASSERTION_FAILURE',
    errorMessage: `URL mismatch: expected "${expectedFragment}" in "${currentUrl}"`,
  };
}

export async function verifyTitleAssertion(page: Page, expectedTitle: string): Promise<AssertionOutcome> {
  const actualTitle = await page.title();
  const matched = actualTitle.toLowerCase().includes(expectedTitle.trim().toLowerCase());
  if (matched) {
    return {
      passed: true,
      actualResult: `Document title "${actualTitle}" contains "${expectedTitle}".`,
      validationMethod: 'Deterministic document.title verification',
    };
  }
  return {
    passed: false,
    actualResult: `Document title is "${actualTitle}", expected "${expectedTitle}".`,
    validationMethod: 'Deterministic document.title verification',
    failureCategory: 'ASSERTION_FAILURE',
    errorMessage: `Title mismatch: expected "${expectedTitle}", got "${actualTitle}"`,
  };
}

export async function verifyFormValidationAssertion(
  page: Page,
  expectedMessage?: string,
  locator?: StepLocator
): Promise<AssertionOutcome> {
  await page.waitForTimeout(250);

  // 1. Check native HTML5 Constraint Validation API and aria-invalid states across the page or specific locator
  const domValidation = await page.evaluate(() => {
    const invalidInputs = Array.from(document.querySelectorAll('input, select, textarea')).filter((el) => {
      const input = el as HTMLInputElement;
      const ariaInvalid = el.getAttribute('aria-invalid') === 'true';
      const nativeInvalid = typeof input.checkValidity === 'function' && !input.checkValidity();
      return ariaInvalid || nativeInvalid;
    });

    const nativeMessages = invalidInputs
      .map((el) => (el as HTMLInputElement).validationMessage)
      .filter(Boolean);

    const alertElements = Array.from(
      document.querySelectorAll('[role="alert"], .error, .error-message, [data-validation-error], [aria-live="assertive"], [aria-live="polite"]')
    )
      .filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (el.textContent || '').trim().length > 0;
      })
      .map((el) => (el.textContent || '').trim());

    return {
      invalidCount: invalidInputs.length,
      nativeMessages,
      alertMessages: alertElements,
      bodyText: document.body?.innerText || '',
    };
  });

  if (locator) {
    try {
      const el = await resolveLocator(page, locator);
      if ((await el.count()) > 0) {
        const specificCheck = await el.evaluate((node: Element) => {
          const inp = node as HTMLInputElement;
          return {
            valid: typeof inp.checkValidity === 'function' ? inp.checkValidity() : true,
            validationMessage: inp.validationMessage || '',
            ariaInvalid: node.getAttribute('aria-invalid') === 'true',
            text: (node.textContent || '').trim(),
          };
        });
        if (!specificCheck.valid || specificCheck.ariaInvalid) {
          return {
            passed: true,
            actualResult: `Validation triggered on target input: "${specificCheck.validationMessage || 'aria-invalid=true'}"`,
            validationMethod: 'Deterministic HTML5 Constraint Validation API & ARIA invalid state check',
          };
        }
      }
    } catch {
      // fall through to page-level validation check
    }
  }

  const combinedMessages = [...domValidation.nativeMessages, ...domValidation.alertMessages];

  if (expectedMessage && expectedMessage.trim().length > 0) {
    const needle = expectedMessage.trim().toLowerCase();
    const matchedInAlerts = combinedMessages.some((m) => m.toLowerCase().includes(needle));
    const matchedInBody = domValidation.bodyText.toLowerCase().includes(needle);
    if (matchedInAlerts || matchedInBody) {
      return {
        passed: true,
        actualResult: `Form validation message verified: "${combinedMessages[0] || expectedMessage}"`,
        validationMethod: 'Deterministic HTML5 & DOM role=alert validation check',
      };
    }
    if (domValidation.invalidCount > 0) {
      return {
        passed: true,
        actualResult: `Native HTML5 form validation blocked submission (${domValidation.invalidCount} invalid field(s): "${domValidation.nativeMessages[0] || 'invalid'}").`,
        validationMethod: 'Deterministic HTML5 Constraint Validation API check',
      };
    }
    return {
      passed: false,
      actualResult: `No matching validation message ("${expectedMessage}") or invalid input state detected. Alerts found: ${combinedMessages.length > 0 ? combinedMessages.join('; ') : 'none'}.`,
      validationMethod: 'Deterministic HTML5 & DOM role=alert validation check',
      failureCategory: 'APPLICATION_FAILURE',
      errorMessage: `Form validation failed to trigger expected error "${expectedMessage}".`,
    };
  }

  if (domValidation.invalidCount > 0 || domValidation.alertMessages.length > 0) {
    return {
      passed: true,
      actualResult: `Form validation triggered (${domValidation.invalidCount} invalid inputs, alerts: ${domValidation.alertMessages.slice(0, 2).join(' | ') || domValidation.nativeMessages[0] || 'HTML5 invalid'})`,
      validationMethod: 'Deterministic HTML5 Constraint Validation API & ARIA alert check',
    };
  }

  return {
    passed: false,
    actualResult: 'Form submitted or remained valid with 0 invalid fields and 0 visible alert/error messages.',
    validationMethod: 'Deterministic HTML5 Constraint Validation API & ARIA alert check',
    failureCategory: 'APPLICATION_FAILURE',
    errorMessage: 'Expected form validation to reject invalid input, but no validation error or invalid field state occurred.',
  };
}
