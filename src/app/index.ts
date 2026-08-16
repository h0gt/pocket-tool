import { REST } from '@discordjs/rest';
import env from '../utils/env';
import {
  API,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationWebhookEventType,
  ApplicationWebhookType,
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
  type APIWebhookEvent,
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
  type Component,
  type MessageContextMenuCommand,
  type ModalComponent,
  type PrimaryEntryPointCommand,
  type SelectMenuComponent,
  type UserContextMenuCommand,
} from '../types/types';
import { emoji, hyperlink, timestamp } from '../utils/markdown';
import {
  getChatInputOption,
  parseCommandOptions,
  parseComponentArgs,
  readDirectory,
  transformCommand,
} from '../utils/utils';
import path from 'path';
import { verify } from 'discord-verify/node';
import { redis } from '../utils/redis';
import { Temporal } from '@js-temporal/polyfill';
import { MESSAGE_BLOCK_REASONS, SUPPORT } from '../types/constants';
import { subtle } from 'crypto';
import { collectors } from '../builders/collector';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();

await readDirectory(path.join(process.cwd(), 'src', 'app', 'commands'));
await readDirectory(path.join(process.cwd(), 'src', 'app', 'components'));

const rest = new REST().setToken(env.get('token', true).toString());
const api = new API(rest);

const app = new Hono();

// webhook events
app.post('/events', async (c) => {
  const signature = c.req.header('X-Signature-Ed25519');
  const timestamp = c.req.header('X-Signature-Timestamp');
  const raw = await c.req.text();

  if (!signature || !timestamp) {
    return c.json({ error: 'missing signature or timestamp' }, 400);
  }

  const isValid = await verify(raw, signature, timestamp, env.get('discord_public_key', true).toString(), subtle);

  if (!isValid) {
    return c.json({ error: 'invalid request signature' }, 401);
  }

  const body = JSON.parse(raw);
  const webhook = body as APIWebhookEvent;

  switch (webhook.type) {
    case ApplicationWebhookType.Ping: {
      return c.body(null, 204);
    }
    case ApplicationWebhookType.Event: {
      c.status(204);

      switch (webhook.event.type) {
        case ApplicationWebhookEventType.EntitlementCreate: {
          if (webhook.event.data.sku_id === '1538163894256930917') {
            await api.channels.createMessage('1533439027657572435', {
              content: `<@${webhook.event.data.user_id}> has just purchased the premium subscription!`,
            });

            const member = await api.guilds
              .getMember('1533439024637939792', webhook.event.data.user_id!)
              .catch(() => null);

            if (member) {
              await api.guilds.addRoleToMember(
                '1533439024637939792',
                webhook.event.data.user_id!,
                '1538175871985127495',
              );
            }
          }

          break;
        }
        case ApplicationWebhookEventType.EntitlementUpdate: {
          if (webhook.event.data.sku_id === '1538163894256930917') {
            const member = await api.guilds
              .getMember('1533439024637939792', webhook.event.data.user_id!)
              .catch(() => null);

            if (member) {
              await api.guilds.removeRoleFromMember(
                '1533439024637939792',
                webhook.event.data.user_id!,
                '1538175871985127495',
              );
            }
          }

          break;
        }
      }

      return c.body(null, 204);
    }
  }
});

// commands and components
app.post('/interactions', async (c) => {
  const signature = c.req.header('X-Signature-Ed25519');
  const timestamp = c.req.header('X-Signature-Timestamp');
  const raw = await c.req.text();

  if (!signature || !timestamp) {
    return c.json({ error: 'missing signature or timestamp' }, 400);
  }

  const isValid = await verify(raw, signature, timestamp, env.get('discord_public_key', true).toString(), subtle);

  if (!isValid) {
    return c.json({ error: 'invalid request signature' }, 401);
  }

  const body = JSON.parse(raw);
  const interaction = body as APIInteraction;

  console.log(
    `Received interaction: ${interaction.id} (${InteractionType[interaction.type]}) from ${interaction.user?.username ?? interaction.member?.user.username} (${interaction.user?.id ?? interaction.member?.user.id})`,
  );

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
      return c.json({ error: 'unknown interaction type' }, 400);
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

    const targets =
      subcommands.length > 0 ? subcommands.map((subcommand) => (subcommand.options ??= [])) : [command.options];

    for (const options of targets) {
      if (!options.some((o) => o.name === 'ephemeral')) {
        options.push({
          type: ApplicationCommandOptionType.Boolean,
          name: 'ephemeral',
          description: 'Whether the response should only be visible to you',
        } satisfies BooleanChatInputOption);
      }
    }
  });

  const applicationId = atob(env.get('token', true).toString().split('.')[0]!);

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
    await api.applicationCommands.bulkOverwriteGlobalCommands(
      atob(env.get('token', true).toString().split('.')[0]!),
      globalCommands,
    );
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

  if (!command) {
    return;
  }

  const devIds = env.get('dev_ids', true).toArray();

  if (
    'dev' in command &&
    command.dev === true &&
    !devIds.includes(interaction.user?.id ?? interaction.member?.user.id)
  ) {
    return;
  }

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

  switch (interaction.data.type) {
    case ApplicationCommandType.ChatInput: {
      const chatInput = command as ChatInputCommand;

      const ephemeral =
        (
          getChatInputOption(
            interaction.data.options ?? [],
            'ephemeral',
          ) as APIApplicationCommandInteractionDataBooleanOption
        )?.value === true;

      if (chatInput.acknowledge === true) {
        await api.interactions.defer(interaction.id, interaction.token, {
          flags: chatInput.ephemeral || ephemeral ? MessageFlags.Ephemeral : undefined,
        });
      }

      if (!cooldowns.has(interaction.data.name)) {
        cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());
      }

      const now = new Date().getTime();
      const timestamps = cooldowns.get(interaction.data.name)!;
      const cooldown = (chatInput.cooldown ?? 0) * 1000;

      if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
        const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)! + cooldown;

        if (now < expiration) {
          if (chatInput.acknowledge) {
            await api.interactions.editReply(interaction.application_id, interaction.token, {
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
              flags: MessageFlags.IsComponentsV2,
            });
          } else {
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
          }

          return;
        }
      }

      timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
      setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

      try {
        await chatInput.run(
          interaction as APIChatInputApplicationCommandInteraction,
          parseCommandOptions(interaction as APIChatInputApplicationCommandInteraction),
          api,
        );
      } catch (error) {
        const code = (error as any).code;
        const err = MESSAGE_BLOCK_REASONS[code as keyof typeof MESSAGE_BLOCK_REASONS];

        if (err) {
          if (chatInput.acknowledge) await api.interactions.deleteReply(interaction.application_id, interaction.token);

          await api.interactions.followUp(interaction.application_id, interaction.token, {
            content: `-# </${interaction.data.name}:${interaction.data.id}> was blocked due to ${hyperlink(err.article, err.reason)} - please try again with **ephemeral** enabled`,
            flags: MessageFlags.Ephemeral,
          });

          return;
        }

        console.error(`Command ${interaction.data.name} encountered an error:`, error);

        if (chatInput.acknowledge) {
          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
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
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }

        return;
      }

      break;
    }
    case ApplicationCommandType.Message: {
      const messageContext = command as MessageContextMenuCommand;

      if (messageContext.acknowledge) {
        await api.interactions.defer(interaction.id, interaction.token, {
          flags: messageContext.ephemeral ? MessageFlags.Ephemeral : undefined,
        });
      }

      if (!cooldowns.has(interaction.data.name)) {
        cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());
      }

      const now = new Date().getTime();
      const timestamps = cooldowns.get(interaction.data.name)!;
      const cooldown = (messageContext.cooldown ?? 0) * 1000;

      if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
        const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)!;

        if (now < expiration) {
          if (messageContext.acknowledge) {
            await api.interactions.editReply(interaction.application_id, interaction.token, {
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
              flags: MessageFlags.IsComponentsV2,
            });
          } else {
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
          }

          return;
        }
      }

      timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
      setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

      try {
        await messageContext.run(interaction as APIMessageApplicationCommandInteraction, api);
      } catch (error) {
        const code = (error as any).code;
        const err = MESSAGE_BLOCK_REASONS[code as keyof typeof MESSAGE_BLOCK_REASONS];

        if (err) {
          if (messageContext.acknowledge)
            await api.interactions.deleteReply(interaction.application_id, interaction.token);

          await api.interactions.followUp(interaction.application_id, interaction.token, {
            content: `-# </${interaction.data.name}:${interaction.data.id}> was blocked due to ${hyperlink(err.article, err.reason)}`,
            flags: MessageFlags.Ephemeral,
          });

          return;
        }

        console.error(`Command ${interaction.data.name} encountered an error:`, error);

        if (messageContext.acknowledge) {
          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
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
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }

        return;
      }

      break;
    }
    case ApplicationCommandType.User: {
      const userContext = command as UserContextMenuCommand;

      if (userContext.acknowledge) {
        await api.interactions.defer(interaction.id, interaction.token, {
          flags: userContext.ephemeral ? MessageFlags.Ephemeral : undefined,
        });
      }

      if (!cooldowns.has(interaction.data.name)) {
        cooldowns.set(interaction.data.name, new Collection<Snowflake, number>());
      }

      const now = new Date().getTime();
      const timestamps = cooldowns.get(interaction.data.name)!;
      const cooldown = (userContext.cooldown ?? 0) * 1000;

      if (timestamps.has((interaction.user?.id ?? interaction.member?.user.id)!)) {
        const expiration = timestamps.get((interaction.user?.id ?? interaction.member?.user.id)!)!;

        if (now < expiration) {
          if (userContext.acknowledge) {
            await api.interactions.editReply(interaction.application_id, interaction.token, {
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
          } else {
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
          }

          return;
        }
      }

      timestamps.set((interaction.user?.id ?? interaction.member?.user.id)!, now);
      setTimeout(() => timestamps.delete((interaction.user?.id ?? interaction.member?.user.id)!), cooldown);

      try {
        await userContext.run(interaction as APIUserApplicationCommandInteraction, api);
      } catch (error) {
        const code = (error as any).code;
        const err = MESSAGE_BLOCK_REASONS[code as keyof typeof MESSAGE_BLOCK_REASONS];

        if (err) {
          if (userContext.acknowledge)
            await api.interactions.deleteReply(interaction.application_id, interaction.token);

          await api.interactions.followUp(interaction.application_id, interaction.token, {
            content: `-# </${interaction.data.name}:${interaction.data.id}> was blocked due to ${hyperlink(err.article, err.reason)}`,
            flags: MessageFlags.Ephemeral,
          });

          return;
        }

        console.error(`Command ${interaction.data.name} encountered an error:`, error);

        if (userContext.acknowledge) {
          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
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
                    content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **${hyperlink(SUPPORT, 'support server', '', false)}**`,
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }

        return;
      }

      break;
    }
    case ApplicationCommandType.PrimaryEntryPoint: {
      const primaryEntryPoint = command as PrimaryEntryPointCommand;

      if (primaryEntryPoint.run) {
        try {
          await primaryEntryPoint.run(interaction as APIPrimaryEntryPointCommandInteraction, api);
        } catch (error) {
          console.error(`Command ${interaction.data.name} encountered an error:`, error);
        }
      }

      break;
    }
  }

  // analytics
  const now = Temporal.Now.zonedDateTimeISO('America/Sao_Paulo');

  const analyticsDate = now.hour < 21 ? now.subtract({ days: 1 }) : now;

  const day = analyticsDate.toPlainDate().toString();
  const hour = String(now.hour).padStart(2, '0');
  const minute = String(now.minute).padStart(2, '0');

  let nextReset = now.with({
    hour: 21,
    minute: 0,
    second: 0,
    millisecond: 0,
    microsecond: 0,
    nanosecond: 0,
  });

  if (Temporal.ZonedDateTime.compare(now, nextReset) >= 0) {
    nextReset = nextReset.add({ days: 1 });
  }

  const secondsUntilReset = Math.ceil((nextReset.epochMilliseconds - now.epochMilliseconds) / 1000);

  const keys = [
    `analytics:commands:day:${day}`,
    `analytics:commands:hour:${day}:${hour}`,
    `analytics:commands:minute:${day}:${hour}:${minute}`,
  ];

  for (const key of keys) {
    const exists = await redis.exists(key);

    await redis.incr(key);

    if (!exists) {
      await redis.expire(key, secondsUntilReset);
    }
  }

  const commandKey = `analytics:commands:usage:${interaction.data.id}:day:${day}`;

  if (!(await redis.exists(commandKey))) {
    await redis.hSet(commandKey, {
      id: interaction.data.id,
      name: interaction.data.name,
      uses: 0,
    });

    await redis.expire(commandKey, secondsUntilReset);
  }

  await redis.hIncrBy(commandKey, 'uses', 1);
}

async function handleChatInputCommandAutocomplete(interaction: APIApplicationCommandAutocompleteInteraction, api: API) {
  const command = commands.get(interaction.data.name) as ChatInputCommand;

  if (!command || !command.autocomplete) {
    return;
  }

  try {
    await command.autocomplete(interaction, api);
  } catch (error) {
    console.error(`Autocomplete for command ${interaction.data.name} encountered an error:`, error);
  }
}

async function handleButtonComponent(interaction: APIMessageComponentButtonInteraction, api: API) {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) {
    return;
  }

  const button = components.get(customId) as ButtonComponent;

  if (!button) {
    await Promise.all(Array.from(collectors, (collector) => collector.collect(interaction)));

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

  if (!customId) {
    return;
  }

  const selectMenu = components.get(customId) as SelectMenuComponent;

  if (!selectMenu) {
    await Promise.all(Array.from(collectors, (collector) => collector.collect(interaction)));

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

  if (!customId) {
    return;
  }

  const modal = components.get(customId) as ModalComponent;

  if (!modal) {
    await Promise.all(Array.from(collectors, (collector) => collector.collect(interaction)));

    return;
  }

  try {
    await modal.run(interaction, parseComponentArgs(modal, args), api);
  } catch (error) {
    console.error(`Modal ${customId} encountered an error:`, error);
  }
}
