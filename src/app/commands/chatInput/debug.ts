import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { hyperlink, timestamp } from '../../../utils/markdown';
import { commands, components } from '../..';
import { msToReadableTime, toComponentEmoji } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'debug',
  description: 'Views some information about me!',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
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
              content: `> Commands: **${commands.size}**\n> Components: **${components.size}**\n> Installs: **${app.approximate_user_install_count}**\n> Uptime: **${msToReadableTime(process.uptime() * 1000)} (${timestamp(Math.floor(new Date().getTime() - process.uptime() * 1000), TimestampStyle.LongDateShortTime)})**`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: `debug-pages_${interaction.user?.id ?? interaction.member?.user.id}`,
                  options: [
                    {
                      label: 'About',
                      value: 'about',
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
  },
});
