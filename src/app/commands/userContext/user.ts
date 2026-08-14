import { ApplicationCommandType, ComponentType, MessageFlags, type APIConnection } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';
import { cdn, emoji, highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { getTimestampFromSnowflake, toComponentEmoji } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';
import { decryptOauth2, encryptOauth2, getOauth2, hasOAuth2 } from '../../../utils/oauth2';
import { ConnectionVisibility, OAuth2API, Routes, type APIMessageTopLevelComponent } from '@discordjs/core';
import env from '../../../utils/env';
import { supabase } from '../../../utils/supabase';
import { REST } from '@discordjs/rest';
import { CONNECTION_SERVICES } from '../../../types/connections';
import { Emoji } from '../../../types/emojis';

createApplicationCommand({
  type: ApplicationCommandType.User,
  name: 'View User Profile',
  cooldown: 3,
  acknowledge: true,
  async run(interaction, api) {
    const userId = interaction.data.target_id;
    const user = interaction.data.resolved.users[userId];
    const member = interaction.data.resolved.members?.[userId];

    if (!user) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select a valid user to view`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    let connections: APIConnection[] = [];

    if (await hasOAuth2(user.id)) {
      const data = await getOauth2(user.id);

      let accessToken = decryptOauth2(data.exchange.access_token);

      const expired = new Date(data.exchange.expires_at).getTime() <= Date.now();

      if (expired) {
        const refreshToken = decryptOauth2(data.exchange.refresh_token);

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

        if (error) throw error;
      }

      const rest = new REST({ authPrefix: 'Bearer' }).setToken(accessToken);

      connections = (await rest.get(Routes.userConnections())) as APIConnection[];
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
                  content: `${emoji('Ping')} **${member?.nick ?? user.global_name} (@${user.username})** ${highlight(user.id)}`,
                },
              ],
              accessory: {
                type: ComponentType.Thumbnail,
                media: {
                  url: member?.avatar
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
            ...(connections.length > 0
              ? ([
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.StringSelect,
                        custom_id: 'connections',
                        placeholder: 'Connections',
                        options: connections
                          .filter(
                            (c) =>
                              c.visibility === ConnectionVisibility.Everyone &&
                              CONNECTION_SERVICES.find((s) => s.service === c.type)?.emoji,
                          )
                          .map((c) => ({
                            label: CONNECTION_SERVICES.find((s) => s.service === c.type)?.name ?? c.type,
                            value: c.id,
                            emoji: toComponentEmoji(
                              CONNECTION_SERVICES.find((s) => s.service === c.type)?.emoji as keyof typeof Emoji,
                            ),
                          })),
                      },
                    ],
                  },
                ] satisfies APIMessageTopLevelComponent[])
              : ([] satisfies APIMessageTopLevelComponent[])),
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Calendar')} **Created:**\n${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.LongDate)} (${timestamp(getTimestampFromSnowflake(user.id), TimestampStyle.RelativeTime)})${
                member
                  ? `\n\n${emoji('Newbie')} **Joined:**\n${timestamp(new Date(member.joined_at!).getTime(), TimestampStyle.LongDate)} (${timestamp(new Date(member.joined_at!).getTime(), TimestampStyle.RelativeTime)})${
                      member.roles.length > 0
                        ? `\n\n${emoji('Role')} **Roles:**\n${member.roles
                            .slice(0, 5)
                            .map((id) => `<@&${id}>`)
                            .join(', ')}`
                        : ''
                    }${member.roles.length > 5 ? ` ${highlight(`+${(member.roles.length - 5).toLocaleString('en-US')}`)}` : ``}`
                  : ''
              }\n\n-# ${emoji('Exclamation')} Due to Discord limitations, this profile can't be fully displayed ${hyperlink(`discord://-/users/${user.id}`, 'open it in Discord')}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
