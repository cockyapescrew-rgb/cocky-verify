require("dotenv").config({ path: ".env.local" });

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");
if (!clientId) throw new Error("Missing DISCORD_CLIENT_ID");

const commands = [
  new SlashCommandBuilder()
    .setName("verifyportal")
    .setDescription("Open the Cocky Portal verification page"),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  console.log("Registering global /verifyportal command...");

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log("/verifyportal registered globally.");
})();