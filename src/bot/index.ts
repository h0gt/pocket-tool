import { REST } from '@discordjs/rest';
import env from '../utils/env';
import { API, ComponentType, InteractionResponseType, InteractionType, MessageFlags, type APIInteraction } from '@discordjs/core/http-only';
import express from 'express';
import { verifyKeyMiddleware } from 'discord-interactions';
import { Collection } from '@discordjs/collection';
import { HighlightStyle, type ApplicationCommand, type ChatInputCommand, type Component } from '../types/types';
import { emoji, highlight } from '../utils/markdown';
import { localizeCommand, parseCommandOptions, readDirectory } from '../utils/utils';
import path from 'path';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();

await readDirectory(path.join(process.cwd(), 'src', 'bot', 'commands'));

const rest = new REST().setToken(env.get('token', true).toString());
const api = new API(rest);

const app = express();

app.post('/interactions', verifyKeyMiddleware(env.get('discord_public_key', true).toString()), async (req, res) => {
  const interaction = req.body as APIInteraction;

  if (interaction.type === InteractionType.Ping) {
    return res.send({ type: InteractionResponseType.Pong });
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    const { data } = interaction;

    const command = commands.get(data.name) as ChatInputCommand;

    if (!command) {
      await api.interactions.reply(interaction.id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('exclamation')} The command: ${highlight(interaction.data.name, HighlightStyle.Bold)} was not found`,
          },
          {
            type: ComponentType.Separator,
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });

      return;
    }

    //@ts-ignore
    await api.interactions.defer(interaction.id, interaction.token);

    // @ts-ignore
    await command.run(interaction, parseCommandOptions(interaction), api);
  }
});

app.listen(env.get('port', true).toString(), () => {
  console.log(`Listening on port ${env.get('port', true).toString()}`);
});

if (env.get('register_commands').toBoolean() === true) {
  console.log('Refreshing application (/) commands');

  const globalCommands = Array.from(commands.values())
    .filter((c) => !('guild' in c))
    .map(localizeCommand);

  if (globalCommands.length > 0) {
    await api.applicationCommands.bulkOverwriteGlobalCommands(atob(env.get('token', true).toString().split('.')[0]!), globalCommands);
  }

  const guildCommands = Array.from(commands.values()).filter((c) => 'guild' in c);
  const guildIds = [...new Set(guildCommands.map((c) => ('guild' in c ? c.guild : undefined)))];

  if (guildCommands.length > 0) {
    for (const guildId of guildIds) {
      const commandsForGuild = guildCommands.filter((c) => ('guild' in c ? c.guild === guildId : false)).map(localizeCommand);

      if (commandsForGuild.length > 0) {
        await api.applicationCommands.bulkOverwriteGuildCommands(atob(env.get('token', true).toString().split('.')[0]!), guildId!, commandsForGuild);
      }
    }
  }

  console.log('Application (/) commands refreshed');
}
