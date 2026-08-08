import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  TextInputStyle,
  type APIComponentInActionRow,
  type APIMessageComponentButtonInteraction,
  type APIModalSubmitInteraction,
  type APIModalSubmitTextInputComponent,
  type ModalSubmitLabelComponent,
} from '@discordjs/core';
import createApplicationCommand from '../../../helpers/command';
import List from '../../../utils/list';
import createCollector from '../../../helpers/collector';
import { collectors } from '../..';
import { toComponentEmoji } from '../../../utils/utils';
import { emoji } from '../../../utils/markdown';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'help',
  description: 'View all available commands',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const globalCommands = await api.applicationCommands.getGlobalCommands(interaction.application_id);

    const perPage = 5;

    const list = new List(
      true,
      ...Array.from({ length: Math.ceil(globalCommands.length / perPage) }, (_, index) =>
        globalCommands.slice(index * perPage, index * perPage + perPage),
      ),
    );

    let pages = list;
    let query: string | null = null;

    const page = pages.current ?? [];

    let commands = page
      .map(
        (c, index) =>
          `**${pages.pointer * perPage + index + 1}.** </${c.name}:${c.id}>${c.description ? `\n-# ${c.description}` : ''}`,
      )
      .join('\n\n');

    const originalReply = await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.Section,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content:
                    '### Command Browser\n-# Find all the available commands through pagination or search for a specific one',
                },
              ],
              accessory: {
                type: ComponentType.Button,
                custom_id: 'commands-search',
                emoji: toComponentEmoji('Search'),
                style: ButtonStyle.Secondary,
              },
            },
          ],
        },
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: commands,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  custom_id: 'commands-prev',
                  emoji: toComponentEmoji('Previous'),
                  style: ButtonStyle.Secondary,
                },
                {
                  type: ComponentType.Button,
                  custom_id: 'commands-next',
                  emoji: toComponentEmoji('Next'),
                  style: ButtonStyle.Secondary,
                },
              ],
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = createCollector<APIMessageComponentButtonInteraction | APIModalSubmitInteraction>({
      key: 'commands',
      filter: (i) =>
        i.message?.id === originalReply.id &&
        (i.user?.id ?? i.member?.user.id) === (interaction.user?.id ?? interaction.member?.user.id),
      duration: 5 * 60 * 1000,
    });

    collectors.add(collector);

    collector.on('collect', async (i) => {
      switch (i.data.custom_id) {
        case 'commands-prev': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          pages.back();

          commands = (pages.current ?? [])
            .map(
              (c, index) =>
                `**${pages.pointer * perPage + index + 1}.** </${c.name}:${c.id}>${c.description ? `\n-# ${c.description}` : ''}`,
            )
            .join('\n\n');

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.Section,
                    components: [
                      {
                        type: ComponentType.TextDisplay,
                        content:
                          pages !== pages
                            ? `### Command Browser\n-# Search results for **${query}**`
                            : '### Command Browser\n-# Find all the available commands through pagination or search for a specific one',
                      },
                    ],
                    accessory: {
                      type: ComponentType.Button,
                      custom_id: 'commands-search',
                      emoji: toComponentEmoji('Search'),
                      style: ButtonStyle.Secondary,
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: commands,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-prev',
                        emoji: toComponentEmoji('Previous'),
                        style: ButtonStyle.Secondary,
                      },
                      ...(pages !== pages
                        ? ([
                            {
                              type: ComponentType.Button,
                              custom_id: 'commands-back',
                              emoji: toComponentEmoji('Home'),
                              style: ButtonStyle.Secondary,
                            },
                          ] satisfies APIComponentInActionRow[])
                        : []),
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-next',
                        emoji: toComponentEmoji('Next'),
                        style: ButtonStyle.Secondary,
                      },
                    ],
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
        case 'commands-next': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          pages.next();

          commands = (pages.current ?? [])
            .map(
              (c, index) =>
                `**${pages.pointer * perPage + index + 1}.** </${c.name}:${c.id}>${c.description ? `\n-# ${c.description}` : ''}`,
            )
            .join('\n\n');

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.Section,
                    components: [
                      {
                        type: ComponentType.TextDisplay,
                        content:
                          pages !== pages
                            ? `### Command Browser\n-# Search results for **${query}**`
                            : '### Command Browser\n-# Find all the available commands through pagination or search for a specific one',
                      },
                    ],
                    accessory: {
                      type: ComponentType.Button,
                      custom_id: 'commands-search',
                      emoji: toComponentEmoji('Search'),
                      style: ButtonStyle.Secondary,
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: commands,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-prev',
                        emoji: toComponentEmoji('Previous'),
                        style: ButtonStyle.Secondary,
                      },
                      ...(pages !== pages
                        ? ([
                            {
                              type: ComponentType.Button,
                              custom_id: 'commands-back',
                              emoji: toComponentEmoji('Home'),
                              style: ButtonStyle.Secondary,
                            },
                          ] satisfies APIComponentInActionRow[])
                        : []),
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-next',
                        emoji: toComponentEmoji('Next'),
                        style: ButtonStyle.Secondary,
                      },
                    ],
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
        case 'commands-search': {
          await api.interactions.createModal(i.id, i.token, {
            title: 'Command Search',
            custom_id: 'commands-search-modal',
            components: [
              {
                type: ComponentType.Label,
                label: 'Search for commands by name',
                component: {
                  type: ComponentType.TextInput,
                  custom_id: 'commands-search-input',
                  placeholder: 'Write down the command name to search for',
                  style: TextInputStyle.Short,
                  required: true,
                },
              },
            ],
          });

          break;
        }
        case 'commands-search-modal': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          const name =
            (i as APIModalSubmitInteraction).data.components?.[0]?.type === ComponentType.Label
              ? (
                  ((i as APIModalSubmitInteraction).data.components[0] as ModalSubmitLabelComponent)
                    .component as APIModalSubmitTextInputComponent
                ).value
              : undefined;

          if (!name?.trim().toLowerCase()) return;

          const results = globalCommands.filter((c) => c.name.trim().toLowerCase().includes(name.trim().toLowerCase()));

          if (results.length === 0) {
            await api.interactions.followUp(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} No results found for the given name`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }

          pages = new List(
            true,
            ...Array.from({ length: Math.ceil(results.length / perPage) }, (_, index) =>
              results.slice(index * perPage, index * perPage + perPage),
            ),
          );
          query = name.trim().toLowerCase();

          commands = (pages.current ?? [])
            .map(
              (c, index) =>
                `**${pages.pointer * perPage + index + 1}.** </${c.name}:${c.id}>${c.description ? `\n-# ${c.description}` : ''}`,
            )
            .join('\n\n');

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.Section,
                    components: [
                      {
                        type: ComponentType.TextDisplay,
                        content: `### Command Browser\n-# Search results for **${query}**`,
                      },
                    ],
                    accessory: {
                      type: ComponentType.Button,
                      custom_id: 'commands-search',
                      emoji: toComponentEmoji('Search'),
                      style: ButtonStyle.Secondary,
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: commands,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-prev',
                        emoji: toComponentEmoji('Previous'),
                        style: ButtonStyle.Secondary,
                      },
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-back',
                        emoji: toComponentEmoji('Home'),
                        style: ButtonStyle.Secondary,
                      },
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-next',
                        emoji: toComponentEmoji('Next'),
                        style: ButtonStyle.Secondary,
                      },
                    ],
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
        case 'commands-back': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          pages = pages;
          query = null;

          commands = (pages.current ?? [])
            .map(
              (c, index) =>
                `**${pages.pointer * perPage + index + 1}.** </${c.name}:${c.id}>${c.description ? `\n-# ${c.description}` : ''}`,
            )
            .join('\n\n');

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.Section,
                    components: [
                      {
                        type: ComponentType.TextDisplay,
                        content:
                          '### Command Browser\n-# Find all the available commands through pagination or search for a specific one',
                      },
                    ],
                    accessory: {
                      type: ComponentType.Button,
                      custom_id: 'commands-search',
                      emoji: toComponentEmoji('Search'),
                      style: ButtonStyle.Secondary,
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: commands,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-prev',
                        emoji: toComponentEmoji('Previous'),
                        style: ButtonStyle.Secondary,
                      },
                      {
                        type: ComponentType.Button,
                        custom_id: 'commands-next',
                        emoji: toComponentEmoji('Next'),
                        style: ButtonStyle.Secondary,
                      },
                    ],
                  },
                ],
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
      }
    });

    collector.once('end', async () => {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.Section,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      pages !== pages
                        ? `### Command Browser\n-# Search results for **${query}**`
                        : '### Command Browser\n-# Find all the available commands through pagination or search for a specific one',
                  },
                ],
                accessory: {
                  type: ComponentType.Button,
                  custom_id: 'commands-search',
                  emoji: toComponentEmoji('Search'),
                  style: ButtonStyle.Secondary,
                  disabled: true,
                },
              },
            ],
          },
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: commands,
              },
              {
                type: ComponentType.Separator,
              },
              {
                type: ComponentType.TextDisplay,
                content: `-# Page **${pages.pointer + 1}** of **${pages.length}**`,
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    custom_id: 'commands-prev',
                    emoji: toComponentEmoji('Previous'),
                    style: ButtonStyle.Secondary,
                    disabled: true,
                  },
                  ...(pages !== pages
                    ? ([
                        {
                          type: ComponentType.Button,
                          custom_id: 'commands-back',
                          emoji: toComponentEmoji('Home'),
                          style: ButtonStyle.Secondary,
                          disabled: true,
                        },
                      ] satisfies APIComponentInActionRow[])
                    : []),
                  {
                    type: ComponentType.Button,
                    custom_id: 'commands-next',
                    emoji: toComponentEmoji('Next'),
                    style: ButtonStyle.Secondary,
                    disabled: true,
                  },
                ],
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    });
  },
});
