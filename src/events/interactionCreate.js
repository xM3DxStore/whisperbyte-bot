const { PermissionsBitField } = require('discord.js');
const { rateLimiter, RateLimitConfig } = require('../utils/rateLimiter');
const { isModerator, isAdmin } = require('../utils/permissions');
const logger = require('../services/logger');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          await interaction.reply({
            content: '⚠️ This command is unavailable. It may have been removed or is still registering.',
            flags: 64,
          });
          return;
        }

        const globalLimit = rateLimiter.check(
          interaction.user.id,
          'global',
          RateLimitConfig.GLOBAL.maxAttempts,
          RateLimitConfig.GLOBAL.windowMs
        );

        if (globalLimit.limited) {
          const retrySeconds = Math.ceil(globalLimit.retryAfter / 1000);
          await interaction.reply({
            content: `⏱️ Slow down — try again in **${retrySeconds}s**.`,
            flags: 64,
          });
          return;
        }

        const cmdConfig = RateLimitConfig[command.rateLimit] || RateLimitConfig.STANDARD;
        const cmdLimit = rateLimiter.check(
          interaction.user.id,
          `cmd_${interaction.commandName}`,
          cmdConfig.maxAttempts,
          cmdConfig.windowMs
        );

        if (cmdLimit.limited) {
          const retrySeconds = Math.ceil(cmdLimit.retryAfter / 1000);
          await interaction.reply({
            content: `⏱️ This command is on cooldown. Try again in **${retrySeconds}s**.`,
            flags: 64,
          });
          return;
        }

        await command.execute(interaction, client);
      }

      else if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_')) {
          if (client.ticketManager) {
            await client.ticketManager.handleButtonInteraction(interaction);
          }
          return;
        }

        if (interaction.customId === 'verify_button') {
          const db = require('../database');
          const guild = db.getGuild(interaction.guild.id);
          if (!guild || !guild.verification_role_id) {
            await interaction.reply({ content: '⚠️ Verification is not configured for this server.', flags: 64 });
            return;
          }
          const role = interaction.guild.roles.cache.get(guild.verification_role_id);
          if (!role) {
            await interaction.reply({ content: '⚠️ The verification role could not be found. Contact an admin.', flags: 64 });
            return;
          }
          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.reply({ content: '✅ You are already verified!', flags: 64 });
            return;
          }
          await interaction.member.roles.add(role, 'Verified via button');
          await interaction.reply({ content: `✅ Welcome to **${interaction.guild.name}**! You now have full access.`, flags: 64 });
          return;
        }

        if (interaction.customId.startsWith('rating_')) {
          const ratingCmd = client.commands.get('rating');
          if (ratingCmd?.handleButton) {
            await ratingCmd.handleButton(interaction);
          }
          return;
        }

        if (interaction.customId.startsWith('giveaway_')) {
          const giveawayCmd = client.commands.get('giveawaycreate');
          if (giveawayCmd?.handleButton) {
            await giveawayCmd.handleButton(interaction);
          }
          return;
        }

        await interaction.reply({
          content: '⚠️ This button is no longer active.',
          flags: 64,
        }).catch(() => {});
      }

      else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_create_select') {
          if (client.ticketManager) {
            await client.ticketManager.handleTicketInteraction(interaction);
          }
          return;
        }
      }

      else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ticket_modal_')) {
          if (client.ticketManager) {
            await client.ticketManager.handleTicketInteraction(interaction);
          }
          return;
        }
      }

      else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }
      }

    } catch (error) {
      logger.error('Interaction error', {
        command: interaction.commandName || interaction.customId,
        userId: interaction.user?.id,
        error: error.message,
      });

      const errorMessage = '❌ Something went wrong. Please try again.';
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage }).catch(() => {});
        } else if (!interaction.isAutocomplete()) {
          await interaction.reply({ content: errorMessage, flags: 64 }).catch(() => {});
        }
      } catch {}
    }
  },
};
