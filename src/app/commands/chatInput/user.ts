import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  OAuth2API,
  type APIInteractionDataResolvedGuildMember,
  type APIUser,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';
import { cdn, emoji, highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';
import { decryptOauth2, encryptOauth2, getOauth2, hasOAuth2 } from '../../../utils/oauth2';
import env from '../../../utils/env';
import { supabase } from '../../../utils/supabase';

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

    let { user, member } = target;

    /*
    if (await hasOAuth2(user.id)) {
      const data = await getOauth2(user.id);

      let accessToken = decryptOauth2(data.access_token);

      const expired = new Date(data.expires_at).getTime() <= Date.now();

      if (expired) {
        const refreshToken = decryptOauth2(data.refresh_token);

        const oauth2 = new OAuth2API(api.rest);

        const refreshed = await oauth2.refreshToken({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          client_id: atob(env.get('token', true).toString().split('.')[0]!),
          client_secret: env.get('client_secret', true).toString(),
        });

        accessToken = refreshed.access_token;

        const { error } = await supabase
          .from('oauth2')
          .update({
            access_token: encryptOauth2(refreshed.access_token),
            refresh_token: encryptOauth2(refreshed.refresh_token),
            expires_in: refreshed.expires_in,
            expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
            scope: refreshed.scope,
            token_type: refreshed.token_type,
          })
          .eq('user_id', user.id);

        if (error) {
          throw error;
        }
      }

      user = (await api.rest.get('/users/@me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })) as APIUser;
    }
    */

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
                      ? cdn(
                          `guilds/${interaction.guild_id}/users/${user.id}/avatars/${member.avatar}`,
                          4096,
                          'webp',
                          true,
                        )
                      : user.avatar
                        ? cdn(`/avatars/${user.id}/${user.avatar}`, 4096, 'webp', true)
                        : cdn(`/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}`, 4096, 'png'),
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
                }${member.roles.length > 5 ? ` ${highlight(`+${(member.roles.length - 5).toLocaleString('en-US')}`)}` : ``}\n\n-# ${emoji('Exclamation')} Due to Discord limitations, this profile can't be fully displayed ${hyperlink(`discord://-/users/${user.id}`, 'open it in Discord')}`,
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
                    url: user.avatar
                      ? cdn(`/avatars/${user.id}/${user.avatar}`, 4096, 'webp', true)
                      : cdn(`/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}`, 4096, 'png'),
                  },
                },
              },
              {
                type: ComponentType.Separator,
              },
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Calendar')} **Created At:**\n${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.RelativeTime)})\n\n-# ${emoji('Exclamation')} Due to Discord limitations, this profile can't be fully displayed ${hyperlink(`discord://-/users/${user.id}`, 'open it in Discord')}`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },
});
