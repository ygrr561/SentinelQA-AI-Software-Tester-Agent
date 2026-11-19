import { useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Plus,
  X,
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'new-run'
  | 'test-plan'
  | 'execution'
  | 'reports'
  | 'evaluation';

interface AppShellProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  breadcrumb: string;
  activeRunId?: string | null;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ id: NavView; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'new-run', label: 'New Test Run', icon: Plus },
  { id: 'test-plan', label: 'Test Plans', icon: ClipboardList },
  { id: 'execution', label: 'Live Execution', icon: Activity },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'evaluation', label: 'Sandbox & Benchmarks', icon: FlaskConical },
];

export function AppShell({
  activeView,
  onNavigate,
  breadcrumb,
  activeRunId,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSelect = (id: NavView) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-[#0B1120] text-[#E2E8F0]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0E1628] border-r border-[#1F2D42] z-30">
        <div className="h-16 px-6 flex items-center border-b border-[#1F2D42]">
          <button
            type="button"
            onClick={() => handleSelect('dashboard')}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            SentinelQA
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary Sidebar Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1F2D42] space-y-2 text-xs text-slate-400">
          {activeRunId && (
            <div className="pb-2 mb-2 border-b border-[#1F2D42]">
              <div className="text-slate-500 mb-0.5">Active Run</div>
              <div className="font-mono text-slate-300 truncate">{activeRunId}</div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Playwright Engine</span>
            <span className="font-mono text-slate-300">Chromium</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Persistence</span>
            <span className="font-mono text-slate-300">SQLite</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#0E1628] border-r border-[#1F2D42] flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-[#1F2D42]">
              <span className="text-lg font-bold tracking-tight text-white">SentinelQA</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-md"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600/15 text-blue-400'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Top Bar Contract: Breadcrumb left, 1 primary action right */}
        <header className="sticky top-0 z-20 h-16 bg-[#0B1120]/95 backdrop-blur-sm border-b border-[#1F2D42] px-4 sm:px-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-md"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-400 truncate">
              <BarChart3 className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
              <span className="truncate text-slate-200 font-medium">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('new-run')}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              New Test Run
            </button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
