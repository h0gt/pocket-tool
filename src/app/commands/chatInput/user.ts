import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  type APIInteractionDataResolvedGuildMember,
  type APIMessageComponentEmoji,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { cdn, emoji, highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'user',
  description: 'Views information about an user or yourself',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.User,
      name: 'user',
      description: 'The user to view',
      required: false,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'scope',
      description: 'The scope of the information to view',
      choices: [
        {
          name: 'Global',
          value: 'global',
        },
        {
          name: 'Guild',
          value: 'guild',
        },
      ],
      required: false,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    let { user: target, scope } = options;

    if (!target) {
      target = {
        user: (interaction.user ?? interaction.member?.user)!,
        member: interaction.member as APIInteractionDataResolvedGuildMember,
      };
    }

    if (!scope) {
      scope = 'global';
    }

    const { user, member } = target;

    if (!user) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Please provide a valid user to view`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    if (scope === 'guild' && member) {
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
                    content: `${emoji('Ping')} **${member.nick ?? user.global_name} (@${user.username})** ${highlight(user.id)}`,
                  },
                ],
                accessory: {
                  type: ComponentType.Thumbnail,
                  media: {
                    url: member.avatar
                      ? cdn(`guilds/${interaction.guild_id}/users/${user.id}/avatars/${member.avatar}`, 4096, 'webp', true)
                      : cdn(`/avatars/${user.id}/${user.avatar}`, 4096, 'webp', true),
                  },
                },
              },
              {
                type: ComponentType.Separator,
              },
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.RelativeTime)})\n\n${emoji('Newbie')} **Joined At:**\n${timestamp(new Date(member.joined_at!).getTime(), TimestampStyle.LongDate)} (${timestamp(new Date(member.joined_at!).getTime(), TimestampStyle.RelativeTime)})${
                  member.roles.length > 0
                    ? `\n\n${emoji('Role')} **Roles:**\n${member.roles
                        .slice(0, 5)
                        .map((id) => `<@&${id}>`)
                        .join(', ')}`
                    : ''
                }${member.roles.length > 5 ? ` ${highlight(`+${(member.roles.length - 5).toLocaleString('en-US')}`)}` : ``}\n\n-# ${emoji('Exclamation')} Due to Discord API limitations this command is unable to display the whole profile, ${hyperlink(`discord://-/users/${user.id}`, 'click here')} to view it through Discord instead!`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } else {
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
                    content: `${emoji('Ping')} **${user.global_name} (@${user.username})** ${highlight(user.id)}`,
                  },
                ],
                accessory: {
                  type: ComponentType.Thumbnail,
                  media: {
                    url: cdn(`/avatars/${user.id}/${user.avatar}`, 4096, 'webp', true),
                  },
                },
              },
              {
                type: ComponentType.Separator,
              },
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.RelativeTime)})\n\n-# ${emoji('Exclamation')} Due to Discord API limitations this command is unable to display the whole profile, ${hyperlink(`discord://-/users/${user.id}`, 'click here')} to view it through Discord instead!`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },
});
