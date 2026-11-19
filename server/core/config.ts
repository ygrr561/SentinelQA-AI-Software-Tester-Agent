import path from 'node:path';
import fs from 'node:fs';

export type AIProviderId = 'gemini' | 'openai_compatible';

export interface AppConfig {
  port: number;
  appUrl: string;
  aiProvider: AIProviderId;
  aiModel: string;
  geminiApiKey: string | undefined;
  openaiApiKey: string | undefined;
  openaiBaseUrl: string;
  openaiModel: string;
  playwrightExecutablePath: string | undefined;
  maxExecutionTimeoutMs: number;
  stepTimeoutMs: number;
  allowLocalhostTesting: boolean;
  allowedTargetDomains: string[];
  sqliteDbPath: string;
  screenshotsDir: string;
}

function detectPlaywrightChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_EXECUTABLE_PATH)) {
    return process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  }

  const candidates = [
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback scan inside PLAYWRIGHT_BROWSERS_PATH if set
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright';
  if (fs.existsSync(browsersPath)) {
    try {
      const entries = fs.readdirSync(browsersPath);
      for (const entry of entries) {
        if (entry.startsWith('chromium')) {
          const headlessPath = path.join(browsersPath, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
          if (fs.existsSync(headlessPath)) return headlessPath;
          const chromePath = path.join(browsersPath, entry, 'chrome-linux', 'chrome');
          if (fs.existsSync(chromePath)) return chromePath;
        }
      }
    } catch {
      // Ignore scan errors
    }
  }

  return undefined;
}

export function getConfig(): AppConfig {
  const providerRaw = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const aiProvider: AIProviderId =
    providerRaw === 'openai_compatible' ? 'openai_compatible' : 'gemini';

  const allowedDomains = (process.env.ALLOWED_TARGET_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const dbPath = path.resolve(process.cwd(), process.env.SQLITE_DB_PATH || 'data/sentinelqa.db');
  const screenshotsDir = path.resolve(process.cwd(), process.env.SCREENSHOTS_DIR || 'data/screenshots');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  return {
    port: Number(process.env.PORT || 3000),
    appUrl: process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
    aiProvider,
    aiModel: process.env.AI_MODEL || 'gemini-4-hydrogen',
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    playwrightExecutablePath: detectPlaywrightChromium(),
    maxExecutionTimeoutMs: Math.min(Number(process.env.MAX_EXECUTION_TIMEOUT_MS || 90000), 180000),
    stepTimeoutMs: Math.min(Number(process.env.STEP_TIMEOUT_MS || 8000), 20000),
    allowLocalhostTesting: process.env.ALLOW_LOCALHOST_TESTING === 'true',
    allowedTargetDomains: allowedDomains,
    sqliteDbPath: dbPath,
    screenshotsDir,
  };
}

export interface ProviderMetadata {
  id: AIProviderId;
  name: string;
  defaultModel: string;
  availableModels: string[];
  configured: boolean;
}

export function getAvailableProviders(): ProviderMetadata[] {
  const cfg = getConfig();
  return [
    {
      id: 'gemini',
      name: 'Google Gemini',
      defaultModel: 'gemini-4-hydrogen',
      availableModels: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
      configured: Boolean(cfg.geminiApiKey && cfg.geminiApiKey !== 'MY_GEMINI_API_KEY'),
    },
    {
      id: 'openai_compatible',
      name: 'OpenAI-Compatible Endpoint',
      defaultModel: cfg.openaiModel,
      availableModels: [cfg.openaiModel],
      configured: Boolean(cfg.openaiApiKey),
    },
  ];
}
