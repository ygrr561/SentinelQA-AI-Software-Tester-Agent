import type {
  DashboardStats,
  EvaluationMetrics,
  LogEntry,
  PageAnalysis,
  ProviderConfigResponse,
  StructuredReport,
  TestCase,
  TestCaseExecutionRecord,
  TestMode,
  TestRunDetail,
  TestRunSummary,
} from '../types/testing';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  getProviderConfig(): Promise<ProviderConfigResponse> {
    return apiFetch('/api/config/providers');
  },

  getDashboardStats(): Promise<DashboardStats> {
    return apiFetch('/api/dashboard/stats');
  },

  getEvaluationMetrics(): Promise<EvaluationMetrics> {
    return apiFetch('/api/evaluation/metrics');
  },

  listTestRuns(limit = 50): Promise<{ runs: TestRunSummary[] }> {
    return apiFetch(`/api/test-runs?limit=${limit}`);
  },

  getTestRun(runId: string): Promise<{ run: TestRunDetail; executing: boolean }> {
    return apiFetch(`/api/test-runs/${encodeURIComponent(runId)}`);
  },

  getTestRunResults(runId: string): Promise<{
    run: TestRunDetail;
    results: TestCaseExecutionRecord[];
    logs: LogEntry[];
    executing: boolean;
  }> {
    return apiFetch(`/api/test-runs/${encodeURIComponent(runId)}/results`);
  },

  deleteTestRun(runId: string): Promise<{ deleted: boolean; id: string }> {
    return apiFetch(`/api/test-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
  },

  analyzeUrl(payload: {
    url: string;
    allowLocalhostOverride?: boolean;
  }): Promise<{ analysis: PageAnalysis; normalizedUrl: string; isBuiltinSandbox: boolean }> {
    return apiFetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  generateTestPlan(payload: {
    url: string;
    objective: string;
    mode: TestMode;
    requestedCount: number;
    provider?: 'gemini' | 'openai_compatible';
    model?: string;
    existingAnalysis?: PageAnalysis;
    allowLocalhostOverride?: boolean;
  }): Promise<{ run: TestRunDetail }> {
    return apiFetch('/api/test-plans/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  approveTestPlan(payload: {
    runId: string;
    approvedCaseIds?: string[];
    editedCases?: TestCase[];
  }): Promise<{ run: TestRunDetail }> {
    return apiFetch('/api/test-plans/approve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  executeTestRun(payload: {
    runId: string;
    allowLocalhostOverride?: boolean;
  }): Promise<{ runId: string; started: boolean; alreadyRunning: boolean; streamUrl: string }> {
    return apiFetch('/api/test-runs/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getReport(runId: string): Promise<{ report: StructuredReport }> {
    return apiFetch(`/api/reports/${encodeURIComponent(runId)}`);
  },
};
