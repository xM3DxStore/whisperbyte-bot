const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db;
let dbPath;

async function initDatabase() {
  dbPath = config.database.path;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  createTables();
  createIndexes();
  return db;
}

function saveDatabase() {
  // better-sqlite3 writes directly to disk — no manual save needed
}

function createTables() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS guilds (
      guild_id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '!',
      spam_sensitivity REAL DEFAULT 0.6,
      xp_rate_multiplier REAL DEFAULT 1.0,
      xp_enabled INTEGER DEFAULT 1,
      xp_channels TEXT DEFAULT '[]',
      ignore_channels TEXT DEFAULT '[]',
      anti_raid_enabled INTEGER DEFAULT 1,
      lockdown_active INTEGER DEFAULT 0,
      lockdown_until TEXT,
      ticket_category_id TEXT,
      support_role_id TEXT,
      mod_log_channel_id TEXT,
      security_alert_channel_id TEXT,
      appeal_invite TEXT DEFAULT '',
      verification_role_id TEXT,
      verification_channel_id TEXT,
      whitelist_users TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS spam_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      score REAL DEFAULT 0,
      violations INTEGER DEFAULT 0,
      last_violation TEXT,
      last_decay TEXT,
      muted_until TEXT,
      warned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(guild_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      severity INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      creator_id TEXT NOT NULL,
      assigned_to TEXT,
      status TEXT DEFAULT 'OPEN',
      subject TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 1,
      transcript_saved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      order_details TEXT,
      payment_method TEXT,
      payment_amount REAL,
      payment_currency TEXT DEFAULT 'USD',
      payment_status TEXT DEFAULT 'PENDING',
      order_status TEXT DEFAULT 'PENDING',
      is_complete INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      content TEXT,
      attachment_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      total_xp INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      voice_minutes INTEGER DEFAULT 0,
      last_message_time TEXT,
      last_voice_time TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(guild_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS level_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(guild_id, role_id),
      UNIQUE(guild_id, level)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      moderator_id TEXT,
      target_id TEXT,
      reason TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS raid_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity INTEGER DEFAULT 1,
      details TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      execute_at TEXT NOT NULL,
      metadata TEXT,
      executed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

function createIndexes() {
  db.run('CREATE INDEX IF NOT EXISTS idx_spam_scores_guild_user ON spam_scores(guild_id, user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(creator_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_ticket_orders_ticket ON ticket_orders(ticket_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_user_levels_guild ON user_levels(guild_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_user_levels_guild_xp ON user_levels(guild_id, xp DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_guild ON audit_logs(guild_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_scheduled_actions_execute ON scheduled_actions(execute_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_raid_events_guild ON raid_events(guild_id)');
}

function queryAll(sql, params = []) {
  return db.prepare(sql).all(params);
}

function queryGet(sql, params = []) {
  return db.prepare(sql).get(params) || null;
}

function queryRun(sql, params = []) {
  return db.prepare(sql).run(params);
}

function getGuild(guildId) {
  return queryGet('SELECT * FROM guilds WHERE guild_id = ?', [guildId]);
}

function ensureGuild(guildId) {
  queryRun('INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)', [guildId]);
  return getGuild(guildId);
}

function updateGuild(guildId, updates) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(guildId);
  queryRun(`UPDATE guilds SET ${fields}, updated_at = datetime('now') WHERE guild_id = ?`, values);
  return getGuild(guildId);
}

function getSpamScore(guildId, userId) {
  return queryGet('SELECT * FROM spam_scores WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function upsertSpamScore(guildId, userId, updates) {
  const existing = getSpamScore(guildId, userId);
  if (existing) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(guildId, userId);
    queryRun(`UPDATE spam_scores SET ${fields} WHERE guild_id = ? AND user_id = ?`, values);
  } else {
    queryRun(
      'INSERT INTO spam_scores (guild_id, user_id, score, violations, last_violation, last_decay) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
      [guildId, userId, updates.score || 0, updates.violations || 1]
    );
  }
  return getSpamScore(guildId, userId);
}

function resetSpamScore(guildId, userId) {
  queryRun('DELETE FROM spam_scores WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function getHighSpamScores(guildId, minScore) {
  return queryAll('SELECT * FROM spam_scores WHERE guild_id = ? AND score >= ? ORDER BY score DESC', [guildId, minScore]);
}

function addWarning(guildId, userId, moderatorId, reason, severity = 1) {
  queryRun('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, severity) VALUES (?, ?, ?, ?, ?)', [guildId, userId, moderatorId, reason, severity]);
  return queryGet('SELECT last_insert_rowid() as id').id;
}

function getUserWarnings(guildId, userId, activeOnly = true) {
  if (activeOnly) {
    return queryAll('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY created_at DESC', [guildId, userId]);
  }
  return queryAll('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

function clearWarnings(guildId, userId) {
  queryRun('UPDATE warnings SET active = 0 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function removeWarning(warningId) {
  queryRun('UPDATE warnings SET active = 0 WHERE id = ?', [warningId]);
}

function createTicket(guildId, creatorId, subject, description = '', priority = 1) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const ticketId = `TKT-${timestamp}-${random}`;
  queryRun('INSERT INTO tickets (ticket_id, guild_id, creator_id, subject, description, priority) VALUES (?, ?, ?, ?, ?, ?)', [ticketId, guildId, creatorId, subject, description, priority]);
  return getTicket(ticketId);
}

function getTicket(ticketId) {
  return queryGet('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId]);
}

function getUserTickets(guildId, userId, status = null) {
  if (status) {
    return queryAll('SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = ? ORDER BY created_at DESC', [guildId, userId, status]);
  }
  return queryAll('SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? ORDER BY created_at DESC', [guildId, userId]);
}

function getAllTickets(guildId, status = null) {
  if (status) {
    return queryAll('SELECT * FROM tickets WHERE guild_id = ? AND status = ? ORDER BY created_at DESC', [guildId, status]);
  }
  return queryAll('SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC', [guildId]);
}

function updateTicket(ticketId, updates) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(ticketId);
  let extraFields = '';
  if (updates.status === 'CLOSED' || updates.status === 'RESOLVED') {
    extraFields = ", closed_at = datetime('now')";
  }
  queryRun(`UPDATE tickets SET ${fields}${extraFields}, updated_at = datetime('now') WHERE ticket_id = ?`, values);
  return getTicket(ticketId);
}

function deleteTicket(ticketId) {
  queryRun('DELETE FROM tickets WHERE ticket_id = ?', [ticketId]);
}

function getActiveTicketCount(guildId, creatorId) {
  const result = queryGet("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND creator_id = ? AND status NOT IN ('CLOSED', 'RESOLVED')", [guildId, creatorId]);
  return result.count;
}

function createOrder(ticketId, orderDetails = '{}', notes = '') {
  queryRun('INSERT INTO ticket_orders (ticket_id, order_details, notes) VALUES (?, ?, ?)', [ticketId, orderDetails, notes]);
  return queryGet('SELECT last_insert_rowid() as id').id;
}

function getOrder(orderId) {
  return queryGet('SELECT * FROM ticket_orders WHERE id = ?', [orderId]);
}

function getTicketOrders(ticketId) {
  return queryAll('SELECT * FROM ticket_orders WHERE ticket_id = ? ORDER BY created_at DESC', [ticketId]);
}

function updateOrder(orderId, updates) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(orderId);
  queryRun(`UPDATE ticket_orders SET ${fields}, updated_at = datetime('now') WHERE id = ?`, values);
  return getOrder(orderId);
}

function getUserLevel(guildId, userId) {
  return queryGet('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

function upsertUserLevel(guildId, userId, updates) {
  const existing = getUserLevel(guildId, userId);
  if (existing) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(guildId, userId);
    queryRun(`UPDATE user_levels SET ${fields}, updated_at = datetime('now') WHERE guild_id = ? AND user_id = ?`, values);
  } else {
    queryRun(
      'INSERT INTO user_levels (guild_id, user_id, xp, level, total_xp, message_count, last_message_time) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      [guildId, userId, updates.xp || 0, updates.level || 1, updates.total_xp || 0, updates.message_count || 1]
    );
  }
  return getUserLevel(guildId, userId);
}

function getLeaderboard(guildId, limit = 10) {
  return queryAll('SELECT * FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?', [guildId, limit]);
}

function getUserRank(guildId, userId) {
  const result = queryGet(
    'SELECT COUNT(*) as rank FROM user_levels WHERE guild_id = ? AND xp > (SELECT COALESCE(xp, 0) FROM user_levels WHERE guild_id = ? AND user_id = ?)',
    [guildId, guildId, userId]
  );
  return result.rank + 1;
}

function addLevelRole(guildId, level, roleId) {
  queryRun('INSERT OR REPLACE INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)', [guildId, level, roleId]);
}

function removeLevelRole(guildId, level) {
  queryRun('DELETE FROM level_roles WHERE guild_id = ? AND level = ?', [guildId, level]);
}

function getLevelRoles(guildId) {
  return queryAll('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC', [guildId]);
}

function getLevelRoleForLevel(guildId, level) {
  return queryGet('SELECT * FROM level_roles WHERE guild_id = ? AND level <= ? ORDER BY level DESC LIMIT 1', [guildId, level]);
}

function addAuditLog(guildId, action, moderatorId = null, targetId = null, reason = '', details = '{}') {
  queryRun('INSERT INTO audit_logs (guild_id, action, moderator_id, target_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)', [guildId, action, moderatorId, targetId, reason, details]);
}

function getAuditLogs(guildId, limit = 50) {
  return queryAll('SELECT * FROM audit_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?', [guildId, limit]);
}

function addScheduledAction(guildId, userId, actionType, executeAt, metadata = '{}') {
  queryRun('INSERT INTO scheduled_actions (guild_id, user_id, action_type, execute_at, metadata) VALUES (?, ?, ?, ?, ?)', [guildId, userId, actionType, executeAt, metadata]);
}

function getDueActions() {
  return queryAll("SELECT * FROM scheduled_actions WHERE executed = 0 AND execute_at <= datetime('now') ORDER BY execute_at ASC");
}

function markActionExecuted(actionId) {
  queryRun('UPDATE scheduled_actions SET executed = 1 WHERE id = ?', [actionId]);
}

function logRaidEvent(guildId, eventType, severity = 1, details = '{}') {
  queryRun('INSERT INTO raid_events (guild_id, event_type, severity, details) VALUES (?, ?, ?, ?)', [guildId, eventType, severity, details]);
}

function getRecentJoins(guildId, windowMs) {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const result = queryGet("SELECT COUNT(*) as count FROM raid_events WHERE guild_id = ? AND event_type = 'JOIN_BURST' AND created_at >= ?", [guildId, cutoff]);
  return result.count;
}

function addTicketMessage(ticketId, userId, username, content, attachmentUrl = null) {
  queryRun('INSERT INTO ticket_messages (ticket_id, user_id, username, content, attachment_url) VALUES (?, ?, ?, ?, ?)', [ticketId, userId, username, content, attachmentUrl]);
}

function getTicketMessages(ticketId) {
  return queryAll('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC', [ticketId]);
}

function getXpChannels(guildId) {
  const guild = ensureGuild(guildId);
  try { return JSON.parse(guild.xp_channels || '[]'); } catch { return []; }
}

function setXpChannels(guildId, channels) {
  updateGuild(guildId, { xp_channels: JSON.stringify(channels) });
}

function getIgnoreChannels(guildId) {
  const guild = ensureGuild(guildId);
  try { return JSON.parse(guild.ignore_channels || '[]'); } catch { return []; }
}

module.exports = {
  initDatabase,
  getDb: () => db,
  saveDatabase,
  getGuild,
  ensureGuild,
  updateGuild,
  getSpamScore,
  upsertSpamScore,
  resetSpamScore,
  getHighSpamScores,
  addWarning,
  getUserWarnings,
  clearWarnings,
  removeWarning,
  createTicket,
  getTicket,
  getUserTickets,
  getAllTickets,
  updateTicket,
  deleteTicket,
  getActiveTicketCount,
  addTicketMessage,
  getTicketMessages,
  createOrder,
  getOrder,
  getTicketOrders,
  updateOrder,
  getUserLevel,
  upsertUserLevel,
  getLeaderboard,
  getUserRank,
  addLevelRole,
  removeLevelRole,
  getLevelRoles,
  getLevelRoleForLevel,
  addAuditLog,
  getAuditLogs,
  addScheduledAction,
  getDueActions,
  markActionExecuted,
  logRaidEvent,
  getRecentJoins,
  getXpChannels,
  setXpChannels,
  getIgnoreChannels,
};
