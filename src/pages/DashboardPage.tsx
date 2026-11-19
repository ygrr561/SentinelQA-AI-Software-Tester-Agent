import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import type { DashboardStats, TestRunSummary } from '../types/testing';
import {
  formatDuration,
  formatModeLabel,
  formatTimestamp,
  RunStatusText,
} from '../components/StatusText';

interface DashboardPageProps {
  onNewRun: (preset?: { url: string; objective: string; mode: TestRunSummary['mode'] }) => void;
  onOpenPlan: (runId: string) => void;
  onOpenExecution: (runId: string) => void;
  onOpenReport: (runId: string) => void;
}

export function DashboardPage({
  onNewRun,
  onOpenPlan,
  onOpenExecution,
  onOpenReport,
}: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleDeleteRun = async (runId: string) => {
    try {
      await api.deleteTestRun(runId);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete test run.');
    }
  };

  const filteredRuns = (stats?.recentRuns || []).filter((r) => {
    if (statusFilter === 'PASSED' && r.status !== 'COMPLETED') return false;
    if (statusFilter === 'FAILED' && r.status !== 'COMPLETED_WITH_FAILURES' && r.status !== 'ERROR') return false;
    if (statusFilter === 'PENDING' && r.status !== 'PLAN_READY' && r.status !== 'PLAN_APPROVED' && r.status !== 'RUNNING') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.displayUrl.toLowerCase().includes(q) ||
        r.objective.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Automated Testing Overview
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Real Playwright execution telemetry, deterministic validation pass rates, and root-cause diagnostics persisted in SQLite.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#111827] border border-[#1F2D42] hover:border-slate-600 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* 5-Column KPI Strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 bg-[#111827] border border-[#1F2D42] rounded-xl divide-y md:divide-y-0 md:divide-x divide-[#1F2D42]">
        <MetricCell
          label="Total Test Runs"
          value={loading ? '—' : String(stats?.totalRuns ?? 0)}
          subtext={stats && stats.avgExecutionDurationMs > 0 ? `Avg exec ${formatDuration(stats.avgExecutionDurationMs)}` : 'No completed runs'}
        />
        <MetricCell
          label="Total Test Cases"
          value={loading ? '—' : String(stats?.totalCases ?? 0)}
          subtext={stats && stats.avgPlanGenerationMs > 0 ? `Avg plan ${formatDuration(stats.avgPlanGenerationMs)}` : 'AI-generated plans'}
        />
        <MetricCell
          label="Passed Tests"
          value={loading ? '—' : String(stats?.passedCases ?? 0)}
          accent="text-emerald-400"
          subtext="Deterministic assertions"
        />
        <MetricCell
          label="Failed Tests"
          value={loading ? '—' : String((stats?.failedCases ?? 0) + (stats?.errorCases ?? 0))}
          accent="text-rose-400"
          subtext={stats && stats.skippedCases > 0 ? `${stats.skippedCases} skipped` : 'Includes errors'}
        />
        <MetricCell
          label="Success Rate"
          value={loading ? '—' : `${stats?.successPercentage ?? 0}%`}
          accent="text-blue-400"
          subtext="Across executed cases"
        />
      </section>

      {/* Activity Breakdown Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Testing Activity by Mode */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F2D42] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-white">Testing Activity by Mode</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribution of passed and failed assertions across testing strategies
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-9 bg-slate-800/50 rounded animate-pulse" />
              ))}
            </div>
          ) : !stats || stats.modeBreakdown.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-[#1F2D42] rounded-lg">
              <p className="text-sm text-slate-400">No execution history recorded yet.</p>
              <p className="text-xs text-slate-500 mt-1">
                Launch a test run against the built-in Northstar Portal sandbox or any authorized web application.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onNewRun({
                      url: '/sandbox-app',
                      objective: 'Test the account sign-in workflow including valid credentials, incorrect password, empty email, and empty password validation.',
                      mode: 'functional',
                    })
                  }
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  Run Sandbox Login Suite
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onNewRun({
                      url: '/sandbox-app?defects=true',
                      objective: 'Verify login validation, registration password confirmation matching, and catalog search for "Quantum" to detect seeded application defects.',
                      mode: 'negative',
                    })
                  }
                  className="px-4 py-2 text-xs font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors"
                >
                  Run Defect Detection Benchmark
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.modeBreakdown.map((m) => {
                const total = m.passed + m.failed;
                const passPct = total > 0 ? Math.round((m.passed / total) * 100) : 0;
                return (
                  <div key={m.mode} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">{formatModeLabel(m.mode)}</span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {m.runCount} run{m.runCount === 1 ? '' : 's'} · {m.passed} passed · {m.failed} failed ({passPct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-[#0B1120] rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{ width: `${passPct}%` }}
                      />
                      <div
                        className="bg-rose-500 transition-all"
                        style={{ width: `${total > 0 ? 100 - passPct : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Failure Classification Summary */}
        <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Failure Classification</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Root causes categorized by deterministic assertions and AI analysis
            </p>

            {!stats || stats.failureBreakdown.length === 0 ? (
              <div className="mt-6 py-8 text-center border border-dashed border-[#1F2D42] rounded-lg">
                <p className="text-xs text-slate-400">No failures logged across recent runs.</p>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-[#1F2D42]">
                {stats.failureBreakdown.map((item) => (
                  <div
                    key={item.category}
                    className="py-2.5 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-slate-300">{item.category}</span>
                    <span className="font-mono tabular-nums font-semibold text-rose-400">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-[#1F2D42] text-xs text-slate-400">
            Failed cases automatically capture PNG viewport evidence and run root-cause diagnostics.
          </div>
        </div>
      </section>

      {/* Recent Test Runs Table */}
      <section className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1F2D42] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Recent Test Runs</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any run to inspect its test plan, live execution trace, or exportable QA report
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by URL or objective..."
              className="px-3 py-1.5 text-xs bg-[#0B1120] border border-[#1F2D42] rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-56"
            />
            <div className="flex items-center gap-1 p-1 bg-[#0B1120] border border-[#1F2D42] rounded-lg">
              {(['ALL', 'PASSED', 'FAILED', 'PENDING'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-[#1E293B] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-11 bg-slate-800/40 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-300">No test runs match your current view.</p>
            <p className="text-xs text-slate-500 mt-1">
              Start a new test run to inspect a target web interface and execute automated Playwright tests.
            </p>
            <button
              type="button"
              onClick={() => onNewRun()}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
            >
              Start First Test Run
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1F2D42] text-xs font-medium text-slate-400 bg-[#0E1628]">
                  <th className="py-3 px-6">Target & Objective</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Pass / Fail</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2D42] text-sm">
                {filteredRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-6 max-w-sm">
                      <div className="font-mono text-xs text-blue-400 truncate">{run.displayUrl}</div>
                      <div className="text-xs text-slate-300 truncate mt-0.5">{run.objective}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300 whitespace-nowrap">
                      {formatModeLabel(run.mode)}
                    </td>
                    <td className="py-3.5 px-4">
                      <RunStatusText status={run.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                      <span className="text-emerald-400">{run.passedCases}</span>
                      <span className="text-slate-600"> / </span>
                      <span className="text-rose-400">{run.failedCases + run.errorCases}</span>
                      <span className="text-slate-500 ml-1.5">({run.passPercentage}%)</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
                      {formatDuration(run.executionDurationMs)}
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap">
                      {formatTimestamp(run.createdAt)}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => onOpenPlan(run.id)}
                          className="text-slate-300 hover:text-white transition-colors"
                        >
                          Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenExecution(run.id)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Execution
                        </button>
                        {(run.status === 'COMPLETED' || run.status === 'COMPLETED_WITH_FAILURES') && (
                          <button
                            type="button"
                            onClick={() => onOpenReport(run.id)}
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            Report
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteRun(run.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                          aria-label={`Delete run ${run.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCell({
  label,
  value,
  subtext,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: string;
}) {
  return (
    <div className="p-5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold font-mono tabular-nums ${accent}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500 truncate">{subtext}</div>
    </div>
  );
}
