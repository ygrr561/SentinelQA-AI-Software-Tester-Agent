import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import type { TestCase, TestRunDetail, TestRunSummary } from '../types/testing';
import {
  formatDuration,
  formatModeLabel,
  PriorityText,
  RunStatusText,
} from '../components/StatusText';

interface TestPlanPageProps {
  selectedRunId: string | null;
  onSelectRunId: (runId: string) => void;
  onStartExecution: (runId: string) => void;
  onNewRun: () => void;
}

export function TestPlanPage({
  selectedRunId,
  onSelectRunId,
  onStartExecution,
  onNewRun,
}: TestPlanPageProps) {
  const [runs, setRuns] = useState<TestRunSummary[]>([]);
  const [runDetail, setRunDetail] = useState<TestRunDetail | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTestRuns(40)
      .then((res) => {
        setRuns(res.runs);
        if (!selectedRunId && res.runs.length > 0) {
          onSelectRunId(res.runs[0].id);
        } else if (res.runs.length === 0) {
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load runs.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    api
      .getTestRun(selectedRunId)
      .then((res) => {
        setRunDetail(res.run);
        setApprovedIds(new Set(res.run.testCases.filter((tc) => tc.approved).map((tc) => tc.id)));
        setExpandedIds(new Set(res.run.testCases.slice(0, 2).map((tc) => tc.id)));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load test plan.');
      })
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  const toggleCaseApproval = (id: string) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveApproval = async () => {
    if (!runDetail) return;
    setApproving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.approveTestPlan({
        runId: runDetail.id,
        approvedCaseIds: Array.from(approvedIds),
      });
      setRunDetail(res.run);
      setNotice(`Test plan approved (${approvedIds.size} of ${runDetail.testCases.length} test cases selected).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve plan.');
    } finally {
      setApproving(false);
    }
  };

  const handleApproveAndExecute = async () => {
    if (!runDetail) return;
    if (approvedIds.size === 0) {
      setError('Select at least one test case to execute.');
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      await api.approveTestPlan({
        runId: runDetail.id,
        approvedCaseIds: Array.from(approvedIds),
      });
      await api.executeTestRun({ runId: runDetail.id });
      onStartExecution(runDetail.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Playwright execution.');
    } finally {
      setExecuting(false);
    }
  };

  if (!loading && runs.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-12 text-center">
        <h1 className="text-lg font-semibold text-white">No Generated Test Plans</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Generate a test plan from the New Test Run page to review steps, locators, and assertions before browser execution.
        </p>
        <button
          type="button"
          onClick={onNewRun}
          className="mt-5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          Create New Test Run
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Run Switcher */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Test Plan Review</h1>
          <p className="mt-1 text-sm text-slate-400">
            Review AI-synthesized test scenarios, accessible locators, and deterministic assertions before approving Playwright execution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedRunId || ''}
            onChange={(e) => onSelectRunId(e.target.value)}
            aria-label="Select test run"
            className="px-3 py-2 text-xs font-mono bg-[#111827] border border-[#1F2D42] rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 max-w-xs"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.displayUrl}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-sm text-emerald-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {loading || !runDetail ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-[#111827] border border-[#1F2D42] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Suite Summary Banner */}
          <section className="bg-[#111827] border border-[#1F2D42] rounded-xl p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-blue-400">{runDetail.displayUrl}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatModeLabel(runDetail.mode)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{runDetail.aiProvider}/{runDetail.aiModel}</span>
                  <span aria-hidden="true">·</span>
                  <RunStatusText status={runDetail.status} />
                </div>
                <h2 className="text-lg font-semibold text-white">
                  {runDetail.suite?.name || 'Generated Test Suite'}
                </h2>
                <p className="text-sm text-slate-400 max-w-3xl">
                  {runDetail.suite?.summary || runDetail.objective}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={approving || executing}
                  onClick={handleSaveApproval}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Approve Selection ({approvedIds.size}/{runDetail.testCases.length})
                </button>
                <button
                  type="button"
                  disabled={executing || approvedIds.size === 0}
                  onClick={handleApproveAndExecute}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Execute Approved Plan
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-[#1F2D42] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                <span>Generated in {formatDuration(runDetail.planGenerationMs)}</span>
                <span aria-hidden="true">·</span>
                <span>{runDetail.testCases.length} test cases</span>
                <span aria-hidden="true">·</span>
                <span>
                  {runDetail.testCases.reduce((sum, c) => sum + c.steps.length, 0)} allowlisted Playwright steps
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setApprovedIds(new Set(runDetail.testCases.map((tc) => tc.id)))}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setApprovedIds(new Set())}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIds(
                      expandedIds.size === runDetail.testCases.length
                        ? new Set()
                        : new Set(runDetail.testCases.map((tc) => tc.id))
                    )
                  }
                  className="text-slate-400 hover:text-slate-200"
                >
                  {expandedIds.size === runDetail.testCases.length ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>
          </section>

          {/* Structured Test Case List */}
          <div className="space-y-3">
            {runDetail.testCases.map((tc) => (
              <TestCasePlanCard
                key={tc.id}
                testCase={tc}
                selected={approvedIds.has(tc.id)}
                expanded={expandedIds.has(tc.id)}
                onToggleSelect={() => toggleCaseApproval(tc.id)}
                onToggleExpand={() => toggleExpand(tc.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TestCasePlanCard({
  testCase,
  selected,
  expanded,
  onToggleSelect,
  onToggleExpand,
}: {
  testCase: TestCase;
  selected: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <article
      className={`bg-[#111827] border rounded-xl transition-colors ${
        selected ? 'border-[#1F2D42]' : 'border-[#1F2D42]/60 opacity-65'
      }`}
    >
      <div className="px-5 py-4 flex items-start gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Approve ${testCase.id}: ${testCase.name}`}
          className="mt-1 h-4 w-4 rounded border-slate-600 bg-[#0B1120] text-blue-600 focus:ring-blue-500 cursor-pointer"
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-mono font-semibold text-blue-400">{testCase.id}</span>
            <span aria-hidden="true">·</span>
            <PriorityText priority={testCase.priority} />
            <span aria-hidden="true">·</span>
            <span>{testCase.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{testCase.steps.length} steps</span>
          </div>

          <button
            type="button"
            onClick={onToggleExpand}
            className="mt-1 text-left flex items-center gap-2 group w-full"
          >
            <span className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
              {testCase.name}
            </span>
          </button>

          <p className="mt-1 text-xs text-slate-400">{testCase.objective}</p>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          className="p-1.5 text-slate-400 hover:text-white rounded-md shrink-0"
          aria-label={expanded ? 'Collapse steps' : 'Expand steps'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-3 border-t border-[#1F2D42] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-500 font-medium mb-1">Preconditions</div>
              {testCase.preconditions.length === 0 ? (
                <div className="text-slate-400">Default initial page state</div>
              ) : (
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {testCase.preconditions.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-slate-500 font-medium mb-1">Expected Result</div>
              <div className="text-slate-200">{testCase.expectedResult}</div>
            </div>
          </div>

          <div className="overflow-x-auto border border-[#1F2D42] rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0B1120] border-b border-[#1F2D42] text-slate-400">
                  <th className="py-2 px-3 w-10">#</th>
                  <th className="py-2 px-3 w-36">Action</th>
                  <th className="py-2 px-3">Step Description</th>
                  <th className="py-2 px-3">Accessible Locator</th>
                  <th className="py-2 px-3">Value / Expected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2D42]">
                {testCase.steps.map((step) => (
                  <tr key={step.stepNumber} className="bg-[#0E1628]/50">
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                      {step.stepNumber}
                    </td>
                    <td className="py-2 px-3 font-mono text-blue-300 whitespace-nowrap">
                      {step.action}
                    </td>
                    <td className="py-2 px-3 text-slate-200">{step.description}</td>
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {step.locator
                        ? step.locator.strategy === 'role'
                          ? `role=${step.locator.role || 'button'}[name="${step.locator.value}"]`
                          : `${step.locator.strategy}="${step.locator.value}"`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">
                      {step.expected || step.value || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}
