const logger = require('../services/logger');

/**
 * Bot ready event handler.
 * Executed once when the bot comes online.
 */
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    logger.info(`🤖 Bot is online as ${client.user.tag}`);
    logger.info(`   • Servers: ${client.guilds.cache.size}`);
    logger.info(`   • Users: ${client.users.cache.size}`);
    logger.info(`   • Commands: ${client.application?.commands?.cache?.size || 'Loading...'}`);

    // Set bot activity status
    client.user.setPresence({
      activities: [{
        name: `${client.guilds.cache.size} servers | /help`,
        type: 3, // WATCHING
      }],
      status: 'online',
    });

    // Rotate activity status every 30 minutes
    const activities = [
      { name: `${client.guilds.cache.size} servers | /help`, type: 3 },
      { name: 'for spam and raids', type: 3 },  // WATCHING
      { name: '🛡️ Guardian Security', type: 0 }, // PLAYING
      { name: 'AI threat analysis', type: 2 },   // LISTENING
    ];

    let index = 0;
    setInterval(() => {
      index = (index + 1) % activities.length;
      client.user.setPresence({
        activities: [activities[index]],
        status: 'online',
      });
    }, 1800000); // 30 minutes

    logger.info('✅ Bot initialization complete');
  },
};
