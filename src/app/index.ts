import { REST } from '@discordjs/rest';
import env from '../utils/env';
import {
  API,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIApplicationCommandInteractionDataBooleanOption,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIMessageApplicationCommandInteraction,
  type APIMessageComponentButtonInteraction,
  type APIMessageComponentSelectMenuInteraction,
  type APIModalSubmitInteraction,
  type APIPrimaryEntryPointCommandInteraction,
  type APIUserApplicationCommandInteraction,
  type RESTPutAPIApplicationCommandsJSONBody,
  type RESTPutAPIApplicationGuildCommandsJSONBody,
  type Snowflake,
} from '@discordjs/core/http-only';
import { Hono } from 'hono';
import { Collection } from '@discordjs/collection';
import {
  TimestampStyle,
  type ApplicationCommand,
  type BooleanChatInputOption,
  type ButtonComponent,
  type ChatInputCommand,
  type Collector,
  type Component,
  type MessageContextMenuCommand,
  type ModalComponent,
  type PrimaryEntryPointCommand,
  type SelectMenuComponent,
  type UserContextMenuCommand,
} from '../types/types';
import { emoji, hyperlink, timestamp } from '../utils/markdown';
import { getChatInputOption, parseCommandOptions, parseComponentArgs, readDirectory, resolveCommand } from '../utils/utils';
import path from 'path';
import { verify } from 'discord-verify/node';
import { loadFonts } from '../utils/card';
import { redis } from '../utils/redis';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();
export const collectors = new Set<Collector<any>>();

await readDirectory(path.join(process.cwd(), 'src', 'app', 'commands'));
await readDirectory(path.join(process.cwd(), 'src', 'app', 'components'));

const rest = new REST().setToken(env.get('token', true).toString());
const api = new API(rest);

loadFonts();

const app = new Hono();

app.post('/interactions', async (c) => {
  const signature = c.req.header('X-Signature-Ed25519');
  const timestamp = c.req.header('X-Signature-Timestamp');
  const rawBody = await c.req.text();

  if (!signature || !timestamp) return c.body('missing signature or timestamp', 400);

  const isValid = await verify(rawBody, signature, timestamp, env.get('discord_public_key', true).toString(), crypto.subtle);

  if (!isValid) return c.body('invalid request signature', 401);

  const body = JSON.parse(rawBody);
  const interaction = body as APIInteraction;

  console.log(
    `Received interaction: ${interaction.id} (${InteractionType[interaction.type]}) from ${interaction.user?.username ?? interaction.member?.user.username} (${interaction.user?.id ?? interaction.member?.user.id})`,
  );

  if (
    env.get('maintenance', true).toBoolean() === true &&
    !env
      .get('dev_ids', true)
      .toArray()
      .includes(interaction.user?.id ?? interaction.member?.user.id)
  ) {
    await api.interactions.reply(interaction.id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Exclamation')} The app is currently under maintenance - please try again later`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    return;
  }

  switch (interaction.type) {
    case InteractionType.Ping: {
      return c.json({ type: InteractionResponseType.Pong });
    }
    case InteractionType.ApplicationCommand: {
      await handleApplicationCommand(interaction, api);
      break;
    }
    case InteractionType.ApplicationCommandAutocomplete: {
      await handleChatInputCommandAutocomplete(interaction, api);
      break;
    }
    case InteractionType.MessageComponent: {
      if (interaction.data.component_type === ComponentType.Button) {
        await handleButtonComponent(interaction as APIMessageComponentButtonInteraction, api);
      } else {
        await handleSelectMenuComponent(interaction as APIMessageComponentSelectMenuInteraction, api);
      }
      break;
    }
    case InteractionType.ModalSubmit: {
      await handleModalSubmit(interaction as APIModalSubmitInteraction, api);
      break;
    }
    default: {
      console.log('unknown interaction type:', (interaction as any).type);
      break;
    }
  }
});

Bun.serve({
  port: env.get('port').toNumber() ?? 3000,
  fetch: app.fetch,
});

console.log(`Pocket Tool listening on port ${env.get('port').toNumber() ?? 3000}`);

if (env.get('register_commands').toBoolean() === true) {
  console.log('Refreshing application (/) commands');

  commands.forEach((c) => {
    if (c.type !== ApplicationCommandType.ChatInput) return;

    c.options ??= [];

    const subcommands = c.options.flatMap((option) => {
      if (option.type === ApplicationCommandOptionType.Subcommand) return [option];
      if (option.type === ApplicationCommandOptionType.SubcommandGroup) return option.options ?? [];
      return [];
    });

    const targets = subcommands.length > 0 ? subcommands.map((s) => (s.options ??= [])) : [c.options];

    for (const options of targets) {
      if (!options.some((o) => o.name === 'incognito')) {
        options.push({
          type: ApplicationCommandOptionType.Boolean,
          name: 'incognito',
          description: 'Whether the response should only be visible to you',
        } satisfies BooleanChatInputOption);
      }
    }
  });

  const applicationId = atob(env.get('token', true).toString().split('.')[0]!);

  const globalCommands: RESTPutAPIApplicationCommandsJSONBody = [];
  const commandsForGuilds = new Collection<string, RESTPutAPIApplicationGuildCommandsJSONBody>();

  commands.forEach((c) => {
    const resolved = resolveCommand(c);

    if (!('guilds' in c)) {
      globalCommands.push(resolved);

      return;
    }

    for (const guildId of c.guilds ?? []) {
      if (resolved.type === ApplicationCommandType.PrimaryEntryPoint) return;

      const list = commandsForGuilds.get(guildId) ?? [];
      list.push(resolved);
      commandsForGuilds.set(guildId, list);
    }
  });

  if (globalCommands.length > 0) {
    await api.applicationCommands.bulkOverwriteGlobalCommands(atob(env.get('token', true).toString().split('.')[0]!), globalCommands);
  }

  if (globalCommands.length > 0) {
    await api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, globalCommands);
  }

  for (const [guildId, commandsForGuild] of commandsForGuilds) {
    if (commandsForGuild.length > 0) {
      await api.applicationCommands.bulkOverwriteGuildCommands(applicationId, guildId, commandsForGuild);
    }
  }

  console.log('Application (/) commands refreshed');
}

async function handleApplicationCommand(interaction: APIApplicationCommandInteraction, api: API) {
  const command = commands.get(interaction.data.name) as ApplicationCommand;

  if (!command) return;

  const devIds = env.get('dev_ids', true).toArray();

  if ('dev' in command && command.dev === true && !devIds.includes(interaction.user?.id ?? interaction.member?.user.id)) return;

  const now = new Date();

  const day = now.toISOString().slice(0, 10);
  const hour = `${day}:${String(now.getHours()).padStart(2, '0')}`;
  const minute = `${hour}:${String(now.getMinutes()).padStart(2, '0')}`;

  const keys = [`analytics:commands:day:${day}`, `analytics:commands:hour:${hour}`, `analytics:commands:minute:${minute}`];

  for (const key of keys) {
    const exists = await redis.exists(key);

    await redis.incr(key);

    if (!exists) {
      await redis.expire(key, 60 * 60 * 24);
    }
  }

  const commandKey = `analytics:commands:usage:${interaction.data.id}:day:${day}`;

  if (!(await redis.exists(commandKey))) {
    await redis.hSet(commandKey, {
      id: interaction.data.id,
      name: interaction.data.name,
      uses: 0,
    });

    await redis.expire(commandKey, 60 * 60 * 24);
  }

  await redis.hIncrBy(commandKey, 'uses', 1);

  try {
    switch (interaction.data.type) {
      case ApplicationCommandType.ChatInput: {
        const chatInput = command as ChatInputCommand;

        if (!cooldowns.has(interaction.data.name)) cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());

        const now = new Date().getTime();
        const timestamps = cooldowns.get(interaction.data.name)!;
        const cooldown = (chatInput.cooldown ?? 0) * 1000;

        if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
          const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)! + cooldown;

          if (now < expiration) {
            await api.interactions.reply(interaction.id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} Please wait, you are on a cooldown for </${interaction.data.name}:${interaction.data.id}> - you can use it again ${timestamp(expiration, TimestampStyle.RelativeTime)}`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }
        }

        timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
        setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

        const incognito =
          (getChatInputOption(interaction.data.options ?? [], 'incognito') as APIApplicationCommandInteractionDataBooleanOption)?.value === true;

        if (chatInput.acknowledge === true) {
          await api.interactions.defer(interaction.id, interaction.token, {
            flags: chatInput.ephemeral || incognito ? MessageFlags.Ephemeral : undefined,
          });
        }

        await chatInput.run(
          interaction as APIChatInputApplicationCommandInteraction,
          parseCommandOptions(interaction as APIChatInputApplicationCommandInteraction),
          api,
        );
        break;
      }
      case ApplicationCommandType.Message: {
        const messageContext = command as MessageContextMenuCommand;

        if (!cooldowns.has(interaction.data.name)) cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());

        const now = new Date().getTime();
        const timestamps = cooldowns.get(interaction.data.name)!;
        const cooldown = (messageContext.cooldown ?? 0) * 1000;

        if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
          const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)!;

          if (now < expiration) {
            await api.interactions.reply(interaction.id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} Please wait, you are on a cooldown for </${interaction.data.name}:${interaction.data.id}> - you can use it again ${timestamp(expiration, TimestampStyle.RelativeTime)}`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }
        }

        timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
        setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

        if (messageContext.acknowledge) {
          await api.interactions.defer(interaction.id, interaction.token, {
            flags: messageContext.ephemeral ? MessageFlags.Ephemeral : undefined,
          });
        }

        await messageContext.run(interaction as APIMessageApplicationCommandInteraction, api);
        break;
      }
      case ApplicationCommandType.User: {
        const userContext = command as UserContextMenuCommand;

        if (!cooldowns.has(interaction.data.name)) cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());

        const now = new Date().getTime();
        const timestamps = cooldowns.get(interaction.data.name)!;
        const cooldown = (userContext.cooldown ?? 0) * 1000;

        if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
          const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)!;

          if (now < expiration) {
            await api.interactions.reply(interaction.id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} Please wait, you are on a cooldown for </${interaction.data.name}:${interaction.data.id}> - you can use it again ${timestamp(expiration, TimestampStyle.RelativeTime)}`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }
        }

        timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
        setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

        if (userContext.acknowledge) {
          await api.interactions.defer(interaction.id, interaction.token, {
            flags: userContext.ephemeral ? MessageFlags.Ephemeral : undefined,
          });
        }

        await userContext.run(interaction as APIUserApplicationCommandInteraction, api);
        break;
      }
      case ApplicationCommandType.PrimaryEntryPoint: {
        const primaryEntryPoint = command as PrimaryEntryPointCommand;

        if (primaryEntryPoint.run) {
          await primaryEntryPoint.run(interaction as APIPrimaryEntryPointCommandInteraction, api);
        }
        break;
      }
    }
  } catch (error) {
    console.error(`Command ${interaction.data.name} encountered an error:`, error);

    if ('acknowledge' in command && command.acknowledge === true) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink('https://discord.gg/V2MxaBJxgd', 'support server', '', false)}**`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } else {
      await api.interactions.reply(interaction.id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink('https://discord.gg/V2MxaBJxgd', 'support server', '', false)}**`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  }
}

async function handleChatInputCommandAutocomplete(interaction: APIApplicationCommandAutocompleteInteraction, api: API) {
  const command = commands.get(interaction.data.name) as ChatInputCommand;

  if (!command || !command.autocomplete) return;

  try {
    await command.autocomplete(interaction, api);
  } catch (error) {
    console.error(`Autocomplete for command ${interaction.data.name} encountered an error:`, error);
  }
}

async function handleButtonComponent(interaction: APIMessageComponentButtonInteraction, api: API) {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const button = components.get(customId) as ButtonComponent;

  if (!button) {
    for (const collector of collectors) await collector.collect(interaction);

    return;
  }

  if (button.acknowledge) {
    await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  }

  try {
    await button.run(interaction, parseComponentArgs(button, args), api);
  } catch (error) {
    console.error(`Button ${customId} encountered an error:`, error);
  }
}

async function handleSelectMenuComponent(interaction: APIMessageComponentSelectMenuInteraction, api: API) {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const selectMenu = components.get(customId) as SelectMenuComponent;

  if (!selectMenu) {
    for (const collector of collectors) await collector.collect(interaction);

    return;
  }

  if (selectMenu.acknowledge) {
    await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  }

  try {
    await selectMenu.run(interaction, parseComponentArgs(selectMenu, args), api);
  } catch (error) {
    console.error(`Select menu ${customId} encountered an error:`, error);
  }
}

async function handleModalSubmit(interaction: APIModalSubmitInteraction, api: API) {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const modal = components.get(customId) as ModalComponent;

  if (!modal) {
    for (const collector of collectors) await collector.collect(interaction);

    return;
  }

  try {
    await modal.run(interaction, parseComponentArgs(modal, args), api);
  } catch (error) {
    console.error(`Modal ${customId} encountered an error:`, error);
  }
}
