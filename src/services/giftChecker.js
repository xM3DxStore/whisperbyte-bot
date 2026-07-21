'use strict';

/**
 * GiftChecker — Smart Discord gift code generator + validator.
 *
 * Strategy ("IQ mode"):
 *  1. 50% of candidates use pure Base62 (A-Z a-z 0-9)
 *  2. 50% use a hex-biased charset (0-9 A-F) — older Nitro codes historically used
 *     shorter charsets, so this biases toward the known historical distribution.
 *  3. Optional prefix seeding lets you narrow to the same start as a known valid code.
 *  4. Every candidate is validated against the real Discord API before being surfaced.
 *
 * Speed: Uses 4 concurrent workers with token-bucket rate limiting.
 * Discord allows ~5 req/s — we use 4 workers with ~300ms spacing = ~3.3 req/s safe.
 */

const https = require('https');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX_UPPER = '0123456789ABCDEF';
const CODE_LENGTH = 16;
const CONCURRENCY = 4;
const WORKER_DELAY_MS = 300;
const RATE_LIMIT_BACKOFF_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

function generateCode(prefix = '') {
  const remaining = CODE_LENGTH - prefix.length;
  if (remaining <= 0) return prefix.slice(0, CODE_LENGTH);

  const useHex = Math.random() < 0.5;
  const charset = useHex ? HEX_UPPER : BASE62;

  let suffix = '';
  for (let i = 0; i < remaining; i++) {
    suffix += charset[Math.floor(Math.random() * charset.length)];
  }
  return prefix + suffix;
}

function generateCandidates(count, prefix = '') {
  const seen = new Set();
  const codes = [];
  let attempts = 0;
  const maxAttempts = count * 10;

  while (codes.length < count && attempts < maxAttempts) {
    const code = generateCode(prefix);
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
    attempts++;
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Discord API validation
// ---------------------------------------------------------------------------

function checkCode(code) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/entitlements/gift-codes/${code}?with_application=false&with_subscription_plan=true`,
      method: 'GET',
      headers: {
        'User-Agent': 'DiscordBot (xM3DxBot, 1.0)',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: true });
            return;
          }

          if (res.statusCode === 404) {
            resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
            return;
          }

          if (res.statusCode !== 200) {
            resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
            return;
          }

          const json = JSON.parse(data);

          const isClaimed = json.uses != null && json.max_uses != null && json.uses >= json.max_uses;
          const isExpired = json.expires_at ? new Date(json.expires_at) < new Date() : false;

          resolve({
            valid: !isClaimed && !isExpired,
            code,
            type: json.subscription_plan?.name ?? json.type ?? 'Unknown',
            claimedBy: json.redeemer?.username ?? null,
            expiresAt: json.expires_at ?? null,
            rateLimited: false,
          });
        } catch {
          resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
        }
      });
    });

    req.on('error', () => {
      resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Concurrent snipe runner
// ---------------------------------------------------------------------------

async function runSnipe(count, prefix = '', onProgress = null) {
  const candidates = generateCandidates(count, prefix);
  const hits = [];
  let rateLimitHits = 0;
  let checked = 0;
  const startTime = Date.now();

  let index = 0;
  let paused = false;

  async function worker() {
    while (index < candidates.length) {
      if (paused) {
        await sleep(500);
        continue;
      }

      const i = index++;
      if (i >= candidates.length) break;
      const code = candidates[i];

      const result = await checkCode(code);

      if (result.rateLimited) {
        rateLimitHits++;
        paused = true;
        await sleep(RATE_LIMIT_BACKOFF_MS);
        paused = false;
      } else if (result.valid) {
        hits.push(result);
      }

      checked++;

      if (onProgress) {
        onProgress(checked, result, { hits: hits.length, rateLimitHits, checked });
      }

      await sleep(WORKER_DELAY_MS);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(CONCURRENCY, candidates.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return {
    hits,
    checked: candidates.length,
    rateLimitHits,
    elapsed: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateCandidates,
  generateCode,
  checkCode,
  runSnipe,
};
