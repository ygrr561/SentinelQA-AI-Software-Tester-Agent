import { useEffect, useState } from 'react';
import { Download, FileJson, Loader2, X } from 'lucide-react';
import { api } from '../services/api';
import type { StructuredReport, TestRunSummary } from '../types/testing';
import { downloadReportAsJson, downloadReportAsPdf } from '../utils/exportReport';
import {
  formatDuration,
  formatModeLabel,
  formatTimestamp,
  PriorityText,
  TestStatusText,
} from '../components/StatusText';

interface ReportsPageProps {
  selectedRunId: string | null;
  onSelectRunId: (runId: string) => void;
  onNewRun: () => void;
}

export function ReportsPage({ selectedRunId, onSelectRunId, onNewRun }: ReportsPageProps) {
  const [runs, setRuns] = useState<TestRunSummary[]>([]);
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'FAILED' | 'SKIPPED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  useEffect(() => {
    api
      .listTestRuns(40)
      .then((res) => {
        const completed = res.runs.filter(
          (r) =>
            r.status === 'COMPLETED' ||
            r.status === 'COMPLETED_WITH_FAILURES' ||
            r.passedCases + r.failedCases + r.errorCases + r.skippedCases > 0
        );
        setRuns(completed.length > 0 ? completed : res.runs);
        const targetId =
          selectedRunId && res.runs.some((r) => r.id === selectedRunId)
            ? selectedRunId
            : completed[0]?.id || res.runs[0]?.id;
        if (targetId) {
          onSelectRunId(targetId);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load reports.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    setLoading(true);
    setError(null);
    api
      .getReport(selectedRunId)
      .then((res) => setReport(res.report))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load report.'))
      .finally(() => setLoading(false));
  }, [selectedRunId]);

  const handleExportPdf = async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      await downloadReportAsPdf(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (!loading && runs.length === 0) {
    return (
      <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-12 text-center">
        <h1 className="text-lg font-semibold text-white">No Test Reports Available</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Complete a Playwright test run to generate a structured QA report with screenshot evidence and PDF/JSON exports.
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

  const visibleCases = (report?.testCases || []).filter((tc) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'FAILED') return tc.status === 'FAILED' || tc.status === 'ERROR';
    return tc.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header & Exports */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Testing Reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Audit deterministic test outcomes, screenshot evidence, failure root causes, and export formal QA deliverables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedRunId || ''}
            onChange={(e) => onSelectRunId(e.target.value)}
            aria-label="Select report run"
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
            disabled={!report}
            onClick={() => report && downloadReportAsJson(report)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <FileJson className="w-3.5 h-3.5" />
            Export JSON
          </button>

          <button
            type="button"
            disabled={!report || exportingPdf}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-[#111827] border border-[#1F2D42] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Report Metadata */}
          <section className="bg-[#111827] border border-[#1F2D42] rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                  <span className="text-blue-400">{report.reportId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatTimestamp(report.generatedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatModeLabel(report.configuration.mode)}</span>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  {report.configuration.suiteName}
                </h2>
                <div className="mt-1 text-xs font-mono text-slate-400">
                  Target: {report.targetApplication.url} ({report.targetApplication.pageTitle})
                </div>
                <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                  {report.configuration.objective}
                </p>
              </div>
              <div className="text-xs font-mono text-slate-400 text-left md:text-right shrink-0">
                <div>AI Model: {report.configuration.aiProvider}/{report.configuration.aiModel}</div>
                <div className="mt-1">Plan Gen: {formatDuration(report.summary.planGenerationMs)}</div>
              </div>
            </div>

            {/* 6-Metric Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-t border-[#1F2D42] pt-5 gap-4 font-mono tabular-nums">
              <div>
                <div className="text-xs font-sans text-slate-400">Total Cases</div>
                <div className="text-xl font-semibold text-white mt-1">{report.summary.totalTests}</div>
              </div>
              <div>
                <div className="text-xs font-sans text-slate-400">Passed</div>
                <div className="text-xl font-semibold text-emerald-400 mt-1">{report.summary.passedTests}</div>
              </div>
              <div>
                <div className="text-xs font-sans text-slate-400">Failed / Errors</div>
                <div className="text-xl font-semibold text-rose-400 mt-1">
                  {report.summary.failedTests + report.summary.executionErrors}
                </div>
              </div>
              <div>
                <div className="text-xs font-sans text-slate-400">Skipped</div>
                <div className="text-xl font-semibold text-amber-400 mt-1">{report.summary.skippedTests}</div>
              </div>
              <div>
                <div className="text-xs font-sans text-slate-400">Pass Rate</div>
                <div className="text-xl font-semibold text-blue-400 mt-1">{report.summary.passPercentage}%</div>
              </div>
              <div>
                <div className="text-xs font-sans text-slate-400">Execution Time</div>
                <div className="text-xl font-semibold text-slate-200 mt-1">
                  {formatDuration(report.summary.totalExecutionDurationMs)}
                </div>
              </div>
            </div>
          </section>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-white">Detailed Test Case Breakdown</h3>
            <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2D42] rounded-lg">
              {(['ALL', 'PASSED', 'FAILED', 'SKIPPED'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab ? 'bg-[#1E293B] text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Test Case Report Cards */}
          {visibleCases.length === 0 ? (
            <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-10 text-center text-sm text-slate-400">
              No test cases match the selected status filter.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleCases.map((tc) => (
                <article
                  key={tc.testId}
                  className="bg-[#111827] border border-[#1F2D42] rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <TestStatusText status={tc.status} />
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono text-blue-400">{tc.testId}</span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <PriorityText priority={tc.priority} />
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400">{tc.category}</span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {formatDuration(tc.durationMs)}
                        </span>
                      </div>
                      <h4 className="mt-1 text-base font-semibold text-white">{tc.name}</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                    <div className={tc.screenshotUrl ? 'lg:col-span-8 space-y-3' : 'lg:col-span-12 space-y-3'}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1F2D42]">
                          <div className="text-slate-500 mb-1">Expected Result</div>
                          <div className="text-slate-200">{tc.expectedResult}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-[#0B1120] border border-[#1F2D42]">
                          <div className="text-slate-500 mb-1">Actual Result ({tc.validationMethod})</div>
                          <div className="text-slate-200">{tc.actualResult}</div>
                        </div>
                      </div>

                      {tc.failureAnalysis && (
                        <div className="p-4 rounded-lg bg-rose-950/25 border border-rose-800/50 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-rose-300">
                              Failure Analysis ({tc.failureAnalysis.failureCategory})
                            </span>
                            <span className="font-mono text-[11px] text-rose-300">
                              {tc.failureAnalysis.isApplicationBugLikely
                                ? 'Application Defect Likely'
                                : 'Test / Locator / Env Issue'} · Confidence: {tc.failureAnalysis.confidence}
                            </span>
                          </div>
                          <div className="text-slate-100 font-medium">{tc.failureAnalysis.likelyCause}</div>
                          <p className="text-slate-300 leading-relaxed">{tc.failureAnalysis.explanation}</p>
                          <div className="text-slate-300 pt-1">
                            <span className="text-rose-300 font-medium">Recommended Next Step: </span>
                            {tc.failureAnalysis.suggestedInvestigation}
                          </div>
                        </div>
                      )}
                    </div>

                    {tc.screenshotUrl && (
                      <div className="lg:col-span-4">
                        <button
                          type="button"
                          onClick={() =>
                            setLightbox({
                              url: tc.screenshotUrl!,
                              caption: `${tc.testId} (${tc.status}) — ${tc.name}`,
                            })
                          }
                          className="w-full rounded-lg overflow-hidden border border-[#1F2D42] hover:border-blue-500 transition-colors bg-[#0B1120]"
                        >
                          <img
                            src={tc.screenshotUrl}
                            alt={`Screenshot evidence for ${tc.testId}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-44 object-cover object-top"
                          />
                          <div className="px-3 py-1.5 text-[11px] text-slate-400 text-left">
                            Click to inspect full screenshot
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setLightbox(null)}
        >
          <div
            className="max-w-5xl w-full bg-[#111827] border border-[#1F2D42] rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#1F2D42] flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">{lightbox.caption}</span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-[#090E1A] max-h-[80vh] overflow-auto">
              <img
                src={lightbox.url}
                alt={lightbox.caption}
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
