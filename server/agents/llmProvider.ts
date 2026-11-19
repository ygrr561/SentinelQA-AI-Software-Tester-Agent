import fs from 'node:fs';
import { GoogleGenAI, type Schema } from '@google/genai';
import { getConfig, type AIProviderId } from '../core/config.ts';

export interface StructuredLlmRequest {
  provider?: AIProviderId;
  model?: string;
  systemInstruction: string;
  prompt: string;
  responseSchema?: Schema;
  imagePath?: string;
}

export interface StructuredLlmResponse {
  text: string;
  provider: AIProviderId;
  model: string;
}

function createGeminiClient(): GoogleGenAI {
  const cfg = getConfig();
  if (!cfg.geminiApiKey || cfg.geminiApiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure your Gemini API key in Settings > Secrets to enable AI test planning and failure analysis.'
    );
  }

  return new GoogleGenAI({
    apiKey: cfg.geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetries<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Do not retry auth or invalid argument errors
      if (/API_KEY_INVALID|PERMISSION_DENIED|NOT_FOUND|400|401|403|404/i.test(msg)) {
        throw err;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
  }
  throw lastErr;
}

/**
 * Modular LLM gateway supporting Google Gemini (default) and OpenAI-compatible providers.
 * Always executes server-side and returns raw JSON text for Zod validation.
 */
export async function generateStructuredJson(
  req: StructuredLlmRequest
): Promise<StructuredLlmResponse> {
  const cfg = getConfig();
  const provider = req.provider || cfg.aiProvider;

  if (provider === 'openai_compatible') {
    if (!cfg.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set for the openai_compatible provider.');
    }
    const model = req.model || cfg.openaiModel;
    const response = await withRetries(async () => {
      const res = await fetch(`${cfg.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: req.systemInstruction },
            { role: 'user', content: req.prompt },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenAI-compatible provider returned HTTP ${res.status}: ${body.slice(0, 240)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content || '';
    });

    return { text: response.trim(), provider, model };
  }

  // Default: Google Gemini via @google/genai SDK
  const model = req.model || cfg.aiModel || 'gemini-4-hydrogen';
  const ai = createGeminiClient();

  const text = await withRetries(async () => {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (req.imagePath && fs.existsSync(req.imagePath)) {
      const base64 = fs.readFileSync(req.imagePath).toString('base64');
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64,
        },
      });
    }

    parts.push({ text: req.prompt });

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: req.systemInstruction,
        responseMimeType: 'application/json',
        ...(req.responseSchema ? { responseSchema: req.responseSchema } : {}),
      },
    });

    const out = (response.text ?? '').trim();
    if (!out) {
      throw new Error('Gemini returned an empty response.');
    }
    return out;
  });

  return { text, provider: 'gemini', model };
}
