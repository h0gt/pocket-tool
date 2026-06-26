import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { cdn, emoji, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'emoji',
  description: 'Views information about an emoji',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'emoji',
      description: 'The emoji to view',
      required: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { emoji: rawEmoji } = options;

    const regex = /<(a?):(\w+):(\d+)>/g;
    const matches = [...rawEmoji.matchAll(regex)];

    if (matches.length === 0 || matches.length > 4) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Please provide between 1 and 4 valid emojis to view`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const emojis = matches.map((m) => ({
      animated: !!m[1],
      name: m[2],
      id: m[3],
    }));

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: emojis
                .map(
                  (e) =>
                    `${emoji('Sticker')} **${e.name}**\n-# ${e.id}\n\n${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(e.id!), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(e.id!), TimestampStyle.RelativeTime)})`,
                )
                .join('\n'),
            },
            {
              type: ComponentType.MediaGallery,
              items: emojis.map((e) => ({
                media: {
                  url: cdn(`/emojis/${e.id}`, 1024, 'webp', true),
                },
              })),
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
