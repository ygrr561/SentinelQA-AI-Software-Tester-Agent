import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Play,
  Terminal,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  LogEntry,
  TestCaseExecutionRecord,
  TestRunDetail,
  TestRunSummary,
} from '../types/testing';
import {
  formatDuration,
  formatTimestamp,
  PriorityText,
  RunStatusText,
  TestStatusText,
} from '../components/StatusText';

interface ExecutionPageProps {
  selectedRunId: string | null;
  onSelectRunId: (runId: string) => void;
  onOpenReport: (runId: string) => void;
  onNewRun: () => void;
}

export function ExecutionPage({
  selectedRunId,
  onSelectRunId,
  onOpenReport,
  onNewRun,
}: ExecutionPageProps) {
  const [runs, setRuns] = useState<TestRunSummary[]>([]);
  const [runDetail, setRunDetail] = useState<TestRunDetail | null>(null);
  const [results, setResults] = useState<TestCaseExecutionRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentCaseLabel, setCurrentCaseLabel] = useState<string | null>(null);
  const [currentStepLabel, setCurrentStepLabel] = useState<string | null>(null);
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const loadRunState = async (runId: string) => {
    try {
      const data = await api.getTestRunResults(runId);
      setRunDetail(data.run);
      setResults(data.results);
      setLogs(data.logs);
      setIsExecuting(data.executing || data.run.status === 'RUNNING');
      // Auto-expand failed cases for immediate visibility
      const failedIds = data.results
        .filter((r) => r.status === 'FAILED' || r.status === 'ERROR')
        .map((r) => r.testCaseId);
      if (failedIds.length > 0) {
        setExpandedCases((prev) => new Set([...prev, ...failedIds]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution results.');
    } finally {
      setLoading(false);
    }
  };

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
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    setError(null);
    setCurrentCaseLabel(null);
    setCurrentStepLabel(null);
    loadRunState(selectedRunId);

    const es = new EventSource(`/api/test-runs/${encodeURIComponent(selectedRunId)}/stream`);

    es.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'snapshot') {
          setIsExecuting(Boolean(msg.executing));
        } else if (msg.type === 'run_started') {
          setIsExecuting(true);
          setResults([]);
          setLogs([]);
          setCurrentCaseLabel('Initializing Playwright Chromium session...');
        } else if (msg.type === 'case_started') {
          setIsExecuting(true);
          setCurrentCaseLabel(`${msg.payload.testCaseId}: ${msg.payload.testCaseName}`);
          setCurrentStepLabel(`Preparing browser context (0 / ${msg.payload.totalSteps} steps)`);
        } else if (msg.type === 'step_completed') {
          const step = msg.payload.step;
          setCurrentStepLabel(
            `Step ${step.stepNumber}/${msg.payload.totalSteps}: [${step.action}] ${step.description} → ${step.status}`
          );
        } else if (msg.type === 'case_completed') {
          const res = msg.payload.result as TestCaseExecutionRecord;
          setResults((prev) => {
            const filtered = prev.filter((r) => r.testCaseId !== res.testCaseId);
            return [...filtered, res];
          });
          if (res.status === 'FAILED' || res.status === 'ERROR') {
            setExpandedCases((prev) => new Set([...prev, res.testCaseId]));
          }
        } else if (msg.type === 'log') {
          const entry = msg.payload as LogEntry;
          setLogs((prev) => [...prev, entry]);
        } else if (msg.type === 'run_completed') {
          setIsExecuting(false);
          setCurrentCaseLabel(null);
          setCurrentStepLabel(null);
          loadRunState(selectedRunId);
        } else if (msg.type === 'run_error') {
          setIsExecuting(false);
          setError(String(msg.payload?.message || 'Execution encountered an error.'));
          loadRunState(selectedRunId);
        }
      } catch {
        // ignore malformed keepalive
      }
    };

    return () => {
      es.close();
    };
  }, [selectedRunId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs.length]);

  const handleTriggerRun = async () => {
    if (!selectedRunId) return;
    setRestarting(true);
    setError(null);
    try {
      await api.executeTestRun({ runId: selectedRunId });
      setIsExecuting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute test run.');
    } finally {
      setRestarting(false);
    }
  };

  const toggleExpand = (caseId: string) => {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  if (!loading && runs.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-12 text-center">
        <h1 className="text-lg font-semibold text-white">No Test Executions Yet</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Create a test run and approve a generated test plan to watch Playwright execute it live.
        </p>
        <button
          type="button"
          onClick={onNewRun}
          className="mt-5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          New Test Run
        </button>
      </div>
    );
  }

  const totalCases = runDetail?.testCases.length || 0;
  const completedCount = results.length;
  const progressPct = totalCases > 0 ? Math.min(100, Math.round((completedCount / totalCases) * 100)) : 0;
  const passedCount = results.filter((r) => r.status === 'PASSED').length;
  const failedCount = results.filter((r) => r.status === 'FAILED' || r.status === 'ERROR').length;
  const skippedCount = results.filter((r) => r.status === 'SKIPPED').length;

  const screenshots = results
    .filter((r) => r.screenshotFile)
    .map((r) => ({
      id: r.testCaseId,
      url: `/api/screenshots/${r.screenshotFile}`,
      caption: `${r.testCaseId} (${r.status}) — ${r.testCaseName}`,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Live Playwright Execution</h1>
          <p className="mt-1 text-sm text-slate-400">
            Real-time Chromium execution stream, deterministic assertion verification, screenshot captures, and root-cause analysis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedRunId || ''}
            onChange={(e) => onSelectRunId(e.target.value)}
            aria-label="Select execution run"
            className="px-3 py-2 text-xs font-mono bg-[#111827] border border-[#1F2D42] rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 max-w-xs"
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.displayUrl}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isExecuting || restarting || !selectedRunId}
            onClick={handleTriggerRun}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isExecuting || restarting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {results.length > 0 ? 'Re-Run Tests' : 'Run Tests'}
          </button>

          {runDetail && !isExecuting && results.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenReport(runDetail.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              View Report
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Progress & Live Status Bar */}
      {runDetail && (
        <section className="bg-[#111827] border border-[#1F2D42] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <RunStatusText status={isExecuting ? 'RUNNING' : runDetail.status} />
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono text-blue-400">{runDetail.displayUrl}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {completedCount} / {totalCases} cases completed
                </span>
              </div>
              {currentCaseLabel && (
                <div className="text-sm font-medium text-white">{currentCaseLabel}</div>
              )}
              {currentStepLabel && (
                <div className="text-xs font-mono text-slate-400">{currentStepLabel}</div>
              )}
            </div>

            <div className="flex items-center gap-5 font-mono tabular-nums text-xs shrink-0">
              <div>
                <span className="text-slate-500">Passed </span>
                <span className="text-emerald-400 font-semibold">{passedCount}</span>
              </div>
              <div>
                <span className="text-slate-500">Failed </span>
                <span className="text-rose-400 font-semibold">{failedCount}</span>
              </div>
              <div>
                <span className="text-slate-500">Skipped </span>
                <span className="text-amber-400 font-semibold">{skippedCount}</span>
              </div>
              <div>
                <span className="text-slate-500">Duration </span>
                <span className="text-slate-200">{formatDuration(runDetail.executionDurationMs)}</span>
              </div>
            </div>
          </div>

          <div className="h-2 bg-[#0B1120] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                failedCount > 0 ? 'bg-rose-500' : 'bg-blue-500'
              }`}
              style={{ width: `${isExecuting && progressPct < 8 ? 8 : progressPct}%` }}
            />
          </div>
        </section>
      )}

      {/* Main Split: Test Results (Left) + Live Logs & Screenshots (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Test Case Results */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Test Case Results</h2>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {results.length} recorded
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-[#111827] border border-[#1F2D42] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-10 text-center">
              {isExecuting ? (
                <div className="space-y-2">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
                  <p className="text-sm text-slate-300">Playwright is executing test case 1...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-300">This test plan has not been executed yet.</p>
                  <button
                    type="button"
                    onClick={handleTriggerRun}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Playwright Execution
                  </button>
                </div>
              )}
            </div>
          ) : (
            results.map((res) => {
              const expanded = expandedCases.has(res.testCaseId);
              return (
                <article
                  key={res.testCaseId}
                  className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(res.testCaseId)}
                    className="w-full px-5 py-4 text-left flex items-start justify-between gap-4 hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <TestStatusText status={res.status} />
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono text-blue-400">{res.testCaseId}</span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <PriorityText priority={res.priority} />
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {formatDuration(res.durationMs)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">{res.testCaseName}</div>
                      <div className="mt-1 text-xs text-slate-400 line-clamp-2">{res.actualResult}</div>
                    </div>
                    <div className="text-slate-400 mt-1 shrink-0">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-5 pt-3 border-t border-[#1F2D42] space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1F2D42]">
                          <div className="text-slate-500 mb-1">Expected Result</div>
                          <div className="text-slate-200">{res.expectedResult}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1F2D42]">
                          <div className="text-slate-500 mb-1">Actual Result ({res.validationMethod})</div>
                          <div className="text-slate-200">{res.actualResult}</div>
                        </div>
                      </div>

                      {/* AI Failure Analysis Block */}
                      {res.failureAnalysis && (
                        <div className="p-4 rounded-lg bg-rose-950/25 border border-rose-800/50 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-rose-300">
                              Root-Cause Failure Analysis
                            </span>
                            <span className="font-mono text-[11px] text-rose-300">
                              {res.failureAnalysis.failureCategory} · Confidence: {res.failureAnalysis.confidence} ·{' '}
                              {res.failureAnalysis.isApplicationBugLikely
                                ? 'Likely Application Defect'
                                : 'Likely Test / Environment Issue'}
                            </span>
                          </div>
                          <div className="text-slate-100 font-medium">
                            {res.failureAnalysis.likelyCause}
                          </div>
                          <p className="text-slate-300 leading-relaxed">
                            {res.failureAnalysis.explanation}
                          </p>
                          <div className="pt-1.5 border-t border-rose-800/40 text-slate-300">
                            <span className="text-rose-300 font-medium">Suggested Investigation: </span>
                            {res.failureAnalysis.suggestedInvestigation}
                          </div>
                        </div>
                      )}

                      {/* Step Trace Table */}
                      {res.steps.length > 0 && (
                        <div className="overflow-x-auto border border-[#1F2D42] rounded-lg">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#0B1120] border-b border-[#1F2D42] text-slate-400">
                                <th className="py-2 px-2.5 w-8">#</th>
                                <th className="py-2 px-2.5">Step</th>
                                <th className="py-2 px-2.5">Status</th>
                                <th className="py-2 px-2.5 text-right">Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1F2D42]">
                              {res.steps.map((st) => (
                                <tr key={st.stepNumber}>
                                  <td className="py-2 px-2.5 font-mono text-slate-500">
                                    {st.stepNumber}
                                  </td>
                                  <td className="py-2 px-2.5">
                                    <div className="text-slate-200">
                                      <span className="font-mono text-blue-300 mr-1.5">[{st.action}]</span>
                                      {st.description}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                      {st.actualResult}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2.5">
                                    <TestStatusText status={st.status} />
                                  </td>
                                  <td className="py-2 px-2.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                    {formatDuration(st.durationMs)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {res.screenshotFile && (
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: `/api/screenshots/${res.screenshotFile}`,
                                caption: `${res.testCaseId} (${res.status}) — ${res.testCaseName}`,
                              })
                            }
                            className="block w-full rounded-lg overflow-hidden border border-[#1F2D42] hover:border-blue-500 transition-colors"
                          >
                            <img
                              src={`/api/screenshots/${res.screenshotFile}`}
                              alt={`Screenshot evidence for ${res.testCaseId}`}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-60 object-cover object-top"
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Right Column: Live Execution Logs & Screenshot Gallery */}
        <div className="lg:col-span-5 space-y-6">
          {/* Execution Logs */}
          <section className="bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1F2D42] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                Execution Logs
              </div>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {logs.length} entries
              </span>
            </div>
            <div
              ref={logContainerRef}
              className="p-3.5 bg-[#090E1A] h-80 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1.5"
            >
              {logs.length === 0 ? (
                <div className="text-slate-500 py-8 text-center">
                  Logs will stream here during Playwright execution.
                </div>
              ) : (
                logs.map((entry, idx) => (
                  <div key={idx} className="break-words">
                    <span className="text-slate-600">{formatTimestamp(entry.timestamp)} </span>
                    <span
                      className={
                        entry.level === 'ERROR'
                          ? 'text-rose-400 font-semibold'
                          : entry.level === 'WARN'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }
                    >
                      [{entry.level}]
                    </span>{' '}
                    <span className="text-slate-500">[{entry.component}]</span>{' '}
                    <span className="text-slate-200">{entry.message}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Screenshot Evidence Gallery */}
          <section className="bg-[#111827] border border-[#1F2D42] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Camera className="w-3.5 h-3.5 text-slate-400" />
                Captured Screenshots
              </div>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {screenshots.length} images
              </span>
            </div>

            {screenshots.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-[#1F2D42] rounded-lg">
                Playwright PNG captures will appear here as each test completes.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {screenshots.map((shot) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => setLightboxImage({ url: shot.url, caption: shot.caption })}
                    className="text-left rounded-lg overflow-hidden border border-[#1F2D42] hover:border-blue-500 transition-colors bg-[#0B1120]"
                  >
                    <img
                      src={shot.url}
                      alt={shot.caption}
                      referrerPolicy="no-referrer"
                      className="w-full h-24 object-cover object-top"
                    />
                    <div className="p-2 text-[11px] text-slate-300 truncate">{shot.caption}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Screenshot Full-Size Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="max-w-5xl w-full bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#1F2D42] flex items-center justify-between gap-4">
              <div className="text-xs font-medium text-slate-200 truncate">{lightboxImage.caption}</div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
                aria-label="Close screenshot preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-[#090E1A] max-h-[80vh] overflow-auto">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.caption}
                referrerPolicy="no-referrer"
                className="w-full h-auto rounded border border-[#1F2D42]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
