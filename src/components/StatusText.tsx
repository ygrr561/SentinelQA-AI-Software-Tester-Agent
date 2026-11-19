import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  XCircle,
} from 'lucide-react';

export function formatDuration(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatModeLabel(mode: string): string {
  const map: Record<string, string> = {
    functional: 'Functional',
    ui: 'UI Verification',
    form_validation: 'Form Validation',
    navigation: 'Navigation',
    negative: 'Negative',
    exploratory: 'Exploratory',
  };
  return map[mode] || mode;
}

export function RunStatusText({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Completed
        </span>
      );
    case 'COMPLETED_WITH_FAILURES':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          Completed (Failures)
        </span>
      );
    case 'RUNNING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          Executing
        </span>
      );
    case 'PLANNING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          Planning
        </span>
      );
    case 'PLAN_APPROVED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Plan Approved
        </span>
      );
    case 'PLAN_READY':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
          <CircleDashed className="w-3.5 h-3.5 shrink-0" />
          Awaiting Review
        </span>
      );
    case 'ERROR':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Error
        </span>
      );
    default:
      return <span className="text-xs text-slate-400 whitespace-nowrap">{status}</span>;
  }
}

export function TestStatusText({ status }: { status: string }) {
  switch (status) {
    case 'PASSED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          PASSED
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          FAILED
        </span>
      );
    case 'ERROR':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ERROR
        </span>
      );
    case 'SKIPPED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 whitespace-nowrap">
          <MinusCircle className="w-3.5 h-3.5 shrink-0" />
          SKIPPED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
          <CircleDashed className="w-3.5 h-3.5 shrink-0" />
          {status}
        </span>
      );
  }
}

export function PriorityText({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    Critical: 'text-rose-400',
    High: 'text-amber-400',
    Medium: 'text-sky-400',
    Low: 'text-slate-400',
  };
  return (
    <span className={`text-xs font-medium whitespace-nowrap ${colorMap[priority] || 'text-slate-400'}`}>
      {priority}
    </span>
  );
}
