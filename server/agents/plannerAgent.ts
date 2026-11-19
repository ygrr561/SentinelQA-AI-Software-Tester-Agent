import { Type, type Schema } from '@google/genai';
import {
  GeneratedPlanSchema,
  type GeneratedPlan,
  type PageAnalysis,
  type TestMode,
} from '../schemas/testPlan.ts';
import type { AIProviderId } from '../core/config.ts';
import { generateStructuredJson } from './llmProvider.ts';

const TEST_PLAN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    suiteName: { type: Type.STRING, description: 'Concise test suite name.' },
    summary: { type: Type.STRING, description: '1-2 sentence overview of test coverage strategy.' },
    testCases: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'Unique test case ID such as TC-001.' },
          name: { type: Type.STRING, description: 'Clear descriptive name of the test scenario.' },
          objective: { type: Type.STRING, description: 'Specific verification objective.' },
          preconditions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          expectedResult: { type: Type.STRING, description: 'Concrete deterministic expected outcome.' },
          priority: {
            type: Type.STRING,
            enum: ['Critical', 'High', 'Medium', 'Low'],
          },
          category: { type: Type.STRING, description: 'Category such as Positive, Negative, Validation, Boundary, Navigation, UI.' },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: { type: Type.INTEGER },
                action: {
                  type: Type.STRING,
                  enum: [
                    'navigate',
                    'click',
                    'type',
                    'fill',
                    'select',
                    'check',
                    'uncheck',
                    'scroll',
                    'wait_for_visible',
                    'verify_text',
                    'verify_visible',
                    'verify_not_visible',
                    'verify_url',
                    'verify_title',
                    'verify_form_validation',
                    'screenshot',
                  ],
                },
                description: { type: Type.STRING },
                locator: {
                  type: Type.OBJECT,
                  properties: {
                    strategy: {
                      type: Type.STRING,
                      enum: ['role', 'label', 'placeholder', 'text', 'testid', 'css'],
                    },
                    value: { type: Type.STRING },
                    role: { type: Type.STRING },
                    exact: { type: Type.BOOLEAN },
                  },
                  required: ['strategy', 'value'],
                },
                value: { type: Type.STRING },
                expected: { type: Type.STRING },
              },
              required: ['stepNumber', 'action', 'description'],
            },
          },
        },
        required: ['id', 'name', 'objective', 'preconditions', 'expectedResult', 'priority', 'category', 'steps'],
      },
    },
  },
  required: ['suiteName', 'summary', 'testCases'],
};

function buildCompactPageContext(analysis: PageAnalysis): string {
  const compact = {
    url: analysis.url,
    title: analysis.title,
    headings: analysis.headings.slice(0, 10),
    landmarks: analysis.landmarks,
    detectedFeatures: analysis.detectedFeatures,
    visibleTextExcerpt: analysis.visibleTextExcerpt.slice(0, 1100),
    forms: analysis.forms.slice(0, 6).map((f) => ({
      name: f.name,
      fields: f.fields.slice(0, 10).map((fld) => ({
        tag: fld.tag,
        type: fld.type,
        label: fld.label,
        placeholder: fld.placeholder,
        required: fld.required,
        options: fld.options,
        locator: fld.recommendedLocator,
      })),
      submitButtons: f.submitButtons.slice(0, 4).map((b) => ({
        name: b.name,
        locator: b.recommendedLocator,
      })),
    })),
    buttons: analysis.buttons.slice(0, 20).map((b) => ({
      name: b.name,
      role: b.role,
      locator: b.recommendedLocator,
    })),
    inputs: analysis.inputs.slice(0, 18).map((i) => ({
      name: i.name,
      type: i.type,
      label: i.label,
      placeholder: i.placeholder,
      required: i.required,
      locator: i.recommendedLocator,
    })),
    selects: analysis.selects.slice(0, 8).map((s) => ({
      name: s.name,
      options: s.options,
      locator: s.recommendedLocator,
    })),
    checkboxes: analysis.checkboxes.slice(0, 8).map((c) => ({
      name: c.name,
      locator: c.recommendedLocator,
    })),
    links: analysis.links.slice(0, 16).map((l) => ({
      name: l.name,
      href: l.href,
      locator: l.recommendedLocator,
    })),
  };

  return JSON.stringify(compact, null, 2);
}

function modeGuidance(mode: TestMode): string {
  switch (mode) {
    case 'functional':
      return 'Prioritize end-to-end positive user workflows plus key negative/error handling checks across primary forms, search, or navigation.';
    case 'ui':
      return 'Prioritize verifying visible headings, key interactive elements, labels, layout controls, tab visibility, and state transitions.';
    case 'form_validation':
      return 'Prioritize required field checks, empty submissions, malformed email/input formats, password/confirmation rules, boundary values, and verify_form_validation assertions.';
    case 'navigation':
      return 'Prioritize clicking tabs, navigation links, verifying URL/hash or active section transitions, page titles, and key section headings.';
    case 'negative':
      return 'Prioritize invalid credentials, empty submissions, missing required inputs, non-matching search queries, boundary values, and verifying rejection/validation messages.';
    case 'exploratory':
      return 'Generate a balanced mix of positive workflows, negative edge cases, navigation transitions, search/filter combinations, and UI integrity checks.';
  }
}

function cleanAndDeduplicatePlan(plan: GeneratedPlan): GeneratedPlan {
  const seenNames = new Set<string>();
  const uniqueCases = [];
  let seq = 1;

  for (const tc of plan.testCases) {
    const norm = tc.name.trim().toLowerCase();
    if (seenNames.has(norm)) continue;
    seenNames.add(norm);

    const normalizedSteps = tc.steps.map((s, idx) => ({
      ...s,
      stepNumber: idx + 1,
    }));

    uniqueCases.push({
      ...tc,
      id: `TC-${String(seq++).padStart(3, '0')}`,
      approved: true,
      steps: normalizedSteps,
    });
  }

  return {
    ...plan,
    testCases: uniqueCases.length > 0 ? uniqueCases : plan.testCases,
  };
}

/**
 * AI Test Planning Agent:
 * Uses the inspected page context and testing objective to synthesize
 * deterministic, Playwright-executable test cases validated with Zod.
 */
export async function generateTestPlan(params: {
  pageAnalysis: PageAnalysis;
  objective: string;
  mode: TestMode;
  requestedCount: number;
  provider?: AIProviderId;
  model?: string;
}): Promise<{ plan: GeneratedPlan; provider: AIProviderId; model: string; durationMs: number }> {
  const started = Date.now();
  const count = Math.max(2, Math.min(params.requestedCount || 6, 12));

  const systemInstruction = `You are a Principal QA Automation Engineer generating executable Playwright test plans.
CRITICAL RULES:
1. Ground EVERY locator strictly in the provided PageAnalysis JSON. Use the exact "recommendedLocator" strategy/value/role provided in PageAnalysis whenever interacting with inputs, buttons, tabs, selects, checkboxes, or links.
2. Prefer accessible locators ("label", "role", "placeholder", "text", "testid"). Never invent CSS selectors or elements that do not exist in PageAnalysis.
3. Every test case starts on the target page automatically (do not waste step 1 navigating unless navigating to a sub-route or tab).
4. Every test case MUST end with at least one deterministic assertion step: verify_text, verify_visible, verify_not_visible, verify_url, verify_title, or verify_form_validation.
5. For form validation or empty/invalid form submissions, use "verify_form_validation" with a short expected error keyword (or omit expected to assert any native/ARIA validation error).
6. For hidden tabs/sections (for example if the page has tabs like "Register", "Catalog Search", "Support Docs"), first click the tab button using its exact role/name before interacting with elements inside that tab!
7. If PageAnalysis visible text lists demo credentials (e.g., an email and password shown on the page), use those exact demo credentials for positive login tests, and invalid credentials for negative login tests.
8. Generate exactly ${count} distinct, non-duplicate, meaningful test cases covering positive, negative, and validation scenarios appropriate to the requested mode.
9. Never include arbitrary shell commands, payment submissions, or CAPTCHA bypass attempts.
10. Output strict JSON matching the schema.`;

  const userPrompt = `Target Page Analysis:
${buildCompactPageContext(params.pageAnalysis)}

Testing Mode: ${params.mode}
Mode Guidance: ${modeGuidance(params.mode)}
User Testing Objective: ${params.objective}
Desired Test Case Count: ${count}

Produce the structured JSON test suite now.`;

  let lastParseError = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const promptToSend =
      attempt === 1
        ? userPrompt
        : `${userPrompt}\n\nPrevious JSON output failed schema validation with error: ${lastParseError}. Fix all schema issues and return strictly valid JSON.`;

    const llmRes = await generateStructuredJson({
      provider: params.provider,
      model: params.model,
      systemInstruction,
      prompt: promptToSend,
      responseSchema: TEST_PLAN_RESPONSE_SCHEMA,
    });

    try {
      const cleanedText = llmRes.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const rawJson = JSON.parse(cleanedText);
      const parsed = GeneratedPlanSchema.parse(rawJson);
      const cleanPlan = cleanAndDeduplicatePlan(parsed);

      return {
        plan: cleanPlan,
        provider: llmRes.provider,
        model: llmRes.model,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      lastParseError = err instanceof Error ? err.message : String(err);
      if (attempt === 2) {
        throw new Error(`AI Planning Error: Malformed test plan output after retry (${lastParseError})`);
      }
    }
  }

  throw new Error('AI Planning Error: Unable to generate valid test plan.');
}
