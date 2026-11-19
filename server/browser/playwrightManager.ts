import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { getConfig } from '../core/config.ts';
import { isPrivateIp, resolveSandboxUrl } from '../core/security.ts';

export interface ManagedBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function createBrowserSession(options: {
  isBuiltinSandbox: boolean;
  allowLocalhostOverride?: boolean;
}): Promise<ManagedBrowserSession> {
  const cfg = getConfig();

  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  };

  if (cfg.playwrightExecutablePath) {
    launchOptions.executablePath = cfg.playwrightExecutablePath;
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    userAgent: 'SentinelQA-PlaywrightAgent/1.0 (Authorized Web Application Tester)',
  });

  // SSRF request guard for subresources and redirects
  const dnsSafeCache = new Map<string, boolean>();
  await context.route('**/*', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || reqUrl.startsWith('about:')) {
      return route.continue();
    }

    try {
      const parsed = new URL(reqUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return route.abort('blockedbyclient');
      }

      const sandboxCheck = resolveSandboxUrl(reqUrl);
      if (sandboxCheck.isSandbox) {
        return route.continue();
      }

      const host = parsed.hostname.toLowerCase();
      if (!options.isBuiltinSandbox && !(cfg.allowLocalhostTesting && options.allowLocalhostOverride)) {
        if (
          host === 'localhost' ||
          host === 'localhost.localdomain' ||
          host === '127.0.0.1' ||
          host === '::1' ||
          host === '169.254.169.254' ||
          host === 'metadata.google.internal' ||
          host.endsWith('.internal') ||
          host.endsWith('.local') ||
          isPrivateIp(host)
        ) {
          return route.abort('blockedbyclient');
        }

        // For document navigations/redirects, verify DNS does not resolve to private IP
        if (route.request().isNavigationRequest()) {
          let isSafe = dnsSafeCache.get(host);
          if (isSafe === undefined) {
            try {
              const dns = await import('node:dns/promises');
              const addrs = await dns.lookup(host, { all: true });
              isSafe = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
            } catch {
              isSafe = false;
            }
            dnsSafeCache.set(host, isSafe);
          }
          if (!isSafe) {
            return route.abort('blockedbyclient');
          }
        }
      }
      return route.continue();
    } catch {
      return route.abort('blockedbyclient');
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(cfg.stepTimeoutMs);
  page.setDefaultNavigationTimeout(Math.min(cfg.maxExecutionTimeoutMs, 25000));

  const close = async () => {
    try {
      await context.close();
    } catch {
      // ignore
    }
    try {
      await browser.close();
    } catch {
      // ignore
    }
  };

  return { browser, context, page, close };
}

export async function capturePageScreenshot(
  page: Page,
  runId: string,
  tag: string
): Promise<{ filename: string; fullPath: string }> {
  const cfg = getConfig();
  fs.mkdirSync(cfg.screenshotsDir, { recursive: true });
  const safeTag = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const unique = crypto.randomBytes(3).toString('hex');
  const filename = `${runId}_${safeTag}_${unique}.png`;
  const fullPath = path.join(cfg.screenshotsDir, filename);

  await page.screenshot({
    path: fullPath,
    fullPage: false,
    type: 'png',
    timeout: 8000,
  });

  return { filename, fullPath };
}
