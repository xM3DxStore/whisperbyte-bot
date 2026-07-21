'use strict';

/**
 * GiftSniper — Passive gift link monitor.
 *
 * Watches all messages in all servers the bot is in for discord.gift/ links.
 * When found, validates the code against the Discord API in real-time.
 * If valid (unclaimed + unexpired), pings the owner in the target channel.
 *
 * This is the only way to snipe codes — random generation is mathematically
 * impossible (62^16 search space).
 */

const https = require('https');
const { EmbedBuilder, Colors } = require('discord.js');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let enabled = false;
let targetChannelId = null;
let ownerUserId = null;
const seenCodes = new Set();
const MAX_SEEN = 50000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function configure(options) {
  targetChannelId = options.channelId;
  ownerUserId = options.ownerId;
  enabled = true;
  logger.info('GiftSniper: monitor enabled', { channelId: targetChannelId, ownerId: ownerUserId });
}

function disable() {
  enabled = false;
  logger.info('GiftSniper: monitor disabled');
}

function isEnabled() {
  return enabled;
}

function getStats() {
  return { enabled, targetChannelId, ownerUserId, seenCodes: seenCodes.size };
}

// ---------------------------------------------------------------------------
// Discord API check (fast, no auth needed)
// ---------------------------------------------------------------------------

function checkCode(code) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'discord.com',
      path: `/api/v10/entitlements/gift-codes/${code}?with_application=false&with_subscription_plan=true`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            resolve({ valid: false, code, type: null, rateLimited: true });
            return;
          }
          if (res.statusCode !== 200) {
            resolve({ valid: false, code, type: null, rateLimited: false });
            return;
          }

          const json = JSON.parse(data);
          const isClaimed = json.uses != null && json.max_uses != null && json.uses >= json.max_uses;
          const isExpired = json.expires_at ? new Date(json.expires_at) < new Date() : false;

          resolve({
            valid: !isClaimed && !isExpired,
            code,
            type: json.subscription_plan?.name ?? json.type ?? 'Unknown',
            expiresAt: json.expires_at ?? null,
            rateLimited: false,
          });
        } catch {
          resolve({ valid: false, code, type: null, rateLimited: false });
        }
      });
    });

    req.on('error', () => resolve({ valid: false, code, type: null, rateLimited: false }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ valid: false, code, type: null, rateLimited: false }); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Message scanner
// ---------------------------------------------------------------------------

const GIFT_REGEX = /discord\.gift\/([a-zA-Z0-9]{16})/g;

async function scanMessage(message, client) {
  if (!enabled || !targetChannelId || !ownerUserId) return;
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content || '';
  const matches = [...content.matchAll(GIFT_REGEX)];

  if (matches.length === 0) return;

  for (const match of matches) {
    const code = match[1];

    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    if (seenCodes.size > MAX_SEEN) {
      const first = seenCodes.values().next().value;
      seenCodes.delete(first);
    }

    logger.info('GiftSniper: found code', {
      code,
      guild: message.guild.name,
      channel: message.channel.name,
      user: message.author.tag,
    });

    const result = await checkCode(code);

    if (result.rateLimited) {
      await new Promise(r => setTimeout(r, 2000));
      const retry = await checkCode(code);
      if (!retry.valid) continue;
      Object.assign(result, retry);
    }

    if (result.valid) {
      try {
        const targetChannel = await client.channels.fetch(targetChannelId);
        if (!targetChannel) continue;

        const embed = new EmbedBuilder()
          .setTitle('🎉 VALID GIFT CODE SNIPED!')
          .setColor(Colors.Gold)
          .setDescription(`A valid unclaimed gift link was found!`)
          .addFields(
            { name: '🔗 Link', value: `https://discord.gift/${code}`, inline: false },
            { name: '📦 Type', value: result.type || 'Unknown', inline: true },
            { name: '⏰ Expires', value: result.expiresAt ? `<t:${Math.floor(new Date(result.expiresAt) / 1000)}:R>` : 'Unknown', inline: true },
            { name: '📍 Found In', value: `${message.guild.name} → <#${message.channel.id}>`, inline: false },
            { name: '👤 Shared By', value: `${message.author.tag}`, inline: true },
          )
          .setFooter({ text: 'GiftSniper — Claim it fast!' })
          .setTimestamp();

        await targetChannel.send({
          content: `<@${ownerUserId}> GIFT CODE SNIPED! CLAIM NOW!`,
          embeds: [embed],
        });

        logger.info('GiftSniper: valid code posted', { code, type: result.type });
      } catch (err) {
        logger.error('GiftSniper: failed to post hit', { error: err.message, code });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  configure,
  disable,
  isEnabled,
  getStats,
  scanMessage,
  checkCode,
};
