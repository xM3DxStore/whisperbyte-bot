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

    // First delete ALL old commands (global + guild) to clear cached ones
    logger.info('Clearing old commands...');
    try {
      const oldGlobal = await rest.get(Routes.applicationCommands(config.clientId));
      logger.info(`Found ${oldGlobal.length} old global commands, deleting...`);
      for (const cmd of oldGlobal) {
        await rest.delete(Routes.applicationCommand(config.clientId, cmd.id));
        logger.info(`Deleted global command: ${cmd.name}`);
      }
    } catch (e) {
      logger.info('No old global commands to clear');
    }

    if (guildId) {
      try {
        const oldGuild = await rest.get(Routes.applicationGuildCommands(config.clientId, guildId));
        logger.info(`Found ${oldGuild.length} old guild commands, deleting...`);
        for (const cmd of oldGuild) {
          await rest.delete(Routes.applicationGuildCommand(config.clientId, guildId, cmd.id));
          logger.info(`Deleted guild command: ${cmd.name}`);
        }
      } catch (e) {
        logger.info('No old guild commands to clear');
      }

      logger.info(`Registering commands for guild ${guildId}...`);
      const result = await rest.put(
        Routes.applicationGuildCommands(config.clientId, guildId),
        { body: commands }
      );
      logger.info(`✅ Registered ${result.length} guild commands for ${guildId}`);
    } else {
      logger.info('Registering global commands (may take up to 1 hour to propagate)...');
      const result = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
      logger.info(`✅ Registered ${result.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to register commands', { error: error.message });
    process.exit(1);
  }
}

deployCommands();
