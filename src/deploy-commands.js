const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./services/logger');

/**
 * Script to register all slash commands with Discord API.
 * Run with: node src/deploy-commands.js
 * Or for specific guild: GUILD_ID=your_guild_id node src/deploy-commands.js
 */

async function deployCommands() {
  const commands = [];
  const commandFolders = [
    'security',
    'tickets',
    'leveling',
    'moderation',
    'utility',
  ];

  // Load all command files
  for (const folder of commandFolders) {
    const folderPath = path.join(__dirname, 'commands', folder);
    if (!fs.existsSync(folderPath)) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if (command.data) {
          const json = command.data.toJSON();
          json.integration_types = [0];
          json.contexts = [0, 1, 2];
          commands.push(json);
          logger.info(`Loaded command: ${command.data.name}`);
        }
      } catch (error) {
        logger.error(`Failed to load command ${file}`, { error: error.message });
      }
    }
  }

  logger.info(`Loaded ${commands.length} commands total`);

  // Register commands
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    const guildId = process.env.GUILD_ID;
    const validGuildId = guildId && /^\d{17,20}$/.test(guildId) ? guildId : null;

    if (validGuildId) {
      logger.info(`Registering commands for guild ${validGuildId}...`);
      const result = await rest.put(
        Routes.applicationGuildCommands(config.clientId, validGuildId),
        { body: commands }
      );
      logger.info(`✅ Registered ${result.length} guild commands for ${validGuildId}`);

      // Clear stale global commands so they don't conflict
      try {
        const oldGlobal = await rest.get(Routes.applicationCommands(config.clientId));
        if (oldGlobal.length > 0) {
          logger.info(`Clearing ${oldGlobal.length} stale global commands...`);
          await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
          logger.info('✅ Cleared stale global commands');
        }
      } catch (e) {
        logger.info('Could not clear global commands');
      }
    } else {
      logger.info('No valid GUILD_ID set — registering globally (takes up to 1 hour)...');
      const result = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
      logger.info(`✅ Registered ${result.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to register commands', { error: error.message });
  }
}

deployCommands();
