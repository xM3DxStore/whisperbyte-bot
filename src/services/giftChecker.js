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
 * Rate limits: Discord enforces ~5 req/s on gift-code lookups from bots.
 * We use a 1100ms delay between requests to stay safely under the limit.
 */

const https = require('https');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX_UPPER = '0123456789ABCDEF';
const CODE_LENGTH = 16; // Discord gift codes are 16 chars
const REQUEST_DELAY_MS = 1100; // Stay under Discord's rate limit

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * Generate a single random code using the "smart" mixed charset strategy.
 * @param {string} [prefix=''] Known prefix to prepend (narrowing the search space).
 * @returns {string}
 */
function generateCode(prefix = '') {
  const remaining = CODE_LENGTH - prefix.length;
  if (remaining <= 0) return prefix.slice(0, CODE_LENGTH);

  // Alternate strategy: 50/50 between pure Base62 and hex-biased
  const useHex = Math.random() < 0.5;
  const charset = useHex ? HEX_UPPER : BASE62;

  let suffix = '';
  for (let i = 0; i < remaining; i++) {
    suffix += charset[Math.floor(Math.random() * charset.length)];
  }
  return prefix + suffix;
}

/**
 * Generate an array of unique candidate codes.
 * @param {number} count
 * @param {string} [prefix='']
 * @returns {string[]}
 */
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

/**
 * Check a single gift code against the Discord API.
 * @param {string} code
 * @returns {Promise<{ valid: boolean, code: string, type: string|null, claimedBy: string|null, expiresAt: string|null, rateLimited: boolean }>}
 */
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
            // Code does not exist
            resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
            return;
          }

          if (res.statusCode !== 200) {
            resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
            return;
          }

          const json = JSON.parse(data);

          // If a code is claimed, Discord still returns 200 with uses >= max_uses
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

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ valid: false, code, type: null, claimedBy: null, expiresAt: null, rateLimited: false });
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main snipe runner
// ---------------------------------------------------------------------------

/**
 * Run a full snipe session.
 * @param {number} count Total codes to check.
 * @param {string} [prefix=''] Optional prefix seed.
 * @param {function} [onProgress] Called after each check with (index, result, stats).
 * @returns {Promise<{ hits: object[], checked: number, rateLimitHits: number, elapsed: number }>}
 */
async function runSnipe(count, prefix = '', onProgress = null) {
  const candidates = generateCandidates(count, prefix);
  const hits = [];
  let rateLimitHits = 0;
  const startTime = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const code = candidates[i];
    const result = await checkCode(code);

    if (result.rateLimited) {
      rateLimitHits++;
      // Back off on rate limit
      await sleep(5000);
    } else if (result.valid) {
      hits.push(result);
    }

    if (onProgress) {
      onProgress(i + 1, result, { hits: hits.length, rateLimitHits, checked: i + 1 });
    }

    // Respectful delay between requests
    if (i < candidates.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

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
