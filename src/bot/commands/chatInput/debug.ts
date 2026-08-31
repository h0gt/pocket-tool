import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  type APIMessageComponentSelectMenuInteraction,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { getShardIdForGuildId, msToReadableTime, toComponentEmoji } from '../../../utils/utils';
import { emoji, highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { HighlightStyle, TimestampStyle } from '../../../types/types';
import { INVITE, SUPPORT, WEBSITE } from '../../constants';
import { redis } from '../../../utils/redis';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'debug',
  description: 'View stats and information about me!',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, client) {
    const response = await client.api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `### ${hyperlink(WEBSITE, 'Welcome to Pocket Tool!')}\nYou can view all available slash commands by typing ${highlight('/', HighlightStyle.Bold)}\n-# Additionally, you can view context menu commands by right-clicking or long-pressing a message or user`,
            },
            {
              type: ComponentType.TextDisplay,
              content: `-# **Quickstart:**\n> </help:1504215560865448037> - View and search through all available commands\n> </debug:1533585400138961059> - View stats and information about me!`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `### How to report bugs?\nTo report a bug, join our __support server__ and create a post in the ${hyperlink('https://discord.com/channels/1533439024637939792/1533485684961054781', 'bug reports channel')}.`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: 'debug-pages',
                  options: [
                    {
                      label: 'About',
                      value: 'about',
                      default: true,
                    },
                    {
                      label: 'Stats',
                      value: 'stats',
                    },
                    {
                      label: 'Usage',
                      value: 'usage',
                    },
                    {
                      label: 'Credits',
                      value: 'credits',
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: 'Authorize',
                  emoji: toComponentEmoji('Link'),
                  url: INVITE,
                  style: ButtonStyle.Link,
                },
                {
                  type: ComponentType.Button,
                  label: 'Support Server',
                  emoji: toComponentEmoji('Discord'),
                  url: SUPPORT,
                  style: ButtonStyle.Link,
                },
              ],
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    let page = 'about';

    const collector = client.api.interactions.createCollector<APIMessageComponentSelectMenuInteraction>({
      key: 'debug-pages',
      filter: (i) =>
        i.message?.id === response.id &&
        (i.user?.id ?? i.member?.user.id) === (interaction.user?.id ?? interaction.member?.user.id),
      duration: 5 * 60 * 1000,
    });

    collector.on('collect', async (i) => {
      await client.api.interactions.deferMessageUpdate(i.id, i.token);

      page = i.data.component_type === ComponentType.StringSelect ? (i.data.values[0] ?? page) : page;

      switch (page) {
        case 'about': {
          await client.api.interactions.editReply(i.application_id, i.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `### ${hyperlink(WEBSITE, 'Welcome to Pocket Tool!')}\nYou can view all available slash commands by typing ${highlight('/', HighlightStyle.Bold)}\n-# Additionally, you can view context menu commands by right-clicking or long-pressing a message or user`,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# **Quickstart:**\n> </help:1504215560865448037> - View and search through all available commands\n> </debug:1533585400138961059> - View stats and information about me!`,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.TextDisplay,
                    content: `### How to report bugs?\nTo report a bug, join our __support server__ and create a post in the ${hyperlink('https://discord.com/channels/1533439024637939792/1533485684961054781', 'bug reports channel')}.`,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.StringSelect,
                        custom_id: 'debug-pages',
                        options: [
                          {
                            label: 'About',
                            value: 'about',
                            default: true,
                          },
                          {
                            label: 'Stats',
                            value: 'stats',
                          },
                          {
                            label: 'Usage',
                            value: 'usage',
                          },
                          {
                            label: 'Credits',
                            value: 'credits',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        label: 'Authorize',
                        emoji: toComponentEmoji('Link'),
                        url: INVITE,
                        style: ButtonStyle.Link,
                      },
                      {
                        type: ComponentType.Button,
                        label: 'Support Server',
                        emoji: toComponentEmoji('Discord'),
                        url: SUPPORT,
                        style: ButtonStyle.Link,
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
        case 'stats': {
          const bot = await client.api.applications.getCurrent();

          const totalShards = await client.gateway.getShardCount();
          const shardId = i.guild_id ? getShardIdForGuildId(i.guild_id, totalShards) : 0;
          const uptime = client.gateway.shards.get(shardId)?.uptime!;
          const ping = client.gateway.shards.get(shardId)?.ping!;

          await client.api.interactions.editReply(i.application_id, i.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# **Statistics:**\n> Shards: **${totalShards}**\n> Installs: **${bot.approximate_user_install_count}**\n> Servers: **${bot.approximate_guild_count}**\n> Uptime: **${msToReadableTime(Temporal.Now.instant().epochMilliseconds - uptime)} (${timestamp(uptime, TimestampStyle.LongDateShortTime)})**\n> Latency: **${ping}ms**\n-# ${emoji('Exclamation')} Viewing statistics for shard **#${shardId}**`,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.StringSelect,
                        custom_id: 'debug-pages',
                        options: [
                          {
                            label: 'About',
                            value: 'about',
                          },
                          {
                            label: 'Stats',
                            value: 'stats',
                            default: true,
                          },
                          {
                            label: 'Usage',
                            value: 'usage',
                          },
                          {
                            label: 'Credits',
                            value: 'credits',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        label: 'Authorize',
                        emoji: toComponentEmoji('Link'),
                        url: INVITE,
                        style: ButtonStyle.Link,
                      },
                      {
                        type: ComponentType.Button,
                        label: 'Support Server',
                        emoji: toComponentEmoji('Discord'),
                        url: SUPPORT,
                        style: ButtonStyle.Link,
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
        case 'usage': {
          const now = Temporal.Now.zonedDateTimeISO('America/Sao_Paulo');

          const analyticsDate = now.hour < 21 ? now.subtract({ days: 1 }) : now;

          const day = analyticsDate.toPlainDate().toString();
          const hour = String(now.hour).padStart(2, '0');
          const minute = String(now.minute).padStart(2, '0');

          const today = (await redis.get(`analytics:commands:day:${day}`)) ?? '0';
          const lastHour = (await redis.get(`analytics:commands:hour:${day}:${hour}`)) ?? '0';
          const lastMinute = (await redis.get(`analytics:commands:minute:${day}:${hour}:${minute}`)) ?? '0';

          const commandsUsage = [];

          for await (const keys of redis.scanIterator({
            MATCH: `analytics:commands:usage:*:day:${day}`,
            COUNT: 100,
          })) {
            for (const key of keys) {
              const data = await redis.hGetAll(key);

              if (data.id) {
                commandsUsage.push(data);
              }
            }
          }

          const topCommands = commandsUsage
            .sort((a, b) => Number(b.uses) - Number(a.uses))
            .slice(0, 5)
            .map(
              (command) =>
                `> </${command.name}:${command.id}>: **${Number(command.uses).toLocaleString('en-US')} uses**`,
            )
            .join('\n');

          await client.api.interactions.editReply(i.application_id, i.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# **Today's Command Usage:**\n> Today: **${today}**\n> Last Hour: **${lastHour}**\n> Last Minute: **${lastMinute}**\n-# **Today's Top Commands:**\n${topCommands}`,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.StringSelect,
                        custom_id: 'debug-pages',
                        options: [
                          {
                            label: 'About',
                            value: 'about',
                          },
                          {
                            label: 'Stats',
                            value: 'stats',
                          },
                          {
                            label: 'Usage',
                            value: 'usage',
                            default: true,
                          },
                          {
                            label: 'Credits',
                            value: 'credits',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        label: 'Authorize',
                        emoji: toComponentEmoji('Link'),
                        url: INVITE,
                        style: ButtonStyle.Link,
                      },
                      {
                        type: ComponentType.Button,
                        label: 'Support Server',
                        emoji: toComponentEmoji('Discord'),
                        url: SUPPORT,
                        style: ButtonStyle.Link,
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
        case 'credits': {
          await client.api.interactions.editReply(i.application_id, i.token, {
            components: [
              {
                type: ComponentType.Container,
                components: [
                  {
                    type: ComponentType.TextDisplay,
                    content: `-# **Development:**\n> ${hyperlink('https://discord.com/users/782946852278501407', '@melotheunbound')} - Lead Developer\n> ${hyperlink('https://discord.com/users/775273108671430677', '@h0gtt')} - Website Developer & Contributor\n-# **Design:**\n> ${hyperlink('https://merpix.de/', 'Merpix')} - Responsible for the branding\n> ${hyperlink('https://discord.com/users/808606684837576714', '@mineturtle2.')} - Created the emojis\n-# **Additional:**\n> ${hyperlink('https://wispbyte.com', 'David Dobos')} - Hosting Provider`,
                  },
                  {
                    type: ComponentType.Separator,
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.StringSelect,
                        custom_id: 'debug-pages',
                        options: [
                          {
                            label: 'About',
                            value: 'about',
                          },
                          {
                            label: 'Stats',
                            value: 'stats',
                          },
                          {
                            label: 'Usage',
                            value: 'usage',
                          },
                          {
                            label: 'Credits',
                            value: 'credits',
                            default: true,
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        label: 'Authorize',
                        emoji: toComponentEmoji('Link'),
                        url: INVITE,
                        style: ButtonStyle.Link,
                      },
                      {
                        type: ComponentType.Button,
                        label: 'Support Server',
                        emoji: toComponentEmoji('Discord'),
                        url: SUPPORT,
                        style: ButtonStyle.Link,
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

    collector.on('end', async () => {
      switch (page) {
        case 'about': {
          await client.api.interactions
            .editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `### ${hyperlink(WEBSITE, 'Welcome to Pocket Tool!')}\nYou can view all available slash commands by typing ${highlight('/', HighlightStyle.Bold)}\n-# Additionally, you can view context menu commands by right-clicking or long-pressing a message or user`,
                    },
                    {
                      type: ComponentType.TextDisplay,
                      content: `-# **Quickstart:**\n> </help:1504215560865448037> - View and search through all available commands\n> </debug:1533585400138961059> - View stats and information about me!`,
                    },
                    {
                      type: ComponentType.Separator,
                    },
                    {
                      type: ComponentType.TextDisplay,
                      content: `### How to report bugs?\nTo report a bug, join our __support server__ and create a post in the ${hyperlink('https://discord.com/channels/1533439024637939792/1533485684961054781', 'bug reports channel')}.`,
                    },
                    {
                      type: ComponentType.Separator,
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.StringSelect,
                          custom_id: 'debug-pages',
                          options: [
                            {
                              label: 'About',
                              value: 'about',
                              default: true,
                            },
                            {
                              label: 'Stats',
                              value: 'stats',
                            },
                            {
                              label: 'Usage',
                              value: 'usage',
                            },
                            {
                              label: 'Credits',
                              value: 'credits',
                            },
                          ],
                          disabled: true,
                        },
                      ],
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.Button,
                          label: 'Authorize',
                          emoji: toComponentEmoji('Link'),
                          url: INVITE,
                          style: ButtonStyle.Link,
                        },
                        {
                          type: ComponentType.Button,
                          label: 'Support Server',
                          emoji: toComponentEmoji('Discord'),
                          url: SUPPORT,
                          style: ButtonStyle.Link,
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => null);

          break;
        }
        case 'stats': {
          const bot = await client.api.applications.getCurrent();

          const totalShards = await client.gateway.getShardCount();
          const shardId = interaction.guild_id ? getShardIdForGuildId(interaction.guild_id, totalShards) : 0;
          const uptime = client.gateway.shards.get(shardId)?.uptime!;
          const ping = client.gateway.shards.get(shardId)?.ping!;

          await client.api.interactions
            .editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `-# **Statistics**\n> Shards: **${totalShards}**\n> Installs: **${bot.approximate_user_install_count}**\n> Servers: **${bot.approximate_guild_count}**\n> Uptime: **${msToReadableTime(Temporal.Now.instant().epochMilliseconds - uptime)} (${timestamp(uptime, TimestampStyle.LongDateShortTime)})**\n> Latency: **${ping}ms**\n-# ${emoji('Exclamation')} Viewing statistics for shard **${shardId}**`,
                    },
                    {
                      type: ComponentType.Separator,
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.StringSelect,
                          custom_id: 'debug-pages',
                          options: [
                            {
                              label: 'About',
                              value: 'about',
                            },
                            {
                              label: 'Stats',
                              value: 'stats',
                              default: true,
                            },
                            {
                              label: 'Usage',
                              value: 'usage',
                            },
                            {
                              label: 'Credits',
                              value: 'credits',
                            },
                          ],
                          disabled: true,
                        },
                      ],
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.Button,
                          label: 'Authorize',
                          emoji: toComponentEmoji('Link'),
                          url: INVITE,
                          style: ButtonStyle.Link,
                        },
                        {
                          type: ComponentType.Button,
                          label: 'Support Server',
                          emoji: toComponentEmoji('Discord'),
                          url: SUPPORT,
                          style: ButtonStyle.Link,
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => null);

          break;
        }
        case 'usage': {
          const now = Temporal.Now.zonedDateTimeISO('America/Sao_Paulo');

          const analyticsDate = now.hour < 21 ? now.subtract({ days: 1 }) : now;

          const day = analyticsDate.toPlainDate().toString();
          const hour = String(now.hour).padStart(2, '0');
          const minute = String(now.minute).padStart(2, '0');

          const today = (await redis.get(`analytics:commands:day:${day}`)) ?? '0';
          const lastHour = (await redis.get(`analytics:commands:hour:${day}:${hour}`)) ?? '0';
          const lastMinute = (await redis.get(`analytics:commands:minute:${day}:${hour}:${minute}`)) ?? '0';

          const commandsUsage = [];

          for await (const keys of redis.scanIterator({
            MATCH: `analytics:commands:usage:*:day:${day}`,
            COUNT: 100,
          })) {
            for (const key of keys) {
              const data = await redis.hGetAll(key);

              if (data.id) {
                commandsUsage.push(data);
              }
            }
          }

          const topCommands = commandsUsage
            .sort((a, b) => Number(b.uses) - Number(a.uses))
            .slice(0, 5)
            .map(
              (command) =>
                `> </${command.name}:${command.id}>: **${Number(command.uses).toLocaleString('en-US')} uses**`,
            )
            .join('\n');

          await client.api.interactions
            .editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `-# **Today's Command Usage:**\n> Today: **${today}**\n> Last Hour: **${lastHour}**\n> Last Minute: **${lastMinute}**\n-# **Today's Top Commands:**\n${topCommands}`,
                    },
                    {
                      type: ComponentType.Separator,
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.StringSelect,
                          custom_id: 'debug-pages',
                          options: [
                            {
                              label: 'About',
                              value: 'about',
                            },
                            {
                              label: 'Stats',
                              value: 'stats',
                            },
                            {
                              label: 'Usage',
                              value: 'usage',
                              default: true,
                            },
                            {
                              label: 'Credits',
                              value: 'credits',
                            },
                          ],
                          disabled: true,
                        },
                      ],
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.Button,
                          label: 'Authorize',
                          emoji: toComponentEmoji('Link'),
                          url: INVITE,
                          style: ButtonStyle.Link,
                        },
                        {
                          type: ComponentType.Button,
                          label: 'Support Server',
                          emoji: toComponentEmoji('Discord'),
                          url: SUPPORT,
                          style: ButtonStyle.Link,
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => null);

          break;
        }
        case 'credits': {
          await client.api.interactions
            .editReply(interaction.application_id, interaction.token, {
              components: [
                {
                  type: ComponentType.Container,
                  components: [
                    {
                      type: ComponentType.TextDisplay,
                      content: `-# **Development:**\n> ${hyperlink('https://discord.com/users/782946852278501407', '@melotheunbound')} - Lead Developer\n> ${hyperlink('https://discord.com/users/775273108671430677', '@h0gtt')} - Website Developer & Contributor\n-# **Design:**\n> ${hyperlink('https://merpix.de/', 'Merpix')} - Responsible for the branding\n> ${hyperlink('https://discord.com/users/808606684837576714', '@mineturtle2.')} - Created the emojis\n-# **Additional:**\n> ${hyperlink('https://wispbyte.com', 'David Dobos')} - Hosting Provider`,
                    },
                    {
                      type: ComponentType.Separator,
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.StringSelect,
                          custom_id: 'debug-pages',
                          options: [
                            {
                              label: 'About',
                              value: 'about',
                            },
                            {
                              label: 'Stats',
                              value: 'stats',
                            },
                            {
                              label: 'Usage',
                              value: 'usage',
                            },
                            {
                              label: 'Credits',
                              value: 'credits',
                              default: true,
                            },
                          ],
                          disabled: true,
                        },
                      ],
                    },
                    {
                      type: ComponentType.ActionRow,
                      components: [
                        {
                          type: ComponentType.Button,
                          label: 'Authorize',
                          emoji: toComponentEmoji('Link'),
                          url: INVITE,
                          style: ButtonStyle.Link,
                        },
                        {
                          type: ComponentType.Button,
                          label: 'Support Server',
                          emoji: toComponentEmoji('Discord'),
                          url: SUPPORT,
                          style: ButtonStyle.Link,
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => null);

          break;
        }
      }
    });
  },
});
