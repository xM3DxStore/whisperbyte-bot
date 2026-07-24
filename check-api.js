const { REST, Routes } = require('discord.js');
require('dotenv').config();

async function check() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = '1507882886974541845';

  try {
    // Check bot info
    const me = await rest.get(Routes.currentBotUser());
    console.log('Bot:', me.username, me.id, 'team:', me.team || 'none');
  } catch(e) { console.log('Bot info error:', e.message); }

  try {
    // Check guild commands
    const cmds = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
    console.log(`Guild commands: ${cmds.length}`);
    cmds.forEach(c => console.log(`  /${c.name} - scopes:`, c.integration_types, c.contexts));
  } catch(e) { console.log('Commands error:', e.message); }

  try {
    // Check global commands  
    const cmds = await rest.get(Routes.applicationCommands(clientId));
    console.log(`Global commands: ${cmds.length}`);
    cmds.forEach(c => console.log(`  /${c.name}`));
  } catch(e) { console.log('Global cmds error:', e.message); }

  try {
    // Check bot's guilds
    const guilds = await rest.get(Routes.userGuilds());
    console.log(`Bot is in ${guilds.length} guilds`);
    guilds.forEach(g => console.log(`  ${g.name} (${g.id}) permissions: ${g.permissions}`));
  } catch(e) { console.log('Guilds error:', e.message); }
}

check();
