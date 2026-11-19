import dns from 'node:dns/promises';
import net from 'node:net';
import { getConfig } from './config.ts';

export interface UrlValidationResult {
  allowed: boolean;
  normalizedUrl?: string;
  isBuiltinSandbox: boolean;
  reason?: string;
}

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt('0.0.0.0'), ipToInt('0.255.255.255')],
  [ipToInt('10.0.0.0'), ipToInt('10.255.255.255')],
  [ipToInt('100.64.0.0'), ipToInt('100.127.255.255')],
  [ipToInt('127.0.0.0'), ipToInt('127.255.255.255')],
  [ipToInt('169.254.0.0'), ipToInt('169.254.255.255')],
  [ipToInt('172.16.0.0'), ipToInt('172.31.255.255')],
  [ipToInt('192.168.0.0'), ipToInt('192.168.255.255')],
  [ipToInt('224.0.0.0'), ipToInt('255.255.255.255')],
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const val = ipToInt(ip);
    return PRIVATE_IPV4_RANGES.some(([start, end]) => val >= start && val <= end);
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // Unique local
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // Link local
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice(7);
      if (net.isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    return false;
  }
  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254',
]);

/**
 * Resolves whether the URL points to this server's built-in authorized demo sandbox target (/sandbox-app).
 */
export function resolveSandboxUrl(rawUrl: string): { isSandbox: boolean; internalUrl?: string } {
  const cfg = getConfig();
  const trimmed = rawUrl.trim();

  // Direct relative shorthand like "/sandbox-app" or "/sandbox-app?defects=true"
  if (trimmed.startsWith('/sandbox-app')) {
    return {
      isSandbox: true,
      internalUrl: `http://127.0.0.1:${cfg.port}${trimmed}`,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const appOrigin = new URL(cfg.appUrl).origin;
    const localOrigin1 = `http://localhost:${cfg.port}`;
    const localOrigin2 = `http://127.0.0.1:${cfg.port}`;

    if (
      (parsed.origin === appOrigin || parsed.origin === localOrigin1 || parsed.origin === localOrigin2) &&
      parsed.pathname.startsWith('/sandbox-app')
    ) {
      return {
        isSandbox: true,
        internalUrl: `http://127.0.0.1:${cfg.port}${parsed.pathname}${parsed.search}${parsed.hash}`,
      };
    }
  } catch {
    // Not a valid URL
  }
  return { isSandbox: false };
}

/**
 * Validates target URLs against SSRF, private IP ranges, disallowed schemes, and optional allowlists.
 */
export async function validateTargetUrl(
  rawUrl: string,
  options: { allowLocalhostOverride?: boolean } = {}
): Promise<UrlValidationResult> {
  const cfg = getConfig();
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { allowed: false, isBuiltinSandbox: false, reason: 'Target URL is required.' };
  }

  // Built-in authorized demo sandbox is always permitted and routed to loopback safely.
  const sandboxCheck = resolveSandboxUrl(trimmed);
  if (sandboxCheck.isSandbox && sandboxCheck.internalUrl) {
    return {
      allowed: true,
      normalizedUrl: sandboxCheck.internalUrl,
      isBuiltinSandbox: true,
    };
  }

  const candidate =
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith('/') && trimmed.includes('.')
      ? `https://${trimmed}`
      : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      allowed: false,
      isBuiltinSandbox: false,
      reason: 'Invalid URL format. Include http:// or https:// (or select the built-in /sandbox-app).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      allowed: false,
      isBuiltinSandbox: false,
      reason: `Blocked protocol "${parsed.protocol}". Only http:// and https:// targets are permitted.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      allowed: false,
      isBuiltinSandbox: false,
      reason: 'URLs containing embedded credentials are blocked for security.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowLocal = cfg.allowLocalhostTesting && Boolean(options.allowLocalhostOverride);

  // Domain allowlist check if configured in environment
  if (cfg.allowedTargetDomains.length > 0) {
    const matchesAllowlist = cfg.allowedTargetDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (!matchesAllowlist) {
      return {
        allowed: false,
        isBuiltinSandbox: false,
        reason: `Target host "${hostname}" is not in ALLOWED_TARGET_DOMAINS.`,
      };
    }
  }

  if (!allowLocal) {
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
      return {
        allowed: false,
        isBuiltinSandbox: false,
        reason: `Blocked internal or localhost target "${hostname}" (SSRF protection). Use the authorized /sandbox-app or a public URL.`,
      };
    }

    if (net.isIP(hostname) !== 0 && isPrivateIp(hostname)) {
      return {
        allowed: false,
        isBuiltinSandbox: false,
        reason: `Blocked private IP address "${hostname}" (SSRF protection).`,
      };
    }

    // DNS resolution check to prevent DNS rebinding / private IP resolution
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          return {
            allowed: false,
            isBuiltinSandbox: false,
            reason: `Target "${hostname}" resolved to private IP ${addr.address}, which is blocked by SSRF policy.`,
          };
        }
      }
    } catch {
      return {
        allowed: false,
        isBuiltinSandbox: false,
        reason: `Unable to resolve hostname "${hostname}". Check the URL or network connectivity.`,
      };
    }
  }

  return {
    allowed: true,
    normalizedUrl: parsed.toString(),
    isBuiltinSandbox: false,
  };
}

const SENSITIVE_FIELD_PATTERN = /(password|passwd|pwd|secret|token|api[_-]?key|credit|card|cvv|cvc|ssn|pin)/i;
const DESTRUCTIVE_ACTION_PATTERN = /\b(delete account|permanently delete|drop database|wipe|purge|wire transfer|pay now|complete purchase|charge card|place order)\b/i;

export function isSensitiveField(labelOrSelector?: string): boolean {
  if (!labelOrSelector) return false;
  return SENSITIVE_FIELD_PATTERN.test(labelOrSelector);
}

export function isDestructiveAction(text?: string): boolean {
  if (!text) return false;
  return DESTRUCTIVE_ACTION_PATTERN.test(text);
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key[=:]\s*)["']?[^\s"',}]+["']?/gi, '$1[REDACTED]')
    .replace(/(password[=:]\s*)["']?[^\s"',}]+["']?/gi, '$1[REDACTED]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]');
}

export function redactStepValue(action: string, targetLabel: string | undefined, value: string | undefined): string {
  if (!value) return '';
  if ((action === 'fill' || action === 'type') && isSensitiveField(targetLabel)) {
    return '[REDACTED_CREDENTIAL]';
  }
  return redactSensitiveText(value);
}
