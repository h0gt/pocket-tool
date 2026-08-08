import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIMessageComponentSelectMenuInteraction,
} from '@discordjs/core/http-only';
import createComponent from '../../../helpers/component';
import { InteractableComponentType, TimestampStyle } from '../../../types/types';
import { msToReadableTime, toComponentEmoji } from '../../../utils/utils';
import { hyperlink, timestamp } from '../../../utils/markdown';
import { commands, components } from '../..';
import { redis } from '../../../utils/redis';
import { Temporal } from '@js-temporal/polyfill';

createComponent({
  type: InteractableComponentType.SelectMenu,
  custom_id: 'debug-pages',
  args: ['userId'] as const,
  acknowledge: true,
  async run(interaction, args, api) {
    const { userId } = args;

    if ((interaction.user?.id ?? interaction.member?.user.id) !== userId) return;

    const page =
      (interaction as APIMessageComponentSelectMenuInteraction).data.component_type === ComponentType.StringSelect &&
      (interaction as APIMessageComponentSelectMenuInteraction).data.values[0];

    switch (page) {
      case 'about': {
        await api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `### Welcome to Pocket Tool!\nYou can view all the available commands by running </help:1504215560865448037>`,
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.TextDisplay,
                  content:
                    '### How to report bugs?\nTo report bugs, join our __support server__ and create a post at https://discord.com/channels/1533439024637939792/1533485684961054781',
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: `debug-pages_${userId}`,
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
                      label: 'Add to Your Apps!',
                      emoji: toComponentEmoji('Link'),
                      url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                      style: ButtonStyle.Link,
                    },
                    {
                      type: ComponentType.Button,
                      label: 'Support Server',
                      emoji: toComponentEmoji('Discord'),
                      url: 'https://discord.gg/Y67yNmsPuf',
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
        const app = await api.applications.getCurrent();

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# **Statistics**\n> Commands: **${commands.size}**\n> Components: **${components.size}**\n> Installs: **${app.approximate_user_install_count}**\n> Uptime: **${msToReadableTime(process.uptime() * 1000)} (${timestamp(Math.floor(new Date().getTime() - process.uptime() * 1000), TimestampStyle.LongDateShortTime)})**`,
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: `debug-pages_${userId}`,
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
                      label: 'Add to Your Apps!',
                      emoji: toComponentEmoji('Link'),
                      url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                      style: ButtonStyle.Link,
                    },
                    {
                      type: ComponentType.Button,
                      label: 'Support Server',
                      emoji: toComponentEmoji('Discord'),
                      url: 'https://discord.gg/Y67yNmsPuf',
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
            (command) => `> </${command.name}:${command.id}>: **${Number(command.uses).toLocaleString('en-US')} uses**`,
          )
          .join('\n');

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# **Today's command usage:**\n> Today: **${today}**\n> Last Hour: **${lastHour}**\n> Last Minute: **${lastMinute}**\n-# **Today's top commands:**\n${topCommands}`,
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: `debug-pages_${userId}`,
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
                      label: 'Add to Your Apps!',
                      emoji: toComponentEmoji('Link'),
                      url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                      style: ButtonStyle.Link,
                    },
                    {
                      type: ComponentType.Button,
                      label: 'Support Server',
                      emoji: toComponentEmoji('Discord'),
                      url: 'https://discord.gg/Y67yNmsPuf',
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
        await api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `-# **Development:**\n> ${hyperlink('https://discord.com/users/782946852278501407', '@mloetta')} - Lead Developer\n> ${hyperlink('https://discord.com/users/775273108671430677', '@h0gtt')} - Contributor\n-# **Design:**\n> ${hyperlink('https://merpix.de/', 'Merpix')}\n-# **Additional:**\n> ${hyperlink('https://discord.com/users/808606684837576714', '@mineturtle2.')} - Made most of the emojis\n> ${hyperlink('https://discord.com/users/1031965725423849492', '@wolfypro')} - Host Provider`,
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.ActionRow,
                  components: [
                    {
                      type: ComponentType.StringSelect,
                      custom_id: `debug-pages_${userId}`,
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
                      label: 'Add to Your Apps!',
                      emoji: toComponentEmoji('Link'),
                      url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                      style: ButtonStyle.Link,
                    },
                    {
                      type: ComponentType.Button,
                      label: 'Support Server',
                      emoji: toComponentEmoji('Discord'),
                      url: 'https://discord.gg/Y67yNmsPuf',
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
  },
});
