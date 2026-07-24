const logger = require('../services/logger');

/**
 * Bot ready event handler.
 * Executed once when the bot comes online.
 */
module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    const serverCount = client.guilds.cache.size;
    const userCount = client.users.cache.size;
    const cmdCount = client.application?.commands?.cache?.size || 'Loading...';

    logger.info('═══════════════════════════════════════');
    logger.info(`  Logged in as ${client.user.tag}`);
    logger.info(`  Servers: ${serverCount} | Users: ${userCount} | Commands: ${cmdCount}`);
    logger.info('═══════════════════════════════════════');

    client.user.setPresence({
      activities: [{
        name: `${serverCount} servers | /help`,
        type: 3,
      }],
      status: 'online',
    });

    const activities = [
      { name: `${serverCount} servers | /help`, type: 3 },
      { name: 'for spam and raids', type: 3 },
      { name: '🛡️ over server security', type: 3 },
      { name: 'AI threat analysis', type: 2 },
      { name: 'with /moderate', type: 0 },
      { name: 'over your tickets', type: 3 },
      { name: '/verify to get started', type: 1 },
      { name: 'with user reports', type: 0 },
      { name: 'for suspicious activity', type: 3 },
      { name: 'server analytics', type: 2 },
    ];

    let index = 0;
    setInterval(() => {
      index = (index + 1) % activities.length;
      client.user.setPresence({
        activities: [activities[index]],
        status: 'online',
      });
    }, 1800000);

    logger.info('Bot initialization complete');
  },
};
