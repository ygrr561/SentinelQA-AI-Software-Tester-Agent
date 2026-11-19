import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { EvaluationMetrics, TestMode } from '../types/testing';
import { formatDuration, formatModeLabel, formatTimestamp } from '../components/StatusText';

interface EvaluationPageProps {
  onLaunchPreset: (preset: { url: string; objective: string; mode: TestMode }) => void;
  onOpenReport: (runId: string) => void;
}

const EVALUATION_DATASET: Array<{
  id: string;
  name: string;
  target: string;
  mode: TestMode;
  objective: string;
  expectedSignal: string;
}> = [
  {
    id: 'EVAL-01',
    name: 'Authentication Positive & Negative Suite',
    target: '/sandbox-app',
    mode: 'functional',
    objective:
      'Test Northstar Portal Sign In with valid demo credentials (qa.engineer@northstar.test / SentinelPass123!), wrong password, empty email, empty password, and sign-out flow.',
    expectedSignal: '100% pass rate on clean build; validates masking, inline errors, and active session view.',
  },
  {
    id: 'EVAL-02',
    name: 'Registration Constraint Validation Suite',
    target: '/sandbox-app',
    mode: 'form_validation',
    objective:
      'Switch to the Register tab and test empty submission, invalid email format, short password (<8 chars), mismatched confirm password, missing Terms checkbox, and successful registration.',
    expectedSignal: 'Verifies ARIA invalid states and role="alert" validation messages deterministically.',
  },
  {
    id: 'EVAL-03',
    name: 'Catalog Search, Select Filter & Navigation',
    target: '/sandbox-app',
    mode: 'navigation',
    objective:
      'Test tab navigation across Sign In, Register, Catalog Search, and Support Docs, plus filtering catalog items by search keyword ("Ethernet"), Category dropdown ("Testing"), and In-Stock checkbox.',
    expectedSignal: 'Verifies URL hash updates, document title changes, and filtered DOM output.',
  },
  {
    id: 'EVAL-04',
    name: 'Known-Defect Detection Benchmark (3 Seeded Bugs)',
    target: '/sandbox-app?defects=true',
    mode: 'negative',
    objective:
      'Test the defect-injected Northstar Portal build: verify login rejects empty password, registration rejects mismatched confirm password, and Catalog Search returns Quantum Telemetry Bridge when searching "Quantum".',
    expectedSignal: 'Agent should deterministically FAIL seeded defect checks and diagnose APPLICATION_FAILURE.',
  },
];

export function EvaluationPage({ onLaunchPreset, onOpenReport }: EvaluationPageProps) {
  const [metrics, setMetrics] = useState<EvaluationMetrics | null>(null);
  const [sandboxDefectView, setSandboxDefectView] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMetrics = () => {
    setLoading(true);
    api
      .getEvaluationMetrics()
      .then((m) => setMetrics(m))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Sandbox Target & Academic Evaluation
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Reproducible evaluation dataset and real measured metrics computed directly from SQLite execution records—zero fabricated benchmarks.
          </p>
        </div>
        <button
          type="button"
          onClick={loadMetrics}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#111827] border border-[#1F2D42] hover:border-slate-600 rounded-lg self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recompute Metrics
        </button>
      </div>

      {/* Measured Empirical Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-6 bg-[#111827] border border-[#1F2D42] rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#1F2D42]">
        <EvalMetric label="Evaluated Runs" value={loading ? '—' : String(metrics?.evaluatedRunsCount ?? 0)} />
        <EvalMetric
          label="Avg Plan Gen Time"
          value={loading ? '—' : formatDuration(metrics?.avgPlanGenerationMs)}
        />
        <EvalMetric
          label="Generated Cases"
          value={loading ? '—' : String(metrics?.totalGeneratedCases ?? 0)}
        />
        <EvalMetric
          label="Exec Pass Rate"
          value={loading ? '—' : `${metrics?.executionSuccessRate ?? 0}%`}
          accent="text-emerald-400"
        />
        <EvalMetric
          label="Valid Step Rate"
          value={loading ? '—' : `${metrics?.validStepPercentage ?? 0}%`}
          accent="text-blue-400"
        />
        <EvalMetric
          label="Defects Flagged"
          value={loading ? '—' : String(metrics?.applicationFailuresDetected ?? 0)}
          accent="text-rose-400"
        />
      </section>

      {/* Reproducible Evaluation Dataset */}
      <section className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1F2D42]">
          <h2 className="text-base font-semibold text-white">Reproducible Evaluation Dataset</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Standardized benchmark suites targeting the built-in Northstar Portal demo application
          </p>
        </div>
        <div className="divide-y divide-[#1F2D42]">
          {EVALUATION_DATASET.map((item) => (
            <div
              key={item.id}
              className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-800/20 transition-colors"
            >
              <div className="space-y-1 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="text-blue-400 font-semibold">{item.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.target}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">{formatModeLabel(item.mode)}</span>
                </div>
                <div className="text-sm font-semibold text-white">{item.name}</div>
                <p className="text-xs text-slate-300">{item.objective}</p>
                <p className="text-xs text-slate-500">Expected signal: {item.expectedSignal}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onLaunchPreset({
                    url: item.target,
                    objective: item.objective,
                    mode: item.mode,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start lg:self-center"
              >
                Load in Runner
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Embedded Live Preview of Built-in Demo Target App */}
      <section className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1F2D42] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Built-In Target Application: Northstar Portal
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authorized local target hosted at <code className="font-mono text-blue-400">/sandbox-app</code> for live Playwright demonstration
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1F2D42] rounded-lg">
              <button
                type="button"
                onClick={() => setSandboxDefectView(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  !sandboxDefectView ? 'bg-[#1E293B] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Clean Build
              </button>
              <button
                type="button"
                onClick={() => setSandboxDefectView(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  sandboxDefectView ? 'bg-rose-900/60 text-rose-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Seeded Defects Mode
              </button>
            </div>

            <a
              href={sandboxDefectView ? '/sandbox-app?defects=true' : '/sandbox-app'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap"
            >
              Open Full Tab
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <iframe
          title="Northstar Portal Sandbox Preview"
          src={sandboxDefectView ? '/sandbox-app?defects=true' : '/sandbox-app'}
          className="w-full h-[460px] bg-white border-0"
        />
      </section>

      {/* Recorded Evaluation Run History */}
      {metrics && metrics.runs.length > 0 && (
        <section className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1F2D42]">
            <h2 className="text-base font-semibold text-white">Completed Evaluation Runs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0E1628] border-b border-[#1F2D42] text-slate-400">
                  <th className="py-3 px-5">Target</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Plan Gen</th>
                  <th className="py-3 px-4 text-right">Exec Time</th>
                  <th className="py-3 px-4 text-right">Pass / Fail</th>
                  <th className="py-3 px-4">Recorded</th>
                  <th className="py-3 px-5 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2D42] font-mono tabular-nums">
                {metrics.runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/25">
                    <td className="py-3 px-5 text-blue-400">{r.display_url}</td>
                    <td className="py-3 px-4 font-sans text-slate-300">{formatModeLabel(r.mode)}</td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {formatDuration(r.plan_generation_ms)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300">
                      {formatDuration(r.execution_duration_ms)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-emerald-400">{r.passed_cases}</span>
                      <span className="text-slate-600"> / </span>
                      <span className="text-rose-400">{r.failed_cases + r.error_cases}</span>
                      <span className="text-slate-500 ml-1">({r.pass_percentage}%)</span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{formatTimestamp(r.created_at)}</td>
                    <td className="py-3 px-5 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => onOpenReport(r.id)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function EvalMetric({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
