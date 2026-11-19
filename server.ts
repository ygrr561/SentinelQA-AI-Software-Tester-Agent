import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { getConfig } from './server/core/config.ts';
import { getDb } from './server/database/database.ts';
import { createApiRouter } from './server/api/routes.ts';

async function startServer() {
  const cfg = getConfig();
  // Ensure SQLite database and schema are initialized on boot
  getDb();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Mount REST API and built-in /sandbox-app target
  app.use(createApiRouter());

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(cfg.port, '0.0.0.0', () => {
    console.log(
      `[SentinelQA] Server listening on http://0.0.0.0:${cfg.port} (Playwright Chromium: ${
        cfg.playwrightExecutablePath || 'bundled default'
      })`
    );
  });
}

startServer().catch((err) => {
  console.error('[SentinelQA] Fatal boot error:', err);
  process.exit(1);
});
