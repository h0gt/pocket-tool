import { ButtonStyle, ComponentType, MessageFlags, type APIMessageComponentSelectMenuInteraction } from '@discordjs/core/http-only';
import createComponent from '../../../helpers/component';
import { InteractableComponentType, TimestampStyle } from '../../../types/types';
import { msToReadableTime, toComponentEmoji } from '../../../utils/utils';
import { highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { commands, components } from '../..';

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
        const app = await api.applications.getCurrent();

        await api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `### Pocket Tool, your lightweight, fast, and versatile Discord app\n-# Developed by **${hyperlink('https://discord.com/users/782946852278501407', '@mloetta')}**`,
                },
                {
                  type: ComponentType.Separator,
                },
                {
                  type: ComponentType.TextDisplay,
                  content: `> Commands: ${highlight(commands.size)}\n> Components: ${highlight(components.size)}\n> Installs: ${highlight(app.approximate_user_install_count)}\n> Uptime: ${highlight(`${msToReadableTime(process.uptime() * 1000)}`)} (${timestamp(Math.floor(new Date().getTime() - process.uptime() * 1000), TimestampStyle.ShortDate)})`,
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
