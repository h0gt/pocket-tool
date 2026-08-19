import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { cdn, emoji, highlight, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake } from '../../../utils/utils';
import { HighlightStyle, TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'invite',
  description: 'Views information about an invite',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'link',
      description: 'The invite link to view',
      required: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { link } = options;

    const code = link
      .trim()
      .match(/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/([a-zA-Z0-9-]{2,64})\/?$/i)?.[1];

    if (!code) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide an invite link to view`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const invite = await api.invites.get(code, { with_counts: true });

    if (!invite || !invite.guild) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a valid invite link to view`,
              },
            ],
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
              type: ComponentType.Section,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emoji('Home')} **${invite.guild.name}** ${highlight(invite.guild.id)}\n${invite.guild.description ? `*${invite.guild.description}*` : ''}`,
                },
              ],
              accessory: {
                type: ComponentType.Thumbnail,
                media: {
                  url: cdn(`/icons/${invite.guild.id}/${invite.guild.icon}`, 4096, 'webp', true),
                },
              },
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(invite.guild.id), TimestampStyle.LongDate)}\n\n${emoji('People')} ${highlight(invite.approximate_member_count?.toLocaleString('en-US'), HighlightStyle.Bold)}   ${emoji('Boost')} ${highlight(invite.guild.premium_subscription_count?.toLocaleString('en-US'))}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
