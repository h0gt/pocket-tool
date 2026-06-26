import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { emoji, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'sticker',
  description: 'Views information about a sticker',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'sticker',
      description: 'The sticker to view',
      required: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { sticker: rawSticker } = options;

    const sticker = await api.stickers.get(rawSticker);

    if (!sticker) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Please provide a valid sticker to view`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Sticker')} **${sticker.name}**\n-# ${sticker.id}\n${sticker.description ? `*${sticker.description}*` : ''}\n\n${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(sticker.id!), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(sticker.id!), TimestampStyle.RelativeTime)})\n\n`,
            },
            {
              type: ComponentType.MediaGallery,
              items: [
                {
                  media: {
                    url: `https://media.discordapp.net/stickers/${sticker.id}.webp`, // looks like discord uses a different endpoint for stickers (?)
                  },
                },
              ],
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
