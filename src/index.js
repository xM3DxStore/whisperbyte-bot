#!/usr/bin/env node

const { Client, GatewayIntentBits, Collection, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./database');
const logger = require('./services/logger');
const SpamDetector = require('./services/spamDetector');
const XPSystem = require('./services/xpSystem');
const TicketManager = require('./services/ticketManager');
const RaidDetector = require('./services/raidDetector');

if (!config.token) {
  logger.error('DISCORD_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

if (!config.clientId) {
  logger.error('DISCORD_CLIENT_ID is not set in .env file');
  process.exit(1);
}

async function processScheduledAction(action, client) {
  const guild = client.guilds.cache.get(action.guild_id);
  if (!guild) return;

  switch (action.action_type) {
    case 'UNMUTE': {
      const member = guild.members.cache.get(action.user_id);
      if (member && member.isCommunicationDisabled()) {
        await member.timeout(null, 'Scheduled unmute');
        logger.moderation('AUTO_UNMUTE', client.user.id, action.user_id, 'Scheduled unmute expired', action.guild_id);
        try { await member.send(`🔊 Your mute has expired in **${guild.name}**. You can now chat again.`); } catch {}
      }
      break;
    }
    case 'UNBAN': {
      const bans = await guild.bans.fetch();
      const bannedUser = bans.get(action.user_id);
      if (bannedUser) {
        await guild.bans.remove(action.user_id, 'Scheduled unban');
        logger.moderation('AUTO_UNBAN', client.user.id, action.user_id, 'Scheduled unban', action.guild_id);
      }
      break;
    }
    case 'ROLE_REMOVE': {
      const metadata = JSON.parse(action.metadata || '{}');
      const roleId = metadata.roleId;
      const member = guild.members.cache.get(action.user_id);
      if (member && roleId) {
        await member.roles.remove(roleId, 'Scheduled role removal').catch(() => {});
      }
      break;
    }
  }
}

async function startBot() {
  logger.info('═══════════════════════════════════════');
  logger.info('  Guardian Security Bot');
  logger.info(`  Node ${process.version} | ${process.platform}`);
  logger.info('═══════════════════════════════════════');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildIntegrations,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessageTyping,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
      Partials.User,
      Partials.GuildMember,
    ],
    allowedMentions: { parse: ['users', 'roles'], repliedUser: true },
    failIfNotExists: false,
  });

  try {
    await db.initDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Failed to initialize database — ' + error.message);
    process.exit(1);
  }

  client.spamDetector = SpamDetector;
  client.xpSystem = new XPSystem(client);
  client.ticketManager = new TicketManager(client);
  client.raidDetector = new RaidDetector(client);
  client.commands = new Collection();

  const commandFolders = ['security', 'tickets', 'leveling', 'moderation', 'utility'];
  let loadedCommands = 0;
  let failedCommands = 0;

  for (const folder of commandFolders) {
    const folderPath = path.join(__dirname, 'commands', folder);
    if (!fs.existsSync(folderPath)) { logger.warn(`Command folder not found: ${folderPath}`); continue; }
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); loadedCommands++; }
        else { logger.warn(`Command ${file} missing data or execute property`); failedCommands++; }
      } catch (error) { logger.error(`Failed to load command ${file}`, { error: error.message }); failedCommands++; }
    }
  }
  logger.info(`Loaded ${loadedCommands} commands` + (failedCommands ? ` (${failedCommands} failed)` : ''));

  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  let loadedEvents = 0;

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
      const event = require(filePath);
      if (event.once) { client.once(event.name, (...args) => event.execute(...args, client)); }
      else { client.on(event.name, (...args) => event.execute(...args, client)); }
      loadedEvents++;
    } catch (error) { logger.error(`Failed to load event ${file}`, { error: error.message }); }
  }
  logger.info(`Loaded ${loadedEvents} event handlers`);

  setInterval(async () => {
    try {
      if (client.spamDetector) client.spamDetector.cleanup();
      if (client.xpSystem) client.xpSystem.cleanup();
      if (client.raidDetector) client.raidDetector.cleanup();
      const dueActions = db.getDueActions();
      for (const action of dueActions) {
        try {
          await processScheduledAction(action, client);
          db.markActionExecuted(action.id);
        } catch (error) {
          logger.error(`Failed to execute scheduled action ${action.id}`, { error: error.message });
        }
      }
    } catch (error) { logger.error('Error in cleanup routine', { error: error.message }); }
  }, 300000);

  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', { error: error.message, stack: error.stack });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  });
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    try {
      if (client.spamDetector) client.spamDetector.destroy();
      if (client.xpSystem) client.xpSystem.cleanup();
      if (client.raidDetector) client.raidDetector.cleanup();
      client.destroy();
      logger.info('Bot shutdown complete');
    } catch (error) { logger.error('Error during shutdown', { error: error.message }); }
    process.exit(0);
  });
  process.on('SIGTERM', () => { process.emit('SIGINT'); });

  try {
    await client.login(config.token);
    logger.info('Login successful');

    logger.info('Registering slash commands...');
    const commandsData = [];
    client.commands.forEach(cmd => {
      const json = cmd.data.toJSON();
      json.integration_types = [0];
      json.contexts = [0, 1, 2];
      commandsData.push(json);
    });

    const rest = new REST({ version: '10' }).setToken(config.token);
    const guildId = process.env.GUILD_ID;
    const validGuildId = guildId && /^\d{17,20}$/.test(guildId) ? guildId : null;

    if (validGuildId) {
      logger.info(`Registering ${commandsData.length} commands to guild ${validGuildId}...`);
      await rest.put(Routes.applicationGuildCommands(config.clientId, validGuildId), { body: commandsData });
      logger.info(`Registered ${commandsData.length} guild commands`);

      // Clear stale global commands
      try {
        const oldGlobal = await rest.get(Routes.applicationCommands(config.clientId));
        if (oldGlobal.length > 0) {
          await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
          logger.info(`Cleared ${oldGlobal.length} stale global commands`);
        }
      } catch (e) { /* ignore */ }
    } else {
      logger.info(`Registering ${commandsData.length} commands globally...`);
      await rest.put(Routes.applicationCommands(config.clientId), { body: commandsData });
      logger.info(`Registered ${commandsData.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to login — ' + error.message);
    process.exit(1);
  }
}

startBot();
