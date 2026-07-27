import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
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

    const code = link.match(/(https?:\/\/)?(www\.)?(discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,64})/)?.[4];

    if (!code) {
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

    // guild info we will be displaying
    const guildIcon = cdn(`/icons/${invite.guild.id}/${invite.guild.icon}`, 4096, 'webp', true);
    const name = invite.guild.name;
    const members = invite.approximate_member_count;
    const channels = (await api.guilds.getChannels(invite.guild.id)).length;
    const boosts = invite.guild.premium_subscription_count;
    const guildId = invite.guild.id;
    const createdAt = getTimestampFromSnowflake(invite.guild.id);

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
                  content: `${emoji('Home')} **${name}** ${highlight(guildId)}`,
                },
              ],
              accessory: {
                type: ComponentType.Thumbnail,
                media: {
                  url: guildIcon,
                },
              },
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Calendar')} **Created At:**\n${timestamp(createdAt, TimestampStyle.LongDate)}\n\n${emoji('People')} ${highlight(members, HighlightStyle.Bold)}   ${emoji('Channel')} ${highlight(channels)}   ${emoji('Boost')} ${highlight(boosts)}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
