const { PermissionsBitField } = require('discord.js');
const config = require('../config');

/**
 * Check if a member has administrator-level permissions.
 */
function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

/**
 * Check if a member has moderator-level permissions.
 */
function isModerator(member) {
  return member.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
         member.permissions.has(PermissionsBitField.Flags.KickMembers) ||
         member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
         isAdmin(member);
}

/**
 * Check if a member has manage message permissions.
 */
function canManageMessages(member) {
  return member.permissions.has(PermissionsBitField.Flags.ManageMessages) || isAdmin(member);
}

/**
 * Check if the given user ID is the bot owner.
 */
function isOwner(userId) {
  return userId === config.ownerId;
}

/**
 * Check if a member is the server owner.
 */
function isServerOwner(member) {
  return member.id === member.guild.ownerId;
}

/**
 * Get the highest role position of a member.
 */
function getHighestRolePosition(member) {
  return member.roles.highest.position;
}

/**
 * Check if the bot can take action against a target member.
 * Bot cannot action members with higher roles or server owners.
 */
function canActOnTarget(botMember, targetMember, moderator) {
  if (!targetMember) return false;
  if (targetMember.id === targetMember.guild.ownerId) return false;
  if (targetMember.roles.highest.position >= botMember.roles.highest.position) return false;
  if (moderator && targetMember.roles.highest.position >= moderator.roles.highest.position) return false;
  return true;
}

/**
 * Check if a member has a specific permission.
 */
function hasPermission(member, permission) {
  return member.permissions.has(permission);
}

/**
 * Get all security-related permissions for a member.
 */
function getSecurityPermissions(member) {
  return {
    isAdmin: isAdmin(member),
    isModerator: isModerator(member),
    canManageMessages: canManageMessages(member),
    isServerOwner: isServerOwner(member),
    canKick: member.permissions.has(PermissionsBitField.Flags.KickMembers),
    canBan: member.permissions.has(PermissionsBitField.Flags.BanMembers),
    canMute: member.permissions.has(PermissionsBitField.Flags.ModerateMembers),
    canManageRoles: member.permissions.has(PermissionsBitField.Flags.ManageRoles),
    canManageChannels: member.permissions.has(PermissionsBitField.Flags.ManageChannels),
    canManageGuild: member.permissions.has(PermissionsBitField.Flags.ManageGuild),
  };
}

/**
 * Required permissions for the bot to function.
 */
const REQUIRED_PERMISSIONS = [
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ModerateMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.AttachFiles,
  PermissionsBitField.Flags.UseExternalEmojis,
  PermissionsBitField.Flags.AddReactions,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.ManageThreads,
  PermissionsBitField.Flags.MentionEveryone,
];

module.exports = {
  isAdmin,
  isModerator,
  canManageMessages,
  isOwner,
  isServerOwner,
  getHighestRolePosition,
  canActOnTarget,
  hasPermission,
  getSecurityPermissions,
  REQUIRED_PERMISSIONS,
};
