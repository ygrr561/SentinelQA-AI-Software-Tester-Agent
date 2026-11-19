import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Loader2,
  Play,
  ScanSearch,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import { api } from '../services/api';
import type { PageAnalysis, ProviderConfigResponse, TestMode } from '../types/testing';

interface NewTestRunPageProps {
  initialPreset?: { url: string; objective: string; mode: TestMode } | null;
  onPlanGenerated: (runId: string) => void;
  onPlanExecutedDirectly: (runId: string) => void;
}

const TEST_MODES: Array<{ id: TestMode; label: string; hint: string }> = [
  { id: 'functional', label: 'Functional', hint: 'Core positive & error user flows' },
  { id: 'ui', label: 'UI Testing', hint: 'Visibility, headings, and control states' },
  { id: 'form_validation', label: 'Form Validation', hint: 'Required fields, formats, boundaries' },
  { id: 'navigation', label: 'Navigation', hint: 'Tabs, links, URLs, and titles' },
  { id: 'negative', label: 'Negative', hint: 'Invalid inputs, rejection, edge cases' },
  { id: 'exploratory', label: 'Exploratory', hint: 'Balanced full-surface coverage' },
];

const QUICK_SCENARIOS: Array<{
  title: string;
  url: string;
  mode: TestMode;
  count: number;
  objective: string;
}> = [
  {
    title: 'Sandbox: Login Suite',
    url: '/sandbox-app',
    mode: 'functional',
    count: 6,
    objective:
      'Test the Northstar Portal Sign In workflow: valid demo login credentials, incorrect password rejection, empty email validation, empty password validation, submitting both fields empty, and sign out behavior.',
  },
  {
    title: 'Sandbox: Registration & Validation',
    url: '/sandbox-app',
    mode: 'form_validation',
    count: 6,
    objective:
      'Navigate to the Register tab and test creating an account with valid inputs, short password under 8 characters, mismatched confirm password, missing full name, invalid email, and unchecked Terms of Service.',
  },
  {
    title: 'Sandbox: Catalog Search & Tabs',
    url: '/sandbox-app',
    mode: 'navigation',
    count: 5,
    objective:
      'Verify switching across Sign In, Register, Catalog Search, and Support Docs tabs, updating page titles/URLs, and filtering the catalog by search keyword, category dropdown, and in-stock checkbox.',
  },
  {
    title: 'Sandbox: Seeded Defects Benchmark',
    url: '/sandbox-app?defects=true',
    mode: 'negative',
    count: 6,
    objective:
      'Run negative and validation scenarios against the defect-enabled sandbox: test empty password login rejection, registration mismatched password confirmation rejection, and searching Catalog Search for "Quantum".',
  },
];

export function NewTestRunPage({
  initialPreset,
  onPlanGenerated,
  onPlanExecutedDirectly,
}: NewTestRunPageProps) {
  const [url, setUrl] = useState(initialPreset?.url || '/sandbox-app');
  const [objective, setObjective] = useState(
    initialPreset?.objective || QUICK_SCENARIOS[0].objective
  );
  const [mode, setMode] = useState<TestMode>(initialPreset?.mode || 'functional');
  const [requestedCount, setRequestedCount] = useState<number>(6);
  const [providerConfig, setProviderConfig] = useState<ProviderConfigResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'openai_compatible'>('gemini');
  const [selectedModel, setSelectedModel] = useState('gemini-4-hydrogen');

  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [executingDirect, setExecutingDirect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProviderConfig()
      .then((cfg) => {
        setProviderConfig(cfg);
        setSelectedProvider(cfg.activeProvider);
        setSelectedModel(cfg.activeModel);
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  useEffect(() => {
    if (initialPreset) {
      setUrl(initialPreset.url);
      setObjective(initialPreset.objective);
      setMode(initialPreset.mode);
      setAnalysis(null);
    }
  }, [initialPreset]);

  const handleInspect = async () => {
    setError(null);
    setAnalyzing(true);
    try {
      const res = await api.analyzeUrl({ url });
      setAnalysis(res.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inspect target web page.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGeneratePlan = async (autoExecute: boolean) => {
    setError(null);
    if (!url.trim()) {
      setError('Enter a target web application URL.');
      return;
    }
    if (objective.trim().length < 5) {
      setError('Provide a clear testing objective (at least 5 characters).');
      return;
    }

    if (autoExecute) setExecutingDirect(true);
    else setGenerating(true);

    try {
      const { run } = await api.generateTestPlan({
        url: url.trim(),
        objective: objective.trim(),
        mode,
        requestedCount,
        provider: selectedProvider,
        model: selectedModel,
        existingAnalysis: analysis && analysis.url === url.trim() ? analysis : undefined,
      });

      if (autoExecute) {
        await api.approveTestPlan({ runId: run.id });
        await api.executeTestRun({ runId: run.id });
        onPlanExecutedDirectly(run.id);
      } else {
        onPlanGenerated(run.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate test plan.');
    } finally {
      setGenerating(false);
      setExecutingDirect(false);
    }
  };

  const activeProviderMeta = providerConfig?.providers.find((p) => p.id === selectedProvider);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">New Test Run</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect a live web application with Playwright, synthesize grounded test cases, and review or execute them immediately.
        </p>
      </div>

      {/* Quick Reproducible Scenarios */}
      <div className="bg-[#111827] border border-[#1F2D42] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="text-xs font-medium text-slate-300">
            Quick Authorized Sandbox Scenarios
          </div>
          <a
            href="/sandbox-app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            Preview Northstar Portal Target
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_SCENARIOS.map((sc) => (
            <button
              key={sc.title}
              type="button"
              onClick={() => {
                setUrl(sc.url);
                setMode(sc.mode);
                setRequestedCount(sc.count);
                setObjective(sc.objective);
                setAnalysis(null);
                setError(null);
              }}
              className="text-left p-3.5 rounded-lg bg-[#0B1120] border border-[#1F2D42] hover:border-blue-500/60 transition-colors"
            >
              <div className="text-xs font-semibold text-slate-200">{sc.title}</div>
              <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">{sc.url}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-sm text-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Configuration & Inspector Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Configuration Form */}
        <div className="lg:col-span-7 bg-[#111827] border border-[#1F2D42] rounded-xl p-6 space-y-6">
          {/* Target URL */}
          <div>
            <label htmlFor="target-url" className="block text-xs font-medium text-slate-300 mb-2">
              Target Web Application URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="target-url"
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setAnalysis(null);
                }}
                placeholder="https://example.com or /sandbox-app"
                className="flex-1 px-3.5 py-2.5 text-sm font-mono bg-[#0B1120] border border-[#1F2D42] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                disabled={analyzing || generating || executingDirect}
                onClick={handleInspect}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="w-3.5 h-3.5" />
                )}
                {analyzing ? 'Inspecting...' : 'Inspect Interface'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              SSRF protection active: private IPs & internal hosts blocked by default. Built-in /sandbox-app is pre-authorized.
            </p>
          </div>

          {/* Testing Mode Selection */}
          <div>
            <div className="text-xs font-medium text-slate-300 mb-2">Testing Mode</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEST_MODES.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-600/15 border-blue-500 text-white'
                        : 'bg-[#0B1120] border-[#1F2D42] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap">{m.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Testing Objective */}
          <div>
            <label htmlFor="testing-objective" className="block text-xs font-medium text-slate-300 mb-2">
              Testing Objective & Instructions
            </label>
            <textarea
              id="testing-objective"
              rows={4}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Describe the workflows, forms, validations, or edge cases the AI agent should test..."
              className="w-full px-3.5 py-2.5 text-sm bg-[#0B1120] border border-[#1F2D42] rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>

          {/* Test Case Count + Modular AI Provider */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="case-count" className="block text-xs font-medium text-slate-300 mb-1.5">
                Test Cases ({requestedCount})
              </label>
              <input
                id="case-count"
                type="number"
                min={2}
                max={12}
                value={requestedCount}
                onChange={(e) => setRequestedCount(Math.max(2, Math.min(12, Number(e.target.value) || 6)))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#0B1120] border border-[#1F2D42] rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="ai-provider" className="block text-xs font-medium text-slate-300 mb-1.5">
                AI Provider
              </label>
              <select
                id="ai-provider"
                value={selectedProvider}
                onChange={(e) => {
                  const next = e.target.value as 'gemini' | 'openai_compatible';
                  setSelectedProvider(next);
                  const found = providerConfig?.providers.find((p) => p.id === next);
                  if (found) setSelectedModel(found.defaultModel);
                }}
                className="w-full px-3 py-2 text-sm bg-[#0B1120] border border-[#1F2D42] rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                {(providerConfig?.providers || [
                  { id: 'gemini', name: 'Google Gemini', configured: true },
                ]).map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.configured}>
                    {p.name} {!p.configured ? '(Env key not set)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ai-model" className="block text-xs font-medium text-slate-300 mb-1.5">
                Model
              </label>
              <select
                id="ai-model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B1120] border border-[#1F2D42] rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                {(activeProviderMeta?.availableModels || ['gemini-4-hydrogen']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="pt-2 border-t border-[#1F2D42] flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={generating || executingDirect || analyzing}
              onClick={() => handleGeneratePlan(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              {generating ? 'Inspecting & Generating Plan...' : 'Generate Test Plan'}
            </button>

            <button
              type="button"
              disabled={generating || executingDirect || analyzing}
              onClick={() => handleGeneratePlan(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-[#162032] hover:bg-slate-800 border border-[#243247] rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {executingDirect ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {executingDirect ? 'Launching Playwright...' : 'Generate & Execute Tests'}
            </button>
          </div>
        </div>

        {/* Right: Live Playwright Interface Inspection Panel */}
        <div className="lg:col-span-5 bg-[#111827] border border-[#1F2D42] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Playwright Interface Inspector</h2>
            {analysis && (
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {analysis.analysisDurationMs}ms
              </span>
            )}
          </div>

          {!analysis && !analyzing && (
            <div className="py-12 px-4 text-center border border-dashed border-[#1F2D42] rounded-lg">
              <Eye className="w-6 h-6 text-slate-500 mx-auto mb-2.5" />
              <p className="text-sm text-slate-300 font-medium">No page snapshot yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Click "Inspect Interface" to open the target URL in headless Chromium and preview extracted accessible locators, forms, and inputs before planning.
              </p>
            </div>
          )}

          {analyzing && (
            <div className="py-14 text-center space-y-3">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
              <div className="text-sm text-slate-300">Launching headless Chromium via Playwright...</div>
              <div className="text-xs text-slate-500">Extracting accessible roles, labels, forms, and viewport screenshot</div>
            </div>
          )}

          {analysis && !analyzing && (
            <div className="space-y-4 text-xs">
              {analysis.initialScreenshotFile && (
                <div className="rounded-lg overflow-hidden border border-[#1F2D42] bg-[#0B1120]">
                  <img
                    src={`/api/screenshots/${analysis.initialScreenshotFile}`}
                    alt={`Playwright inspection capture of ${analysis.title}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-cover object-top"
                  />
                </div>
              )}

              <div>
                <div className="text-slate-400">Page Title</div>
                <div className="text-sm font-medium text-white mt-0.5">{analysis.title}</div>
                <div className="font-mono text-[11px] text-slate-500 mt-0.5 truncate">
                  {analysis.finalUrl}
                </div>
              </div>

              {analysis.warnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 space-y-1">
                  {analysis.warnings.map((w, idx) => (
                    <div key={idx}>{w}</div>
                  ))}
                </div>
              )}

              {/* Extracted counts */}
              <div className="grid grid-cols-4 gap-2 py-3 border-y border-[#1F2D42] font-mono tabular-nums">
                <div>
                  <div className="text-slate-500">Forms</div>
                  <div className="text-sm text-white font-semibold">{analysis.forms.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Inputs</div>
                  <div className="text-sm text-white font-semibold">{analysis.inputs.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Buttons</div>
                  <div className="text-sm text-white font-semibold">{analysis.buttons.length}</div>
                </div>
                <div>
                  <div className="text-slate-500">Links</div>
                  <div className="text-sm text-white font-semibold">{analysis.links.length}</div>
                </div>
              </div>

              {analysis.detectedFeatures.length > 0 && (
                <div>
                  <div className="text-slate-400 mb-1">Detected Interface Capabilities</div>
                  <div className="text-slate-200 leading-relaxed">
                    {analysis.detectedFeatures.join(' · ')}
                  </div>
                </div>
              )}

              {/* Sample Accessible Locators */}
              <div>
                <div className="text-slate-400 mb-1.5">Recommended Accessible Locators (Sample)</div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {[...analysis.inputs, ...analysis.buttons].slice(0, 10).map((el, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded bg-[#0B1120] border border-[#1F2D42]"
                    >
                      <span className="text-slate-200 truncate">{el.name || el.tag}</span>
                      <span className="font-mono text-[11px] text-blue-400 shrink-0">
                        {el.recommendedLocator.strategy}="{el.recommendedLocator.value}"
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
