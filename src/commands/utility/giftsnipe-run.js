'use strict';

const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const { errorEmbed, successEmbed } = require('../../utils/embedBuilder');
const giftChecker = require('../../services/giftChecker');
const logger = require('../../services/logger');

// Store active snipes to prevent running multiple at once
const activeSnipers = new Set();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giftsnipe-run')
    .setDescription('🎁 Start an infinite background sniper that pings you when a gift is found.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt => opt
      .setName('action')
      .setDescription('Start or stop the sniper')
      .addChoices(
        { name: 'Start', value: 'start' },
        { name: 'Stop', value: 'stop' }
      )
      .setRequired(true)
    ),

  async execute(interaction) {
    const action = interaction.options.getString('action');
    const targetChannelId = '1527278688335429632'; // The channel you specified

    if (action === 'stop') {
      if (!activeSnipers.has(interaction.user.id)) {
        return interaction.reply({ embeds: [errorEmbed('Not Running', 'You do not have an active sniper running.')], ephemeral: true });
      }
      activeSnipers.delete(interaction.user.id);
      return interaction.reply({ embeds: [successEmbed('Sniper Stopped', 'Your background sniper has been stopped.')], ephemeral: true });
    }

    if (activeSnipers.has(interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('Already Running', 'You already have a sniper running in the background. Use `/giftsnipe-run action:Stop` to stop it.')], ephemeral: true });
    }

    // Start background loop
    activeSnipers.add(interaction.user.id);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚀 Infinite Sniper Started')
          .setColor(Colors.Green)
          .setDescription(
            `Background sniper is running limitlessly!\n\n` +
            `─────────────────────────\n` +
            `> Target: <#${targetChannelId}>\n` +
            `> Mode: **Infinite background scan**\n` +
            `> Speed: **~1 code per second**\n\n` +
            `I will ping you immediately when a valid gift link is found.`
          )
          .setTimestamp(),
      ],
      ephemeral: true,
    });

    try {
      const channel = await interaction.client.channels.fetch(targetChannelId);

      // Infinite loop running async
      (async () => {
        let codesChecked = 0;
        let rateLimits = 0;
        const prefix = ''; // Random

        while (activeSnipers.has(interaction.user.id)) {
          const code = giftChecker.generateCode(prefix);
          const result = await giftChecker.checkCode(code);

          codesChecked++;

          if (result.rateLimited) {
            rateLimits++;
            await new Promise(r => setTimeout(r, 5000)); // 5s sleep on rate limit
            continue;
          }

          if (result.valid) {
            // Found one!
            const hitEmbed = new EmbedBuilder()
              .setTitle('🎉 VALID GIFT LINK FOUND!')
              .setColor(Colors.Gold)
              .setDescription(
                `🔗 **https://discord.gift/${result.code}**\n\n` +
                `─────────────────────────\n` +
                `> Type: **${result.type ?? 'Gift'}**\n` +
                (result.expiresAt ? `> Expires: <t:${Math.floor(new Date(result.expiresAt) / 1000)}:R>\n` : '') +
                `> Codes checked: **${codesChecked}**`
              )
              .setTimestamp();

            await channel.send({
              content: `<@${interaction.user.id}> GET IT QUICK! 💎`,
              embeds: [hitEmbed]
            });
            logger.info('GIFT_SNIPE_HIT', { user: interaction.user.tag, code: result.code });

            // Stop after finding one? Or keep going? The user said "once it sniped it should ping me"
            // Let's keep it running so they don't have to restart it every time.
          }

          // 1.1s delay
          await new Promise(r => setTimeout(r, 1100));
        }
      })();

    } catch (err) {
      activeSnipers.delete(interaction.user.id);
      logger.error('InfiniteSniper: Error fetching channel', { error: err.message });
      await interaction.followUp({ embeds: [errorEmbed('Startup Failed', 'Could not start sniper — the target channel could not be found.')], ephemeral: true });
    }
  },
};
