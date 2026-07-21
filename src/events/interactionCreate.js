const { PermissionsBitField } = require('discord.js');
const { rateLimiter, RateLimitConfig } = require('../utils/rateLimiter');
const { isModerator, isAdmin } = require('../utils/permissions');
const logger = require('../services/logger');
const fs = require('fs');
const path = require('path');

function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line.trim());
  fs.appendFileSync(path.join(__dirname, '..', '..', 'debug.log'), line);
}
fs.writeFileSync(path.join(__dirname, '..', '..', 'debug.log'), '=== Bot Debug Log ===\n');

/**
 * Interaction Create Event Handler
 *
 * Handles all slash commands, button interactions, select menus, and modals.
 * Includes rate limiting, permission checks, and error handling.
 */
module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    debugLog(`>>> INTERACTION RECEIVED: type=${interaction.type} name=${interaction.commandName || interaction.customId} user=${interaction.user?.tag} guild=${interaction.guild?.name}`);
    try {
      // ===================================================================
      // SLASH COMMANDS
      // ===================================================================
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        debugLog(`Command lookup: ${interaction.commandName} => ${!!command}`);
        if (!command) {
          await interaction.reply({
            content: '⚠️ Command not found. It may have been removed or updated.',
            ephemeral: true,
          });
          return;
        }

        // Global rate limit check
        const globalLimit = rateLimiter.check(
          interaction.user.id,
          'global',
          RateLimitConfig.GLOBAL.maxAttempts,
          RateLimitConfig.GLOBAL.windowMs
        );

        if (globalLimit.limited) {
          const retrySeconds = Math.ceil(globalLimit.retryAfter / 1000);
          await interaction.reply({
            content: `⏱️ You are being rate limited. Please wait ${retrySeconds} second(s) before using more commands.`,
            ephemeral: true,
          });
          return;
        }

        // Command-specific rate limit check
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
            content: `⏱️ Please slow down! Try again in ${retrySeconds} second(s).`,
            ephemeral: true,
          });
          return;
        }

        // Execute the command
        await command.execute(interaction, client);
      }

      // ===================================================================
      // BUTTON INTERACTIONS
      // ===================================================================
      else if (interaction.isButton()) {
        // Delegate to ticket manager for ticket-related buttons
        if (interaction.customId.startsWith('ticket_')) {
          if (client.ticketManager) {
            await client.ticketManager.handleButtonInteraction(interaction);
          }
          return;
        }

        // Verify button
        if (interaction.customId === 'verify_button') {
          const db = require('../database');
          const guild = db.getGuild(interaction.guild.id);
          if (!guild || !guild.verification_role_id) {
            await interaction.reply({ content: 'Verification is not configured.', ephemeral: true });
            return;
          }
          const role = interaction.guild.roles.cache.get(guild.verification_role_id);
          if (!role) {
            await interaction.reply({ content: 'Verification role not found.', ephemeral: true });
            return;
          }
          if (interaction.member.roles.cache.has(role.id)) {
            await interaction.reply({ content: 'You are already verified!', ephemeral: true });
            return;
          }
          await interaction.member.roles.add(role, 'Verified via button');
          await interaction.reply({ content: `✅ You have been verified! Welcome to **${interaction.guild.name}**.`, ephemeral: true });
          return;
        }

        // Rating buttons
        if (interaction.customId.startsWith('rating_')) {
          const ratingCmd = client.commands.get('rating');
          if (ratingCmd?.handleButton) {
            await ratingCmd.handleButton(interaction);
          }
          return;
        }

        // Giveaway buttons
        if (interaction.customId.startsWith('giveaway_')) {
          const giveawayCmd = client.commands.get('giveawaycreate');
          if (giveawayCmd?.handleButton) {
            await giveawayCmd.handleButton(interaction);
          }
          return;
        }

        // General button handling
        const buttonLabel = interaction.customId;
        logger.debug(`Button pressed: ${buttonLabel}`, { userId: interaction.user.id });
        await interaction.reply({
          content: `Button "${buttonLabel}" pressed — no handler configured.`,
          ephemeral: true,
        });
      }

      // ===================================================================
      // SELECT MENU INTERACTIONS
      // ===================================================================
      else if (interaction.isStringSelectMenu()) {
        // Delegate to ticket manager for ticket panel
        if (interaction.customId === 'ticket_create_select') {
          if (client.ticketManager) {
            await client.ticketManager.handleTicketInteraction(interaction);
          }
          return;
        }

        logger.debug(`Select menu: ${interaction.customId}`, {
          userId: interaction.user.id,
          values: interaction.values,
        });
      }

      // ===================================================================
      // MODAL SUBMISSIONS
      // ===================================================================
      else if (interaction.isModalSubmit()) {
        // Delegate to ticket manager for ticket modals
        if (interaction.customId.startsWith('ticket_modal_')) {
          if (client.ticketManager) {
            await client.ticketManager.handleTicketInteraction(interaction);
          }
          return;
        }

        logger.debug(`Modal submitted: ${interaction.customId}`, { userId: interaction.user.id });
      }

      // ===================================================================
      // AUTOCOMPLETE INTERACTIONS
      // ===================================================================
      else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, client);
        }
      }

    } catch (error) {
      logger.error('Interaction error', {
        command: interaction.commandName || interaction.customId,
        userId: interaction.user.id,
        error: error.message,
        stack: error.stack,
      });

      // Attempt to reply with error
      const errorMessage = '❌ An unexpected error occurred. Please try again or contact support.';
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyErr) {
        logger.error('Failed to send error reply', { error: replyErr.message });
      }
    }
  },
};
