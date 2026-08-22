import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  TextInputStyle,
  type APIMessage,
  type APIMessageComponentButtonInteraction,
  type APIMessageComponentSelectMenuInteraction,
  type APIModalSubmitInteraction,
  type APIModalSubmitTextInputComponent,
  type ModalSubmitLabelComponent,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { cdn, emoji, hyperlink } from '../../../utils/markdown';
import type { ColorKey, EffectKey, FontKey, SizeKey } from '../../../utils/card';
import createCollector from '../../../builders/collector';
import { Collection } from '@discordjs/collection';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { toComponentEmoji } from '../../../utils/utils';
import { isHex, shuffle, type Hexadecimal } from '@tolga1452/toolbox.js';

type Session = {
  avatar: Buffer;
  font: FontKey;
  size: SizeKey | number;
  color: ColorKey | Hexadecimal;
  effects: EffectKey[];
  content: string;
  emojis: Record<string, Buffer>;
};

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Quote This Message',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, api) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

    if (message?.message_snapshots && message.message_snapshots.length > 0) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Forwarded messages are currently not supported`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    if (!message || !message.content.trim()) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select a message with text to quote`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const { CARD_COLORS, CARD_EFFECTS, CARD_FONTS, CARD_SIZES, renderQuoteCard } = await import('../../../utils/card');

    const randomizeSession = (session: Session): Session => {
      const random = <T extends Record<string, unknown>>(obj: T): keyof T => {
        const keys = Object.keys(obj) as (keyof T)[];
        return keys[Math.floor(Math.random() * keys.length)]!;
      };

      session.font = random(CARD_FONTS) as FontKey;
      session.size = random(CARD_SIZES) as SizeKey;
      session.color = random(CARD_COLORS) as ColorKey;
      session.effects = shuffle(Object.keys(CARD_EFFECTS) as EffectKey[]).slice(0, Math.floor(Math.random() * 4));

      return session;
    };

    const avatar = await makeRequest(
      message.author.avatar
        ? cdn(`/avatars/${message.author.id}/${message.author.avatar}`, 4096, 'webp', false)
        : cdn(`/embed/avatars/${Number(BigInt(message.author.id) >> 22n) % 6}`, 4096, 'png'),
      {
        method: RequestMethod.GET,
        response: ResponseType.BUFFER,
      },
    );

    const sessions = new Collection<string, Session>();

    const quote = await resolveContent(message);

    sessions.set(interaction.token, {
      avatar,
      font: 'modern',
      size: 'auto',
      color: 'auto',
      effects: [],
      content: quote.content,
      emojis: quote.emojis,
    });

    const session = sessions.get(interaction.token);

    if (!session) {
      return;
    }

    let image = await renderQuoteCard({
      avatar: session.avatar,
      quote: quote.content,
      emojis: quote.emojis,
      credit: message.author.global_name ?? message.author.username,
      mention: `@${message.author.username}`,
      font: session.font,
      size: session.size,
      color: session.color,
      effects: session.effects,
    });

    const originalReply = await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.TextDisplay,
          content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
        },
        {
          type: ComponentType.MediaGallery,
          items: [
            {
              media: {
                url: 'attachment://quote.gif',
              },
            },
          ],
        },
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: 'quote-font',
              placeholder: 'Choose a font',
              options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                label: item.label,
                description: item.description,
                value,
                default: value === session.font,
              })),
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: 'quote-size',
              placeholder: 'Choose a size ',
              options: [
                ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                  label: item.label,
                  description: item.description,
                  value,
                  default: value === session.size,
                })),
                {
                  label: 'Custom Font Size',
                  description: 'Provide a custom font size',
                  value: 'custom',
                },
                ...(!(session.size in CARD_SIZES)
                  ? [
                      {
                        label: `Custom Text Size: ${session.size}px`,
                        description: 'Currently selected custom size',
                        value: String(session.size),
                        default: true,
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: 'quote-color',
              placeholder: 'Choose a color',
              options: [
                ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                  label: item.label,
                  description: item.description,
                  value,
                  default: value === session.color,
                })),
                {
                  label: 'Custom Text Color',
                  description: 'Provide a custom text color',
                  value: 'custom',
                },
                ...(!(session.color in CARD_COLORS)
                  ? [
                      {
                        label: `Custom Text Color: ${session.color}`,
                        description: 'Currently selected custom color',
                        value: session.color,
                        default: true,
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: 'quote-effects',
              placeholder: 'Choose Some Effects!',
              min_values: 0,
              max_values: Object.keys(CARD_EFFECTS).length,
              options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                label: item.label,
                description: item.description,
                value,
                default: session.effects.includes(value as EffectKey),
              })),
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id: 'random',
              label: 'Surprise Me!',
              emoji: toComponentEmoji('Spark'),
              style: ButtonStyle.Secondary,
            },
          ],
        },
      ],
      files: [
        {
          name: 'quote.gif',
          data: image,
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = createCollector<
      APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction
    >({
      key: 'quote',
      filter: (i) =>
        i.message?.id === originalReply.id &&
        (i.user?.id ?? i.member?.user.id) === (interaction.user?.id ?? interaction.member?.user.id),
      duration: 5 * 60 * 1000,
    });

    collector.on('collect', async (i) => {
      switch (i.data.custom_id) {
        case 'quote-font': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          const font =
            (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
            (i as APIMessageComponentSelectMenuInteraction).data.values[0];

          if (font) {
            session.font = font as FontKey;

            image = await renderQuoteCard({
              avatar: session.avatar,
              quote: session.content,
              emojis: session.emojis,
              credit: message.author.global_name ?? message.author.username,
              mention: `@${message.author.username}`,
              font: session.font,
              size: session.size,
              color: session.color,
              effects: session.effects,
            });

            await api.interactions.editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
                },
                {
                  type: ComponentType.MediaGallery,
                  items: [
                    {
                      media: {
                        url: 'attachment://quote.gif',
                      },
                    },
                  ],
                },
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content:
                        '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-font',
                      placeholder: 'Choose a font',
                      options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.font,
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-size',
                      placeholder: 'Choose a size ',
                      options: [
                        ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.size,
                        })),
                        {
                          label: 'Custom Font Size',
                          description: 'Provide a custom font size',
                          value: 'custom',
                        },
                        ...(!(session.size in CARD_SIZES)
                          ? [
                              {
                                label: `Custom Text Size: ${session.size}px`,
                                description: 'Currently selected custom size',
                                value: String(session.size),
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-color',
                      placeholder: 'Choose a color',
                      options: [
                        ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.color,
                        })),
                        {
                          label: 'Custom Text Color',
                          description: 'Provide a custom text color',
                          value: 'custom',
                        },
                        ...(!(session.color in CARD_COLORS)
                          ? [
                              {
                                label: `Custom Text Color: ${session.color}`,
                                description: 'Currently selected custom color',
                                value: session.color,
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-effects',
                      placeholder: 'Choose Some Effects!',
                      min_values: 0,
                      max_values: Object.keys(CARD_EFFECTS).length,
                      options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: session.effects.includes(value as EffectKey),
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: 'random',
                      label: 'Surprise Me!',
                      emoji: toComponentEmoji('Spark'),
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
              files: [
                {
                  name: 'quote.gif',
                  data: image,
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          break;
        }
        case 'quote-size': {
          const size =
            (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
            (i as APIMessageComponentSelectMenuInteraction).data.values[0];

          if (size === 'custom') {
            await api.interactions.createModal(i.id, i.token, {
              title: 'Text Font Size Customization',
              custom_id: 'custom-font-size',
              components: [
                {
                  type: ComponentType.Label,
                  label: 'Provide a custom font size',
                  component: {
                    type: ComponentType.TextInput,
                    custom_id: 'custom-font-size-input',
                    placeholder: 'Use whole numbers from 20px to 100px',
                    style: TextInputStyle.Short,
                    required: true,
                  },
                },
              ],
            });
          } else {
            await api.interactions.deferMessageUpdate(i.id, i.token);

            session.size = size as SizeKey;

            image = await renderQuoteCard({
              avatar: session.avatar,
              quote: session.content,
              emojis: session.emojis,
              credit: message.author.global_name ?? message.author.username,
              mention: `@${message.author.username}`,
              font: session.font,
              size: session.size,
              color: session.color,
              effects: session.effects,
            });

            await api.interactions.editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
                },
                {
                  type: ComponentType.MediaGallery,
                  items: [
                    {
                      media: {
                        url: 'attachment://quote.gif',
                      },
                    },
                  ],
                },
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content:
                        '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-font',
                      placeholder: 'Choose a font',
                      options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.font,
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-size',
                      placeholder: 'Choose a size ',
                      options: [
                        ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.size,
                        })),
                        {
                          label: 'Custom Font Size',
                          description: 'Provide a custom font size',
                          value: 'custom',
                        },
                        ...(!(session.size in CARD_SIZES)
                          ? [
                              {
                                label: `Custom Text Size: ${session.size}px`,
                                description: 'Currently selected custom size',
                                value: String(session.size),
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-color',
                      placeholder: 'Choose a color',
                      options: [
                        ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.color,
                        })),
                        {
                          label: 'Custom Text Color',
                          description: 'Provide a custom text color',
                          value: 'custom',
                        },
                        ...(!(session.color in CARD_COLORS)
                          ? [
                              {
                                label: `Custom Text Color: ${session.color}`,
                                description: 'Currently selected custom color',
                                value: session.color,
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-effects',
                      placeholder: 'Choose Some Effects!',
                      min_values: 0,
                      max_values: Object.keys(CARD_EFFECTS).length,
                      options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: session.effects.includes(value as EffectKey),
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: 'random',
                      label: 'Surprise Me!',
                      emoji: toComponentEmoji('Spark'),
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
              files: [
                {
                  name: 'quote.gif',
                  data: image,
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          break;
        }
        case 'quote-color': {
          const color =
            (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
            (i as APIMessageComponentSelectMenuInteraction).data.values[0];

          if (color === 'custom') {
            await api.interactions.createModal(i.id, i.token, {
              title: 'Text Color Customization',
              custom_id: 'custom-color',
              components: [
                {
                  type: ComponentType.Label,
                  label: 'Provide a custom color',
                  component: {
                    type: ComponentType.TextInput,
                    custom_id: 'custom-color-input',
                    placeholder: 'Use a hex color code',
                    style: TextInputStyle.Short,
                    required: true,
                    min_length: 1,
                    max_length: 6,
                  },
                },
              ],
            });
          } else {
            await api.interactions.deferMessageUpdate(i.id, i.token);

            session.color = color as ColorKey;

            image = await renderQuoteCard({
              avatar: session.avatar,
              quote: session.content,
              emojis: session.emojis,
              credit: message.author.global_name ?? message.author.username,
              mention: `@${message.author.username}`,
              font: session.font,
              size: session.size,
              color: session.color,
              effects: session.effects,
            });

            await api.interactions.editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
                },
                {
                  type: ComponentType.MediaGallery,
                  items: [
                    {
                      media: {
                        url: 'attachment://quote.gif',
                      },
                    },
                  ],
                },
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content:
                        '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-font',
                      placeholder: 'Choose a font',
                      options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.font,
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-size',
                      placeholder: 'Choose a size ',
                      options: [
                        ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.size,
                        })),
                        {
                          label: 'Custom Font Size',
                          description: 'Provide a custom font size',
                          value: 'custom',
                        },
                        ...(!(session.size in CARD_SIZES)
                          ? [
                              {
                                label: `Custom Text Size: ${session.size}px`,
                                description: 'Currently selected custom size',
                                value: String(session.size),
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-color',
                      placeholder: 'Choose a color',
                      options: [
                        ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.color,
                        })),
                        {
                          label: 'Custom Text Color',
                          description: 'Provide a custom text color',
                          value: 'custom',
                        },
                        ...(!(session.color in CARD_COLORS)
                          ? [
                              {
                                label: `Custom Text Color: ${session.color}`,
                                description: 'Currently selected custom color',
                                value: session.color,
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-effects',
                      placeholder: 'Choose Some Effects!',
                      min_values: 0,
                      max_values: Object.keys(CARD_EFFECTS).length,
                      options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: session.effects.includes(value as EffectKey),
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: 'random',
                      label: 'Surprise Me!',
                      emoji: toComponentEmoji('Spark'),
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
              files: [
                {
                  name: 'quote.gif',
                  data: image,
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          break;
        }
        case 'quote-effects': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          const effects =
            (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
            (i as APIMessageComponentSelectMenuInteraction).data.values;

          if (effects) {
            session.effects = effects as EffectKey[];

            image = await renderQuoteCard({
              avatar: session.avatar,
              quote: session.content,
              emojis: session.emojis,
              credit: message.author.global_name ?? message.author.username,
              mention: `@${message.author.username}`,
              font: session.font,
              size: session.size,
              color: session.color,
              effects: session.effects,
            });

            await api.interactions.editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
                },
                {
                  type: ComponentType.MediaGallery,
                  items: [
                    {
                      media: {
                        url: 'attachment://quote.gif',
                      },
                    },
                  ],
                },
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content:
                        '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-font',
                      placeholder: 'Choose a font',
                      options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.font,
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-size',
                      placeholder: 'Choose a size ',
                      options: [
                        ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.size,
                        })),
                        {
                          label: 'Custom Font Size',
                          description: 'Provide a custom font size',
                          value: 'custom',
                        },
                        ...(!(session.size in CARD_SIZES)
                          ? [
                              {
                                label: `Custom Text Size: ${session.size}px`,
                                description: 'Currently selected custom size',
                                value: String(session.size),
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-color',
                      placeholder: 'Choose a color',
                      options: [
                        ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.color,
                        })),
                        {
                          label: 'Custom Text Color',
                          description: 'Provide a custom text color',
                          value: 'custom',
                        },
                        ...(!(session.color in CARD_COLORS)
                          ? [
                              {
                                label: `Custom Text Color: ${session.color}`,
                                description: 'Currently selected custom color',
                                value: session.color,
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-effects',
                      placeholder: 'Choose Some Effects!',
                      min_values: 0,
                      max_values: Object.keys(CARD_EFFECTS).length,
                      options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: session.effects.includes(value as EffectKey),
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: 'random',
                      label: 'Surprise Me!',
                      emoji: toComponentEmoji('Spark'),
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
              files: [
                {
                  name: 'quote.gif',
                  data: image,
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            });
            await api.interactions.editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
                },
                {
                  type: ComponentType.MediaGallery,
                  items: [
                    {
                      media: {
                        url: 'attachment://quote.gif',
                      },
                    },
                  ],
                },
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content:
                        '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-font',
                      placeholder: 'Choose a font',
                      options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.font,
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-size',
                      placeholder: 'Choose a size ',
                      options: [
                        ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.size,
                        })),
                        {
                          label: 'Custom Font Size',
                          description: 'Provide a custom font size',
                          value: 'custom',
                        },
                        ...(!(session.size in CARD_SIZES)
                          ? [
                              {
                                label: `Custom Text Size: ${session.size}px`,
                                description: 'Currently selected custom size',
                                value: String(session.size),
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-color',
                      placeholder: 'Choose a color',
                      options: [
                        ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                          label: item.label,
                          description: item.description,
                          value,
                          default: value === session.color,
                        })),
                        {
                          label: 'Custom Text Color',
                          description: 'Provide a custom text color',
                          value: 'custom',
                        },
                        ...(!(session.color in CARD_COLORS)
                          ? [
                              {
                                label: `Custom Text Color: ${session.color}`,
                                description: 'Currently selected custom color',
                                value: session.color,
                                default: true,
                              },
                            ]
                          : []),
                      ],
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: 'quote-effects',
                      placeholder: 'Choose Some Effects!',
                      min_values: 0,
                      max_values: Object.keys(CARD_EFFECTS).length,
                      options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: session.effects.includes(value as EffectKey),
                      })),
                    },
                  ],
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.Button,
                      custom_id: 'random',
                      label: 'Surprise Me!',
                      emoji: toComponentEmoji('Spark'),
                      style: ButtonStyle.Secondary,
                    },
                  ],
                },
              ],
              files: [
                {
                  name: 'quote.gif',
                  data: image,
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            });
          }

          break;
        }
        case 'random': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          Object.assign(session, randomizeSession(session));

          image = await renderQuoteCard({
            avatar: session.avatar,
            quote: session.content,
            emojis: session.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: session.font,
            size: session.size,
            color: session.color,
            effects: session.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
              },
              {
                type: ComponentType.MediaGallery,
                items: [
                  {
                    media: {
                      url: 'attachment://quote.gif',
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-font',
                    placeholder: 'Choose a font',
                    options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: value === session.font,
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-size',
                    placeholder: 'Choose a size ',
                    options: [
                      ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
                      ...(!(session.size in CARD_SIZES)
                        ? [
                            {
                              label: `Custom Text Size: ${session.size}px`,
                              description: 'Currently selected custom size',
                              value: String(session.size),
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-color',
                    placeholder: 'Choose a color',
                    options: [
                      ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
                      ...(!(session.color in CARD_COLORS)
                        ? [
                            {
                              label: `Custom Text Color: ${session.color}`,
                              description: 'Currently selected custom color',
                              value: session.color,
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-effects',
                    placeholder: 'Choose Some Effects!',
                    min_values: 0,
                    max_values: Object.keys(CARD_EFFECTS).length,
                    options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: session.effects.includes(value as EffectKey),
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    custom_id: 'random',
                    label: 'Surprise Me!',
                    emoji: toComponentEmoji('Spark'),
                    style: ButtonStyle.Secondary,
                  },
                ],
              },
            ],
            files: [
              {
                name: 'quote.gif',
                data: image,
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
        case 'custom-font-size': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          const size =
            (i as APIModalSubmitInteraction).data.components?.[0]?.type === ComponentType.Label
              ? parseInt(
                  (
                    ((i as APIModalSubmitInteraction).data.components[0] as ModalSubmitLabelComponent)
                      .component as APIModalSubmitTextInputComponent
                  ).value,
                  10,
                )
              : undefined;

          if (size === undefined || Number.isNaN(size) || size < 20 || size > 100) {
            await api.interactions.followUp(i.application_id, i.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} Please provide a font size between 20px and 100px`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }

          session.size = size;

          image = await renderQuoteCard({
            avatar: session.avatar,
            quote: session.content,
            emojis: session.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: session.font,
            size: session.size,
            color: session.color,
            effects: session.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
              },
              {
                type: ComponentType.MediaGallery,
                items: [
                  {
                    media: {
                      url: 'attachment://quote.gif',
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-font',
                    placeholder: 'Choose a font',
                    options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: value === session.font,
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-size',
                    placeholder: 'Choose a size ',
                    options: [
                      ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
                      ...(!(session.size in CARD_SIZES)
                        ? [
                            {
                              label: `Custom Text Size: ${session.size}px`,
                              description: 'Currently selected custom size',
                              value: String(session.size),
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-color',
                    placeholder: 'Choose a color',
                    options: [
                      ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
                      ...(!(session.color in CARD_COLORS)
                        ? [
                            {
                              label: `Custom Text Color: ${session.color}`,
                              description: 'Currently selected custom color',
                              value: session.color,
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-effects',
                    placeholder: 'Choose Some Effects!',
                    min_values: 0,
                    max_values: Object.keys(CARD_EFFECTS).length,
                    options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: session.effects.includes(value as EffectKey),
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    custom_id: 'random',
                    label: 'Surprise Me!',
                    emoji: toComponentEmoji('Spark'),
                    style: ButtonStyle.Secondary,
                  },
                ],
              },
            ],
            files: [
              {
                name: 'quote.gif',
                data: image,
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });
          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
              },
              {
                type: ComponentType.MediaGallery,
                items: [
                  {
                    media: {
                      url: 'attachment://quote.gif',
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-font',
                    placeholder: 'Choose a font',
                    options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: value === session.font,
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-size',
                    placeholder: 'Choose a size ',
                    options: [
                      ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
                      ...(!(session.size in CARD_SIZES)
                        ? [
                            {
                              label: `Custom Text Size: ${session.size}px`,
                              description: 'Currently selected custom size',
                              value: String(session.size),
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-color',
                    placeholder: 'Choose a color',
                    options: [
                      ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
                      ...(!(session.color in CARD_COLORS)
                        ? [
                            {
                              label: `Custom Text Color: ${session.color}`,
                              description: 'Currently selected custom color',
                              value: session.color,
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-effects',
                    placeholder: 'Choose Some Effects!',
                    min_values: 0,
                    max_values: Object.keys(CARD_EFFECTS).length,
                    options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: session.effects.includes(value as EffectKey),
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    custom_id: 'random',
                    label: 'Surprise Me!',
                    emoji: toComponentEmoji('Spark'),
                    style: ButtonStyle.Secondary,
                  },
                ],
              },
            ],
            files: [
              {
                name: 'quote.gif',
                data: image,
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
        case 'custom-color': {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          const color =
            (i as APIModalSubmitInteraction).data.components?.[0]?.type === ComponentType.Label
              ? (
                  ((i as APIModalSubmitInteraction).data.components[0] as ModalSubmitLabelComponent)
                    .component as APIModalSubmitTextInputComponent
                ).value
              : undefined;

          if (color === undefined || !isHex(color)) {
            await api.interactions.followUp(i.application_id, i.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `${emoji('Exclamation')} Please provide a valid hexadecimal color`,
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });

            return;
          }

          session.color = color;

          image = await renderQuoteCard({
            avatar: session.avatar,
            quote: session.content,
            emojis: session.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: session.font,
            size: session.size,
            color: session.color,
            effects: session.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
              },
              {
                type: ComponentType.MediaGallery,
                items: [
                  {
                    media: {
                      url: 'attachment://quote.gif',
                    },
                  },
                ],
              },
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content:
                      '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-font',
                    placeholder: 'Choose a font',
                    options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: value === session.font,
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-size',
                    placeholder: 'Choose a size ',
                    options: [
                      ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
                      ...(!(session.size in CARD_SIZES)
                        ? [
                            {
                              label: `Custom Text Size: ${session.size}px`,
                              description: 'Currently selected custom size',
                              value: String(session.size),
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-color',
                    placeholder: 'Choose a color',
                    options: [
                      ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                        label: item.label,
                        description: item.description,
                        value,
                        default: value === session.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
                      ...(!(session.color in CARD_COLORS)
                        ? [
                            {
                              label: `Custom Text Color: ${session.color}`,
                              description: 'Currently selected custom color',
                              value: session.color,
                              default: true,
                            },
                          ]
                        : []),
                    ],
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.StringSelect,
                    custom_id: 'quote-effects',
                    placeholder: 'Choose Some Effects!',
                    min_values: 0,
                    max_values: Object.keys(CARD_EFFECTS).length,
                    options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                      label: item.label,
                      description: item.description,
                      value,
                      default: session.effects.includes(value as EffectKey),
                    })),
                  },
                ],
              },
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    custom_id: 'random',
                    label: 'Surprise Me!',
                    emoji: toComponentEmoji('Spark'),
                    style: ButtonStyle.Secondary,
                  },
                ],
              },
            ],
            files: [
              {
                name: 'quote.gif',
                data: image,
              },
            ],
            flags: MessageFlags.IsComponentsV2,
          });

          break;
        }
      }
    });

    collector.on('end', async () => {
      sessions.delete(interaction.token);

      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `-# ${emoji('Quote')} ${hyperlink(`https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`, 'Jump to original message')}`,
          },
          {
            type: ComponentType.MediaGallery,
            items: [
              {
                media: {
                  url: 'attachment://quote.gif',
                },
              },
            ],
          },
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: '### Quote Editor\n-# Use the select menus below to customize your quote or get a random card',
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: 'quote-font',
                placeholder: 'Choose a font',
                options: Object.entries(CARD_FONTS).map(([value, item]) => ({
                  label: item.label,
                  description: item.description,
                  value,
                  default: value === session.font,
                })),
                disabled: true,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: 'quote-size',
                placeholder: 'Choose a size ',
                options: [
                  ...Object.entries(CARD_SIZES).map(([value, item]) => ({
                    label: item.label,
                    description: item.description,
                    value,
                    default: value === session.size,
                  })),
                  {
                    label: 'Custom Font Size',
                    description: 'Provide a custom font size',
                    value: 'custom',
                  },
                  ...(!(session.size in CARD_SIZES)
                    ? [
                        {
                          label: `Custom Text Size: ${session.size}px`,
                          description: 'Currently selected custom size',
                          value: String(session.size),
                          default: true,
                        },
                      ]
                    : []),
                ],
                disabled: true,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: 'quote-color',
                placeholder: 'Choose a color',
                options: [
                  ...Object.entries(CARD_COLORS).map(([value, item]) => ({
                    label: item.label,
                    description: item.description,
                    value,
                    default: value === session.color,
                  })),
                  {
                    label: 'Custom Text Color',
                    description: 'Provide a custom text color',
                    value: 'custom',
                  },
                  ...(!(session.color in CARD_COLORS)
                    ? [
                        {
                          label: `Custom Text Color: ${session.color}`,
                          description: 'Currently selected custom color',
                          value: session.color,
                          default: true,
                        },
                      ]
                    : []),
                ],
                disabled: true,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: 'quote-effects',
                placeholder: 'Choose Some Effects!',
                min_values: 0,
                max_values: Object.keys(CARD_EFFECTS).length,
                options: Object.entries(CARD_EFFECTS).map(([value, item]) => ({
                  label: item.label,
                  description: item.description,
                  value,
                  default: session.effects.includes(value as EffectKey),
                })),
                disabled: true,
              },
            ],
          },
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                custom_id: 'random',
                label: 'Surprise Me!',
                emoji: toComponentEmoji('Spark'),
                style: ButtonStyle.Secondary,
                disabled: true,
              },
            ],
          },
        ],
        files: [
          {
            name: 'quote.gif',
            data: image,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    });
  },
});

export async function resolveContent(message: APIMessage) {
  const content = message.content.trim();
  const mentions = message.mentions;

  const customEmojiRegex = /<a?:\w+:(\d+)>/g;

  const emojiIds = [...content.matchAll(customEmojiRegex)].map((match) => match[1]!);

  const emojis = Object.fromEntries(
    await Promise.all(
      emojiIds.map(async (id) => {
        const data = await makeRequest(cdn(`/emojis/${id}`, undefined, 'png', false), {
          method: RequestMethod.GET,
          response: ResponseType.BUFFER,
        });

        return [id, data] as const;
      }),
    ),
  );

  const parsedContent = content.replace(/<@!?(\d+)>/g, (_, id) => {
    const user = mentions?.find((user) => user.id === id);

    return user ? `@${user.global_name ?? user.username}` : '@unknown';
  });

  return {
    content: parsedContent,
    emojis,
  };
}
