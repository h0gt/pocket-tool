import { Collection } from '@discordjs/collection';
import type { ApplicationCommand, BooleanChatInputOption, Component, GatewayEvent } from '../types/types';
import {
  ActivityType,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Client,
  GatewayDispatchEvents,
  GatewayIntentBits,
  PresenceUpdateStatus,
  type GatewayDispatchPayload,
  type RESTPutAPIApplicationCommandsJSONBody,
  type RESTPutAPIApplicationGuildCommandsJSONBody,
  type Snowflake,
  type ToEventProps,
} from '@discordjs/core';
import { readDirectory, transformCommand } from '../utils/utils';
import path from 'path';
import { REST } from '@discordjs/rest';
import env from '../utils/env';
import { CompressionMethod, SimpleShardingStrategy, WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();
export const events = new Collection<string, GatewayEvent>();

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();

export const uptimes = new Collection<number, number>();
export const latencies = new Collection<number, number>();

await readDirectory(path.join(process.cwd(), 'src', 'bot', 'commands'));
await readDirectory(path.join(process.cwd(), 'src', 'bot', 'components'));
await readDirectory(path.join(process.cwd(), 'src', 'bot', 'events'));

const rest = new REST().setToken(env.get('token', true).toString());
const gateway = new WebSocketManager({
  token: env.get('token', true).toString(),
  intents: GatewayIntentBits.Guilds,
  shardCount: null,
  rest,
  compression: CompressionMethod.ZlibNative,
  buildStrategy: (manager) => new SimpleShardingStrategy(manager),
});

const client = new Client({ rest, gateway });

client.on(GatewayDispatchEvents.Ready, async (payload) => {
  console.log(`Shard #${payload.shardId} is ready!`);

  await client.updatePresence(payload.shardId, {
    since: null,
    activities: [
      {
        type: ActivityType.Custom,
        name: 'shardId',
        state: `You're on shard #${payload.shardId}!`,
      },
    ],
    status: PresenceUpdateStatus.Online,
    afk: false,
  });
});

// track uptime and latency
gateway.on(WebSocketShardEvents.Ready, (_, shardId) => {
  uptimes.set(shardId, new Date().getTime());
});

gateway.on(WebSocketShardEvents.HeartbeatComplete, (payload, shardId) => {
  latencies.set(shardId, payload.latency);
});

events.forEach((event) => {
  client.on(event.type, (payload: ToEventProps<Extract<GatewayDispatchPayload, { t: typeof event.type }>['d']>) => {
    event.run(payload.data, client.api).catch((error) => {
      console.error(`An error occurred while running event ${event.type}:`, error);
    });
  });
});

await gateway.connect();

if (env.get('register_commands').toBoolean() === true) {
  console.log('Refreshing application (/) commands');

  commands.forEach((command) => {
    if (command.type !== ApplicationCommandType.ChatInput) {
      return;
    }

    command.options ??= [];

    const subcommands = command.options.flatMap((option) => {
      if (option.type === ApplicationCommandOptionType.Subcommand) {
        return [option];
      } else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
        return option.options ?? [];
      } else {
        return [];
      }
    });

    const subcommandOptions =
      subcommands.length > 0 ? subcommands.map((subcommand) => (subcommand.options ??= [])) : [command.options];

    subcommandOptions.forEach((options) => {
      if (!options.some((o) => o.name === 'ephemeral')) {
        options.push({
          type: ApplicationCommandOptionType.Boolean,
          name: 'ephemeral',
          description: 'Whether the response should only be visible to you',
        } satisfies BooleanChatInputOption);
      }
    });
  });

  const globalCommands: RESTPutAPIApplicationCommandsJSONBody = [];
  const commandsForGuilds = new Collection<string, RESTPutAPIApplicationGuildCommandsJSONBody>();

  commands.forEach((command) => {
    const resolved = transformCommand(command);

    if (!('guilds' in command)) {
      globalCommands.push(resolved);

      return;
    }

    for (const guildId of command.guilds ?? []) {
      if (resolved.type === ApplicationCommandType.PrimaryEntryPoint) {
        return;
      }

      const list = commandsForGuilds.get(guildId) ?? [];
      list.push(resolved);
      commandsForGuilds.set(guildId, list);
    }
  });

  if (globalCommands.length > 0) {
    await client.api.applicationCommands.bulkOverwriteGlobalCommands(
      atob(env.get('token', true).toString().split('.')[0]!),
      globalCommands,
    );
  }

  for (const [guildId, commandsForGuild] of commandsForGuilds) {
    if (commandsForGuild.length > 0) {
      await client.api.applicationCommands.bulkOverwriteGuildCommands(
        atob(env.get('token', true).toString().split('.')[0]!),
        guildId,
        commandsForGuild,
      );
    }
  }

  console.log('Application (/) commands refreshed');
}

// some shard utils
export async function getTotalShards(): Promise<number> {
  return await gateway.getShardCount();
}

export function getShardIdForGuildId(guildId: string, totalShards: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(totalShards));
}
