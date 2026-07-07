'use strict';

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { errorEmbed } = require('../../utils/embedBuilder');
const giftChecker = require('../../services/giftChecker');
const logger = require('../../services/logger');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimatedTime(count) {
  const totalMs = count * 1100; // 1.1s per check
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.ceil((totalMs % 60000) / 1000);
  return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
}

function progressBar(current, total, width = 12) {
  const filled = Math.round((current / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function buildProgressEmbed(checked, total, hits, rateLimitHits, lastCode) {
  const pct = Math.round((checked / total) * 100);
  return new EmbedBuilder()
    .setTitle('🎁 Gift Sniper — Running...')
    .setColor(Colors.Blurple)
    .setDescription(
      `\`${progressBar(checked, total)}\` **${pct}%**\n` +
      `Checked **${checked}/${total}** codes`
    )
    .addFields(
      { name: '✅ Valid Links Found', value: `${hits}`, inline: true },
      { name: '⏱️ Rate Limit Hits', value: `${rateLimitHits}`, inline: true },
      { name: '🔍 Last Checked', value: `\`${lastCode}\``, inline: false },
    )
    .setFooter({ text: 'Bot is checking codes — do not close Discord' })
    .setTimestamp();
}

function buildFinalEmbed(result, hits, count, prefix) {
  const elapsed = (result.elapsed / 1000).toFixed(1);

  const embed = new EmbedBuilder()
    .setTitle(hits.length > 0 ? '🎉 Snipe Complete — Hits Found!' : '🔍 Snipe Complete — No Hits')
    .setColor(hits.length > 0 ? Colors.Green : Colors.Grey)
    .addFields(
      { name: '📊 Codes Checked', value: `${count}`, inline: true },
      { name: '✅ Valid Links', value: `${hits.length}`, inline: true },
      { name: '⏱️ Time Elapsed', value: `${elapsed}s`, inline: true },
      { name: '⚡ Rate Limit Hits', value: `${result.rateLimitHits}`, inline: true },
    )
    .setTimestamp();

  if (prefix) embed.addFields({ name: '🔑 Prefix Used', value: `\`${prefix}\``, inline: true });

  if (hits.length > 0) {
    const hitList = hits
      .map(h =>
        `• **https://discord.gift/${h.code}**\n` +
        `  ↳ Type: ${h.type ?? 'Unknown'}` +
        (h.expiresAt ? `  |  Expires: <t:${Math.floor(new Date(h.expiresAt) / 1000)}:R>` : '')
      )
      .join('\n');
    embed.setDescription(`**🎁 Valid Gift Links:**\n${hitList}`);
  } else {
    embed.setDescription(
      '> No valid unclaimed gift links found in this run.\n' +
      '> Discord codes are truly random — try again or use a prefix seed from a recently seen code!'
    );
  }

  return embed;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giftsnipe')
    .setDescription('🎁 Intelligently generate & check Discord gift links for valid unclaimed ones')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addIntegerOption(opt => opt
      .setName('count')
      .setDescription('How many codes to check (1–50). Each check takes ~1 second.')
      .setMinValue(1)
      .setMaxValue(50)
      .setRequired(true)
    )
    .addStringOption(opt => opt
      .setName('prefix')
      .setDescription('Optional: seed prefix (4–8 chars from a known-good code) to bias generation')
      .setMinLength(1)
      .setMaxLength(8)
    )
    .addChannelOption(opt => opt
      .setName('post-channel')
      .setDescription('Optional: post found valid links publicly to this channel')
    ),

  async execute(interaction) {
    const count = interaction.options.getInteger('count');
    const prefix = interaction.options.getString('prefix') ?? '';
    let postChannel = interaction.options.getChannel('post-channel');
    
    if (!postChannel) {
      try {
        postChannel = await interaction.client.channels.fetch('1527278688335429632');
      } catch (e) {
        logger.warn('GiftSniper: could not fetch default post channel', { error: e.message });
      }
    }

    // Validate prefix is valid Base62/hex chars
    if (prefix && !/^[a-zA-Z0-9]+$/.test(prefix)) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid Prefix', 'Prefix must only contain letters and numbers (Base62 charset).')],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Initial progress message
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🎁 Gift Sniper — Starting...')
          .setColor(Colors.Blurple)
          .setDescription(
            `Preparing to check **${count}** codes${prefix ? ` with prefix \`${prefix}\`` : ''}.\n` +
            `Estimated time: **${estimatedTime(count)}**\n\n` +
            `> Using smart charset biasing (50% Base62 + 50% hex-biased)\n` +
            `> Every code is validated via the Discord API in real-time`
          )
          .setTimestamp(),
      ],
    });

    const hits = [];
    let lastCode = '...';
    let lastUpdateAt = 0;

    // Run sniper
    const result = await giftChecker.runSnipe(count, prefix, async (index, checkResult, stats) => {
      lastCode = checkResult.code;
      if (checkResult.valid) hits.push(checkResult);

      // Update progress every 5 checks or on a hit
      const now = Date.now();
      if (checkResult.valid || index % 5 === 0 || (now - lastUpdateAt) > 5000) {
        lastUpdateAt = now;
        try {
          await interaction.editReply({
            embeds: [buildProgressEmbed(index, count, stats.hits, stats.rateLimitHits, lastCode)],
          });
        } catch { /* ignore edit failures */ }
      }
    });

    // Final summary
    const finalEmbed = buildFinalEmbed(result, hits, count, prefix);
    await interaction.editReply({ embeds: [finalEmbed] });

    // Post valid links to public channel if configured
    if (postChannel && hits.length > 0) {
      try {
        const publicEmbed = new EmbedBuilder()
          .setTitle('🎁 Gift Sniper — Valid Links Found!')
          .setColor(Colors.Gold)
          .setDescription(
            hits.map(h =>
              `🔗 **https://discord.gift/${h.code}**  ↳ *${h.type ?? 'Gift'}*` +
              (h.expiresAt ? `  — <t:${Math.floor(new Date(h.expiresAt) / 1000)}:R>` : '')
            ).join('\n')
          )
          .setFooter({ text: `Found by /giftsnipe — ${hits.length} link(s)` })
          .setTimestamp();

        await postChannel.send({ embeds: [publicEmbed] });
      } catch (err) {
        logger.warn('GiftSniper: failed to post to channel', { error: err.message });
      }
    }

    logger.info('GIFT_SNIPE', {
      user: interaction.user.tag,
      guild: interaction.guild.id,
      count,
      prefix: prefix || 'none',
      hits: hits.length,
      elapsed: result.elapsed,
    });
  },
};
