import {
  API,
  ApplicationCommandType,
  ComponentType,
  GatewayDispatchEvents,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIApplicationCommandInteractionDataBooleanOption,
  type APIChatInputApplicationCommandInteraction,
  type APIMessageApplicationCommandInteraction,
  type APIMessageComponentButtonInteraction,
  type APIMessageComponentSelectMenuInteraction,
  type APIModalSubmitInteraction,
  type APIPrimaryEntryPointCommandInteraction,
  type APIUserApplicationCommandInteraction,
  type Snowflake,
} from '@discordjs/core';
import createGatewayEvent from '../../builders/event';
import { commands, components, cooldowns } from '..';
import {
  TimestampStyle,
  type ApplicationCommand,
  type ButtonComponent,
  type ChatInputCommand,
  type MessageContextMenuCommand,
  type ModalComponent,
  type PrimaryEntryPointCommand,
  type SelectMenuComponent,
  type UserContextMenuCommand,
} from '../../types/types';
import env from '../../utils/env';
import { getChatInputOption, parseCommandOptions, parseComponentArgs } from '../../utils/utils';
import { Collection } from '@discordjs/collection';
import { emoji, hyperlink, timestamp } from '../../utils/markdown';
import { MESSAGE_BLOCK_REASONS, SUPPORT } from '../../types/constants';
import { redis } from '../../utils/redis';
import { collectors } from '../../builders/collector';
import { Temporal } from '@js-temporal/polyfill';

createGatewayEvent({
  type: GatewayDispatchEvents.InteractionCreate,
  async run(interaction, api) {
    console.log(
      `received interaction: ${interaction.id} (${InteractionType[interaction.type]}) from ${interaction.user?.username ?? interaction.member?.user.username} (${interaction.user?.id ?? interaction.member?.user.id})`,
    );

    switch (interaction.type) {
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
        return console.log('unknown interaction type', interaction.type);
      }
    }
  },
});

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
