import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { highlight, hyperlink, timestamp } from '../../../utils/markdown';
import { commands } from '../..';
import { msToReadableTime, toComponentEmoji } from '../../../utils/utils';
import { TimestampStyle } from '../../../types/types';
import os from 'os';

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
    const originalReply = await api.interactions.getOriginalReply(interaction.application_id, interaction.token);
    const sentAt = new Date(originalReply.timestamp).getTime();
    const latency = new Date().getTime() - sentAt;
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percent = used / total;

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
              content: `> Commands: ${highlight(commands.size)}\n> Installs: ${highlight(app.approximate_user_install_count)}\n> Latency: ${highlight(`${latency}ms`)}\n> Uptime: ${highlight(`${msToReadableTime(process.uptime() * 1000)}`)} (${timestamp(Math.floor(new Date().getTime() - process.uptime() * 1000), TimestampStyle.ShortDate)})\n> Memory: ${highlight(`${percent.toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 2 })} (${(used / 1024 / 1024).toFixed(2)} MiB)`)}`,
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
