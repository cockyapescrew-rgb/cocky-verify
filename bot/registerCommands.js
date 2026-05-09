const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");
if (!clientId) throw new Error("Missing DISCORD_CLIENT_ID");
if (!guildId) throw new Error("Missing DISCORD_GUILD_ID");

const commands = [
  new SlashCommandBuilder()
    .setName("verifyportal")
    .setDescription("Open the Cocky Portal verification page"),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  console.log("Clearing old global commands...");
  await rest.put(Routes.applicationCommands(clientId), { body: [] });

  console.log("Registering /verifyportal for this server...");
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );

  console.log("/verifyportal registered. Old /cocky cleared.");
})();