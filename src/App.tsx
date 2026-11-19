import { useState } from 'react';
import { AppShell, type NavView } from './layouts/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { NewTestRunPage } from './pages/NewTestRunPage';
import { TestPlanPage } from './pages/TestPlanPage';
import { ExecutionPage } from './pages/ExecutionPage';
import { ReportsPage } from './pages/ReportsPage';
import { EvaluationPage } from './pages/EvaluationPage';
import type { TestMode } from './types/testing';

const BREADCRUMBS: Record<NavView, string> = {
  dashboard: 'Workspace / Dashboard',
  'new-run': 'Workspace / New Test Run',
  'test-plan': 'Workspace / Test Plan Review',
  execution: 'Workspace / Live Playwright Execution',
  reports: 'Workspace / Testing Reports',
  evaluation: 'Workspace / Sandbox & Evaluation Benchmarks',
};

export default function App() {
  const [activeView, setActiveView] = useState<NavView>('dashboard');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runPreset, setRunPreset] = useState<{
    url: string;
    objective: string;
    mode: TestMode;
  } | null>(null);

  const openNewRun = (preset?: { url: string; objective: string; mode: TestMode }) => {
    setRunPreset(preset || null);
    setActiveView('new-run');
  };

  const openPlan = (runId: string) => {
    setSelectedRunId(runId);
    setActiveView('test-plan');
  };

  const openExecution = (runId: string) => {
    setSelectedRunId(runId);
    setActiveView('execution');
  };

  const openReport = (runId: string) => {
    setSelectedRunId(runId);
    setActiveView('reports');
  };

  return (
    <AppShell
      activeView={activeView}
      onNavigate={(view) => {
        if (view === 'new-run') setRunPreset(null);
        setActiveView(view);
      }}
      breadcrumb={BREADCRUMBS[activeView]}
      activeRunId={selectedRunId}
    >
      {activeView === 'dashboard' && (
        <DashboardPage
          onNewRun={openNewRun}
          onOpenPlan={openPlan}
          onOpenExecution={openExecution}
          onOpenReport={openReport}
        />
      )}

      {activeView === 'new-run' && (
        <NewTestRunPage
          initialPreset={runPreset}
          onPlanGenerated={openPlan}
          onPlanExecutedDirectly={openExecution}
        />
      )}

      {activeView === 'test-plan' && (
        <TestPlanPage
          selectedRunId={selectedRunId}
          onSelectRunId={setSelectedRunId}
          onStartExecution={openExecution}
          onNewRun={() => openNewRun()}
        />
      )}

      {activeView === 'execution' && (
        <ExecutionPage
          selectedRunId={selectedRunId}
          onSelectRunId={setSelectedRunId}
          onOpenReport={openReport}
          onNewRun={() => openNewRun()}
        />
      )}

      {activeView === 'reports' && (
        <ReportsPage
          selectedRunId={selectedRunId}
          onSelectRunId={setSelectedRunId}
          onNewRun={() => openNewRun()}
        />
      )}

      {activeView === 'evaluation' && (
        <EvaluationPage
          onLaunchPreset={openNewRun}
          onOpenReport={openReport}
        />
      )}
    </AppShell>
  );
}
