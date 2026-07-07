const config = require('../config');

/**
 * Log levels for the logger service.
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const CURRENT_LEVEL = LOG_LEVELS[config.logging.level] ?? LOG_LEVELS.info;

/**
 * Format a log message with timestamp and level.
 */
function formatMessage(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
  return `${prefix} ${message}${dataStr}`;
}

/**
 * Core logging function.
 */
function log(level, message, data = null) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;

  const formatted = formatMessage(level, message, data);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'debug':
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }
}

const logger = {
  error: (message, data = null) => log('error', message, data),
  warn: (message, data = null) => log('warn', message, data),
  info: (message, data = null) => log('info', message, data),
  debug: (message, data = null) => log('debug', message, data),

  /**
   * Log a moderation action with structured data.
   */
  moderation: (action, moderatorId, targetId, reason, guildId) => {
    logger.info(`[MOD] ${action}`, {
      moderatorId,
      targetId,
      reason,
      guildId,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Log a security event with severity.
   */
  security: (event, details, severity = 'info') => {
    logger[severity](`[SEC] ${event}`, details);
  },

  /**
   * Log a database operation.
   */
  database: (operation, table, details = null) => {
    logger.debug(`[DB] ${operation} on ${table}`, details);
  },
};

module.exports = logger;
