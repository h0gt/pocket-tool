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
  type APIMessageComponentEmoji,
  type APIMessageComponentSelectMenuInteraction,
  type APIModalSubmitInteraction,
  type APIModalSubmitTextInputComponent,
  type APIUser,
  type ModalSubmitLabelComponent,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { cdn, emoji } from '../../../utils/markdown';
import {
  CARD_COLORS,
  CARD_EFFECTS,
  CARD_FONTS,
  CARD_SIZES,
  renderQuoteCard,
  type ColorKey,
  type EffectKey,
  type FontKey,
  type SizeKey,
} from '../../../utils/card';
import createCollector from '../../../helpers/collector';
import { collectors } from '../..';
import { Collection } from '@discordjs/collection';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { toEmoji } from '../../../utils/utils';
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
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, api) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

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

    const avatar = await makeRequest(
      message.author.avatar
        ? cdn(`/avatars/${message.author.id}/${message.author.avatar}`, 4096, 'webp', false)
        : cdn(`/embed/avatars/${Number(BigInt(message.author.id) >> 22n) % 6}`, 4096, 'webp', false),
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

    let image = await renderQuoteCard({
      avatar: sessions.get(interaction.token)!.avatar,
      quote: quote.content,
      emojis: quote.emojis,
      credit: message.author.global_name ?? message.author.username,
      mention: `@${message.author.username}`,
      font: sessions.get(interaction.token)!.font,
      size: sessions.get(interaction.token)!.size,
      color: sessions.get(interaction.token)!.color,
      effects: sessions.get(interaction.token)!.effects,
    });

    const originalMessage = await api.interactions.editReply(interaction.application_id, interaction.token, {
      files: [
        {
          name: `quote.gif`,
          data: image,
        },
      ],
      components: [
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
                default: value === sessions.get(interaction.token)!.font,
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
                  default: value === sessions.get(interaction.token)!.size,
                })),
                {
                  label: 'Custom Font Size',
                  description: 'Provide a custom font size',
                  value: 'custom',
                },
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
                  default: value === sessions.get(interaction.token)!.color,
                })),
                {
                  label: 'Custom Text Color',
                  description: 'Provide a custom text color',
                  value: 'custom',
                },
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
                default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
              emoji: toEmoji('Spark') as APIMessageComponentEmoji,
              style: ButtonStyle.Secondary,
            },
            {
              type: ComponentType.Button,
              url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
              label: 'View Original',
              emoji: toEmoji('Quote') as APIMessageComponentEmoji,
              style: ButtonStyle.Link,
            },
          ],
        },
      ],
    });

    const collector = createCollector<APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction>({
      key: 'quote',
      filter: (i) => i.message?.id === originalMessage.id && (i.user?.id ?? i.member?.user.id) === (interaction.user?.id ?? interaction.member?.user.id),
      duration: 15 * 60 * 1000,
    });

    collectors.add(collector);

    collector.on('collect', async (i) => {
      if (i.data.custom_id === 'quote-font') {
        await api.interactions.deferMessageUpdate(i.id, i.token);

        const font =
          (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
          (i as APIMessageComponentSelectMenuInteraction).data.values[0];

        if (font) {
          sessions.get(interaction.token)!.font = font as FontKey;

          image = await renderQuoteCard({
            avatar: sessions.get(interaction.token)!.avatar,
            quote: sessions.get(interaction.token)!.content,
            emojis: sessions.get(interaction.token)!.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: sessions.get(interaction.token)!.font,
            size: sessions.get(interaction.token)!.size,
            color: sessions.get(interaction.token)!.color,
            effects: sessions.get(interaction.token)!.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            files: [
              {
                name: `quote.gif`,
                data: image,
              },
            ],
            components: [
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
                      default: value === sessions.get(interaction.token)!.font,
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
                        default: value === sessions.get(interaction.token)!.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
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
                        default: value === sessions.get(interaction.token)!.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
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
                      default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                    emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                    style: ButtonStyle.Secondary,
                  },
                  {
                    type: ComponentType.Button,
                    url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                    label: 'View Original',
                    emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                    style: ButtonStyle.Link,
                  },
                ],
              },
            ],
          });
        }
      } else if (i.data.custom_id === 'quote-size') {
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
                  custom_id: 'custom_size',
                  placeholder: 'Use whole numbers from 20px to 100px',
                  style: TextInputStyle.Short,
                  required: true,
                  min_length: 1,
                  max_length: 3,
                },
              },
            ],
          });
        } else {
          await api.interactions.deferMessageUpdate(i.id, i.token);

          sessions.get(interaction.token)!.size = size as SizeKey;

          image = await renderQuoteCard({
            avatar: sessions.get(interaction.token)!.avatar,
            quote: sessions.get(interaction.token)!.content,
            emojis: sessions.get(interaction.token)!.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: sessions.get(interaction.token)!.font,
            size: sessions.get(interaction.token)!.size,
            color: sessions.get(interaction.token)!.color,
            effects: sessions.get(interaction.token)!.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            files: [
              {
                name: `quote.gif`,
                data: image,
              },
            ],
            components: [
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
                      default: value === sessions.get(interaction.token)!.font,
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
                        default: value === sessions.get(interaction.token)!.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
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
                        default: value === sessions.get(interaction.token)!.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
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
                      default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                    emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                    style: ButtonStyle.Secondary,
                  },
                  {
                    type: ComponentType.Button,
                    url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                    label: 'View Original',
                    emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                    style: ButtonStyle.Link,
                  },
                ],
              },
            ],
          });
        }
      } else if (i.data.custom_id === 'quote-color') {
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
                  custom_id: 'custom_color',
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

          sessions.get(interaction.token)!.color = color as ColorKey;

          image = await renderQuoteCard({
            avatar: sessions.get(interaction.token)!.avatar,
            quote: sessions.get(interaction.token)!.content,
            emojis: sessions.get(interaction.token)!.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: sessions.get(interaction.token)!.font,
            size: sessions.get(interaction.token)!.size,
            color: sessions.get(interaction.token)!.color,
            effects: sessions.get(interaction.token)!.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            files: [
              {
                name: `quote.gif`,
                data: image,
              },
            ],
            components: [
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
                      default: value === sessions.get(interaction.token)!.font,
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
                        default: value === sessions.get(interaction.token)!.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
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
                        default: value === sessions.get(interaction.token)!.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
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
                      default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                    emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                    style: ButtonStyle.Secondary,
                  },
                  {
                    type: ComponentType.Button,
                    url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                    label: 'View Original',
                    emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                    style: ButtonStyle.Link,
                  },
                ],
              },
            ],
          });
        }
      } else if (i.data.custom_id === 'quote-effects') {
        await api.interactions.deferMessageUpdate(i.id, i.token);

        const effects =
          (i as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
          (i as APIMessageComponentSelectMenuInteraction).data.values;

        if (effects) {
          sessions.get(interaction.token)!.effects = effects as EffectKey[];

          image = await renderQuoteCard({
            avatar: sessions.get(interaction.token)!.avatar,
            quote: sessions.get(interaction.token)!.content,
            emojis: sessions.get(interaction.token)!.emojis,
            credit: message.author.global_name ?? message.author.username,
            mention: `@${message.author.username}`,
            font: sessions.get(interaction.token)!.font,
            size: sessions.get(interaction.token)!.size,
            color: sessions.get(interaction.token)!.color,
            effects: sessions.get(interaction.token)!.effects,
          });

          await api.interactions.editReply(interaction.application_id, interaction.token, {
            files: [
              {
                name: `quote.gif`,
                data: image,
              },
            ],
            components: [
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
                      default: value === sessions.get(interaction.token)!.font,
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
                        default: value === sessions.get(interaction.token)!.size,
                      })),
                      {
                        label: 'Custom Font Size',
                        description: 'Provide a custom font size',
                        value: 'custom',
                      },
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
                        default: value === sessions.get(interaction.token)!.color,
                      })),
                      {
                        label: 'Custom Text Color',
                        description: 'Provide a custom text color',
                        value: 'custom',
                      },
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
                      default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                    emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                    style: ButtonStyle.Secondary,
                  },
                  {
                    type: ComponentType.Button,
                    url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                    label: 'View Original',
                    emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                    style: ButtonStyle.Link,
                  },
                ],
              },
            ],
          });
        }
      } else if (i.data.custom_id === 'random') {
        await api.interactions.deferMessageUpdate(i.id, i.token);

        sessions.set(interaction.token, randomizeSession(sessions.get(interaction.token)!));

        image = await renderQuoteCard({
          avatar: sessions.get(interaction.token)!.avatar,
          quote: sessions.get(interaction.token)!.content,
          emojis: sessions.get(interaction.token)!.emojis,
          credit: message.author.global_name ?? message.author.username,
          mention: `@${message.author.username}`,
          font: sessions.get(interaction.token)!.font,
          size: sessions.get(interaction.token)!.size,
          color: sessions.get(interaction.token)!.color,
          effects: sessions.get(interaction.token)!.effects,
        });

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          files: [
            {
              name: `quote.gif`,
              data: image,
            },
          ],
          components: [
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
                    default: value === sessions.get(interaction.token)!.font,
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
                      default: value === sessions.get(interaction.token)!.size,
                    })),
                    {
                      label: 'Custom Font Size',
                      description: 'Provide a custom font size',
                      value: 'custom',
                    },
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
                      default: value === sessions.get(interaction.token)!.color,
                    })),
                    {
                      label: 'Custom Text Color',
                      description: 'Provide a custom text color',
                      value: 'custom',
                    },
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
                    default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                  emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                  style: ButtonStyle.Secondary,
                },
                {
                  type: ComponentType.Button,
                  url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                  label: 'View Original',
                  emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                  style: ButtonStyle.Link,
                },
              ],
            },
          ],
        });
      } else if (i.data.custom_id === 'custom-font-size') {
        await api.interactions.deferMessageUpdate(i.id, i.token);

        const size =
          (i as APIModalSubmitInteraction).data.components?.[0]?.type === ComponentType.Label
            ? parseInt(
                (((i as APIModalSubmitInteraction).data.components[0] as ModalSubmitLabelComponent).component as APIModalSubmitTextInputComponent).value,
                10,
              )
            : undefined;

        if (!Number.isNaN(size) || size! < 20 || size! > 100) {
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

        sessions.get(interaction.token)!.size = size!;

        image = await renderQuoteCard({
          avatar: sessions.get(interaction.token)!.avatar,
          quote: sessions.get(interaction.token)!.content,
          emojis: sessions.get(interaction.token)!.emojis,
          credit: message.author.global_name ?? message.author.username,
          mention: `@${message.author.username}`,
          font: sessions.get(interaction.token)!.font,
          size: sessions.get(interaction.token)!.size,
          color: sessions.get(interaction.token)!.color,
          effects: sessions.get(interaction.token)!.effects,
        });

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          files: [
            {
              name: `quote.gif`,
              data: image,
            },
          ],
          components: [
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
                    default: value === sessions.get(interaction.token)!.font,
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
                      default: value === sessions.get(interaction.token)!.size,
                    })),
                    {
                      label: 'Custom Font Size',
                      description: 'Provide a custom font size',
                      value: 'custom',
                    },
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
                      default: value === sessions.get(interaction.token)!.color,
                    })),
                    {
                      label: 'Custom Text Color',
                      description: 'Provide a custom text color',
                      value: 'custom',
                    },
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
                    default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                  emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                  style: ButtonStyle.Secondary,
                },
                {
                  type: ComponentType.Button,
                  url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                  label: 'View Original',
                  emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                  style: ButtonStyle.Link,
                },
              ],
            },
          ],
        });
      } else if (i.data.custom_id === 'custom-color') {
        await api.interactions.deferMessageUpdate(i.id, i.token);

        const color =
          (i as APIModalSubmitInteraction).data.components?.[0]?.type === ComponentType.Label
            ? (((i as APIModalSubmitInteraction).data.components[0] as ModalSubmitLabelComponent).component as APIModalSubmitTextInputComponent).value
            : undefined;

        if (!isHex(color)) {
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

        sessions.get(interaction.token)!.color = color!;

        image = await renderQuoteCard({
          avatar: sessions.get(interaction.token)!.avatar,
          quote: sessions.get(interaction.token)!.content,
          emojis: sessions.get(interaction.token)!.emojis,
          credit: message.author.global_name ?? message.author.username,
          mention: `@${message.author.username}`,
          font: sessions.get(interaction.token)!.font,
          size: sessions.get(interaction.token)!.size,
          color: sessions.get(interaction.token)!.color,
          effects: sessions.get(interaction.token)!.effects,
        });

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          files: [
            {
              name: `quote.gif`,
              data: image,
            },
          ],
          components: [
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
                    default: value === sessions.get(interaction.token)!.font,
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
                      default: value === sessions.get(interaction.token)!.size,
                    })),
                    {
                      label: 'Custom Font Size',
                      description: 'Provide a custom font size',
                      value: 'custom',
                    },
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
                      default: value === sessions.get(interaction.token)!.color,
                    })),
                    {
                      label: 'Custom Text Color',
                      description: 'Provide a custom text color',
                      value: 'custom',
                    },
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
                    default: sessions.get(interaction.token)!.effects.includes(value as EffectKey),
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
                  emoji: toEmoji('Spark') as APIMessageComponentEmoji,
                  style: ButtonStyle.Secondary,
                },
                {
                  type: ComponentType.Button,
                  url: `https://discord.com/channels/${interaction.guild_id ?? '@me'}/${message.channel_id}/${message.id}`,
                  label: 'View Original',
                  emoji: toEmoji('Quote') as APIMessageComponentEmoji,
                  style: ButtonStyle.Link,
                },
              ],
            },
          ],
        });
      }
    });

    collector.on('end', async () => {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        files: [
          {
            name: `quote.gif`,
            data: image,
          },
        ],
        components: [],
      });
    });
  },
});

function randomizeSession(sessions: Session): Session {
  const random = <T extends Record<string, unknown>>(obj: T): keyof T => {
    const keys = Object.keys(obj) as (keyof T)[];
    return keys[Math.floor(Math.random() * keys.length)]!;
  };

  sessions.font = random(CARD_FONTS) as FontKey;
  sessions.size = random(CARD_SIZES) as SizeKey;
  sessions.color = random(CARD_COLORS) as ColorKey;

  sessions.effects = shuffle(Object.keys(CARD_EFFECTS) as EffectKey[]).slice(0, Math.floor(Math.random() * 4));

  return sessions;
}

export async function resolveContent(message: APIMessage) {
  const content = message.content.trim();
  const mentions = message.mentions;

  const customEmojiRegex = /<a?:\w+:(\d+)>/g;

  const emojiIds = [...content.matchAll(customEmojiRegex)].map((m) => m[1]!);

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
