import { z } from 'zod';

export const TestModeSchema = z.enum([
  'functional',
  'ui',
  'form_validation',
  'navigation',
  'negative',
  'exploratory',
]);
export type TestMode = z.infer<typeof TestModeSchema>;

export const PrioritySchema = z.enum(['Critical', 'High', 'Medium', 'Low']);
export type Priority = z.infer<typeof PrioritySchema>;

export const AllowlistedActionSchema = z.enum([
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
]);
export type AllowlistedAction = z.infer<typeof AllowlistedActionSchema>;

export const LocatorStrategySchema = z.enum([
  'role',
  'label',
  'placeholder',
  'text',
  'testid',
  'css',
]);
export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

export const StepLocatorSchema = z.object({
  strategy: LocatorStrategySchema,
  value: z.string().min(1),
  role: z.string().optional(),
  exact: z.boolean().optional(),
});
export type StepLocator = z.infer<typeof StepLocatorSchema>;

export const TestStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  action: AllowlistedActionSchema,
  description: z.string().min(1),
  locator: StepLocatorSchema.optional(),
  value: z.string().optional(),
  expected: z.string().optional(),
});
export type TestStep = z.infer<typeof TestStepSchema>;

export const TestCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  objective: z.string().min(1),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(TestStepSchema).min(1),
  expectedResult: z.string().min(1),
  priority: PrioritySchema,
  category: z.string().min(1),
  approved: z.boolean().default(true),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const GeneratedPlanSchema = z.object({
  suiteName: z.string().min(1),
  summary: z.string().min(1),
  testCases: z.array(TestCaseSchema).min(1),
});
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

export type TestStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';

export type FailureCategory =
  | 'APPLICATION_FAILURE'
  | 'ASSERTION_FAILURE'
  | 'LOCATOR_FAILURE'
  | 'TIMEOUT'
  | 'TEST_EXECUTION_FAILURE'
  | 'AI_PLANNING_ERROR';

export interface ExtractedElement {
  tag: string;
  role: string;
  name: string;
  label: string;
  placeholder: string;
  type: string;
  id: string;
  testId: string;
  href: string;
  required: boolean;
  disabled: boolean;
  options?: string[];
  recommendedLocator: StepLocator;
}

export interface ExtractedForm {
  id: string;
  name: string;
  action: string;
  method: string;
  fields: ExtractedElement[];
  submitButtons: ExtractedElement[];
}

export interface PageAnalysis {
  url: string;
  finalUrl: string;
  title: string;
  analyzedAt: string;
  analysisDurationMs: number;
  headings: Array<{ level: string; text: string }>;
  visibleTextExcerpt: string;
  landmarks: string[];
  forms: ExtractedForm[];
  buttons: ExtractedElement[];
  inputs: ExtractedElement[];
  links: ExtractedElement[];
  selects: ExtractedElement[];
  checkboxes: ExtractedElement[];
  detectedFeatures: string[];
  initialScreenshotFile?: string;
  hasCaptchaOrPaymentWarning: boolean;
  warnings: string[];
}

export interface FailureAnalysisResult {
  failureCategory: FailureCategory;
  likelyCause: string;
  isApplicationBugLikely: boolean;
  explanation: string;
  suggestedInvestigation: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface StepExecutionRecord {
  stepNumber: number;
  action: AllowlistedAction;
  description: string;
  locatorSummary: string;
  inputSummary: string;
  expectedResult: string;
  actualResult: string;
  validationMethod: string;
  status: TestStatus;
  failureCategory?: FailureCategory;
  errorMessage?: string;
  durationMs: number;
  timestamp: string;
  screenshotFile?: string;
}

export interface TestCaseExecutionRecord {
  testCaseId: string;
  testCaseName: string;
  priority: Priority;
  category: string;
  objective: string;
  expectedResult: string;
  actualResult: string;
  validationMethod: string;
  status: TestStatus;
  failureCategory?: FailureCategory;
  errorMessage?: string;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  screenshotFile?: string;
  steps: StepExecutionRecord[];
  failureAnalysis?: FailureAnalysisResult;
}
