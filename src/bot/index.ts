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
import { getChatInputOption, localizeCommand, parseCommandOptions, parseComponentArgs, readDirectory } from '../utils/utils';
import path from 'path';
import { verify } from 'discord-verify/node';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();

await readDirectory(path.join(process.cwd(), 'src', 'bot', 'commands'));
await readDirectory(path.join(process.cwd(), 'src', 'bot', 'components'));

const rest = new REST().setToken(env.get('token', true).toString());
const api = new API(rest);

const app = new Hono();

app.post('/interactions', async (c) => {
  const signature = c.req.header('X-Signature-Ed25519');
  const timestamp = c.req.header('X-Signature-Timestamp');
  const rawBody = await c.req.text();

  if (!signature || !timestamp) {
    return c.body('missing signature or timestamp', 400);
  }

  const isValid = await verify(rawBody, signature, timestamp, env.get('discord_public_key', true).toString(), crypto.subtle);

  if (!isValid) {
    return c.body('invalid request signature', 401);
  }

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
              content: `${emoji('Exclamation')} The bot is currently under maintenance - please try again later`,
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
  port: env.get('port', true).toNumber(),
  fetch: app.fetch,
});

console.log(`Pocket Tool listening on port ${env.get('port', true).toNumber()}`);

if (env.get('register_commands').toBoolean() === true) {
  console.log('Refreshing application (/) commands');

  for (const command of commands.values()) {
    if (command.type !== ApplicationCommandType.ChatInput) continue;

    command.options ??= [];

    const subcommands = command.options.flatMap((option) => {
      if (option.type === ApplicationCommandOptionType.Subcommand) return [option];
      if (option.type === ApplicationCommandOptionType.SubcommandGroup) return option.options ?? [];
      return [];
    });

    const targets = subcommands.length > 0 ? subcommands.map((s) => (s.options ??= [])) : [command.options];

    for (const options of targets) {
      if (!options.some((o) => o.name === 'incognito')) {
        options.push({
          type: ApplicationCommandOptionType.Boolean,
          name: 'incognito',
          description: 'Whether the response should only be visible to you',
        } satisfies BooleanChatInputOption);
      }
    }
  }

  const globalCommands = Array.from(commands.values())
    .filter((c) => !('guild' in c))
    .map(localizeCommand);

  if (globalCommands.length > 0) {
    await api.applicationCommands.bulkOverwriteGlobalCommands(atob(env.get('token', true).toString().split('.')[0]!), globalCommands);
  }

  const guildCommands = Array.from(commands.values()).filter((c) => 'guilds' in c);
  const guildIds = [...new Set(guildCommands.flatMap((c) => ('guilds' in c ? c.guilds : [])))];

  if (guildCommands.length > 0) {
    const applicationId = atob(env.get('token', true).toString().split('.')[0]!);

    for (const guildId of guildIds) {
      const commandsForGuild = guildCommands.filter((c) => ('guilds' in c && c.guilds ? c.guilds.includes(guildId!) : false)).map(localizeCommand);

      if (commandsForGuild.length > 0) {
        await api.applicationCommands.bulkOverwriteGuildCommands(applicationId, guildId!, commandsForGuild);
      }
    }
  }

  console.log('Application (/) commands refreshed');
}

const reply = api.interactions.reply.bind(api.interactions);

api.interactions.reply = (async (interactionId, interactionToken, body, options) => {
  if ((body.content || !!((body.flags ?? 0) & MessageFlags.IsComponentsV2)) && !body.allowed_mentions) {
    body.allowed_mentions = { parse: [] };
  }

  return reply(interactionId, interactionToken, body, options);
}) as typeof api.interactions.reply;

const editReply = api.interactions.editReply.bind(api.interactions);

api.interactions.editReply = (async (applicationId, interactionToken, callbackData, messageId, options) => {
  if ((callbackData.content || !!((callbackData.flags ?? 0) & MessageFlags.IsComponentsV2)) && !callbackData.allowed_mentions) {
    callbackData.allowed_mentions = { parse: [] };
  }

  return editReply(applicationId, interactionToken, callbackData, messageId, options);
}) as typeof api.interactions.editReply;

const followUp = api.interactions.followUp.bind(api.interactions);

api.interactions.followUp = (async (applicationId, interactionToken, body, options) => {
  if ((body.content || !!((body.flags ?? 0) & MessageFlags.IsComponentsV2)) && !body.allowed_mentions) {
    body.allowed_mentions = { parse: [] };
  }

  return followUp(applicationId, interactionToken, body, options);
}) as typeof api.interactions.followUp;

async function handleApplicationCommand(interaction: APIApplicationCommandInteraction, api: API): Promise<void> {
  const command = commands.get(interaction.data.name) as ApplicationCommand;

  if (!command) return;

  const devIds = env.get('dev_ids', true).toArray();

  if ('dev' in command && command.dev === true && !devIds.includes(interaction.user?.id ?? interaction.member?.user.id)) return;

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
                content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **__${hyperlink('https://discord.gg/V2MxaBJxgd', 'support server', '', false)}__**`,
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
                content: `${emoji('Wrong')} An error occurred while executing the command </${interaction.data.name}:${interaction.data.id}> - please try again later\n-# If you believe this is a bug, please report it at the **__${hyperlink('https://discord.gg/V2MxaBJxgd', 'support server', '', false)}__**`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  }
}

async function handleChatInputCommandAutocomplete(interaction: APIApplicationCommandAutocompleteInteraction, api: API): Promise<void> {
  const command = commands.get(interaction.data.name) as ChatInputCommand;

  if (!command || !command.autocomplete) return;

  try {
    await command.autocomplete(interaction, api);
  } catch (error) {
    console.error(`Autocomplete for command ${interaction.data.name} encountered an error:`, error);
  }
}

async function handleButtonComponent(interaction: APIMessageComponentButtonInteraction, api: API): Promise<void> {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const button = components.get(customId) as ButtonComponent;

  if (!button) return;

  if (button.acknowledge) {
    await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  }

  try {
    await button.run(interaction, parseComponentArgs(button, args), api);
  } catch (error) {
    console.error(`Button ${customId} encountered an error:`, error);
  }
}

async function handleSelectMenuComponent(interaction: APIMessageComponentSelectMenuInteraction, api: API): Promise<void> {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const selectMenu = components.get(customId) as SelectMenuComponent;

  if (!selectMenu) return;

  if (selectMenu.acknowledge) {
    await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  }

  try {
    await selectMenu.run(interaction, parseComponentArgs(selectMenu, args), api);
  } catch (error) {
    console.error(`Select menu ${customId} encountered an error:`, error);
  }
}

async function handleModalSubmit(interaction: APIModalSubmitInteraction, api: API): Promise<void> {
  const args = interaction.data.custom_id?.split('_') ?? [];
  const customId = args.shift();

  if (!customId) return;

  const modal = components.get(customId) as ModalComponent;

  if (!modal) return;

  try {
    await modal.run(interaction, parseComponentArgs(modal, args), api);
  } catch (error) {
    console.error(`Modal ${customId} encountered an error:`, error);
  }
}
