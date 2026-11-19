export type TestMode =
  | 'functional'
  | 'ui'
  | 'form_validation'
  | 'navigation'
  | 'negative'
  | 'exploratory';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TestStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
export type FailureCategory =
  | 'APPLICATION_FAILURE'
  | 'ASSERTION_FAILURE'
  | 'LOCATOR_FAILURE'
  | 'TIMEOUT'
  | 'TEST_EXECUTION_FAILURE'
  | 'AI_PLANNING_ERROR';

export type AllowlistedAction =
  | 'navigate'
  | 'click'
  | 'type'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'scroll'
  | 'wait_for_visible'
  | 'verify_text'
  | 'verify_visible'
  | 'verify_not_visible'
  | 'verify_url'
  | 'verify_title'
  | 'verify_form_validation'
  | 'screenshot';

export interface StepLocator {
  strategy: 'role' | 'label' | 'placeholder' | 'text' | 'testid' | 'css';
  value: string;
  role?: string;
  exact?: boolean;
}

export interface TestStep {
  stepNumber: number;
  action: AllowlistedAction;
  description: string;
  locator?: StepLocator;
  value?: string;
  expected?: string;
}

export interface TestCase {
  id: string;
  name: string;
  objective: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  priority: Priority;
  category: string;
  approved: boolean;
}

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

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  component: string;
  message: string;
  testCaseId?: string;
  stepIndex?: number;
}

export interface TestRunSummary {
  id: string;
  targetUrl?: string;
  displayUrl: string;
  objective: string;
  mode: TestMode;
  aiProvider?: string;
  aiModel?: string;
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  errorCases: number;
  passPercentage: number;
  planGenerationMs: number;
  executionDurationMs: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TestRunDetail extends TestRunSummary {
  requestedCount: number;
  pageAnalysis: PageAnalysis | null;
  suite: {
    id: string;
    name: string;
    summary: string;
    approved: boolean;
    approvedAt: string | null;
    createdAt: string;
  } | null;
  testCases: TestCase[];
  screenshots: Array<{
    id: string;
    test_case_id: string | null;
    step_number: number | null;
    filename: string;
    caption: string;
    captured_at: string;
  }>;
}

export interface DashboardStats {
  totalRuns: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  errorCases: number;
  successPercentage: number;
  avgPlanGenerationMs: number;
  avgExecutionDurationMs: number;
  recentRuns: TestRunSummary[];
  modeBreakdown: Array<{ mode: string; runCount: number; passed: number; failed: number }>;
  failureBreakdown: Array<{ category: string; count: number }>;
}

export interface ProviderConfigResponse {
  activeProvider: 'gemini' | 'openai_compatible';
  activeModel: string;
  playwrightDetected: boolean;
  allowLocalhostTesting: boolean;
  sandboxUrl: string;
  sandboxDefectsUrl: string;
  providers: Array<{
    id: 'gemini' | 'openai_compatible';
    name: string;
    defaultModel: string;
    availableModels: string[];
    configured: boolean;
  }>;
}

export interface StructuredReport {
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
    screenshotUrl?: string;
    failureAnalysis?: FailureAnalysisResult;
    steps: StepExecutionRecord[];
    logs: LogEntry[];
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

export interface EvaluationMetrics {
  evaluatedRunsCount: number;
  avgPlanGenerationMs: number;
  totalGeneratedCases: number;
  executionSuccessRate: number;
  validStepPercentage: number;
  applicationFailuresDetected: number;
  totalFailuresAnalyzed: number;
  failureAnalysisCoverageRate: number;
  runs: Array<{
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
}
