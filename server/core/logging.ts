import { redactSensitiveText } from './security.ts';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  testCaseId?: string;
  stepIndex?: number;
}

export function createLogEntry(
  level: LogLevel,
  component: string,
  message: string,
  meta?: { testCaseId?: string; stepIndex?: number }
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    component,
    message: redactSensitiveText(message),
    testCaseId: meta?.testCaseId,
    stepIndex: meta?.stepIndex,
  };
}

export function logToConsole(entry: LogEntry): void {
  const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.component}]`;
  const context = entry.testCaseId ? ` (${entry.testCaseId}${entry.stepIndex !== undefined ? `#${entry.stepIndex}` : ''})` : '';
  if (entry.level === 'ERROR') {
    console.error(`${prefix}${context} ${entry.message}`);
  } else if (entry.level === 'WARN') {
    console.warn(`${prefix}${context} ${entry.message}`);
  } else {
    console.log(`${prefix}${context} ${entry.message}`);
  }
}
