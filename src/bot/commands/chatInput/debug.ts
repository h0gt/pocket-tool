import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  type APIMessageComponentEmoji,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { getTimestampFromSnowflake, toEmoji } from '../../../utils/utils';
import { hyperlink, timestamp } from '../../../utils/markdown';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'debug',
  description: 'View some informations about me!',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  acknowledge: true,
  async run(interaction, options, api) {
    const original = await api.interactions.getOriginalReply(interaction.application_id, interaction.token);
    const received = new Date().getTime();
    const created = getTimestampFromSnowflake(original.id);
    const latency = received - created;
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const app = await api.applications.getCurrent();

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `### Pocket Tool, your lightweight, fast, and versatile Discord bot\n-# Developed by **${hyperlink('https://discord.gg/CAr2YgdtAv', 'Keystone')}**, designed by **${hyperlink('https://merpix.de/', 'Merpix')}**, most emojis are from **${hyperlink('https://discord.gg/icons-859387663093727263', 'Icons')}**`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `> Latency: **${latency.toLocaleString('en-US')}ms**\n> Uptime: **${timestamp(Math.floor(new Date().getTime() - uptime * 1000), TimestampStyle.RelativeTime)}**\n> Memory: **${Number((memory.heapUsed / 1024 / 1024).toFixed(2)).toLocaleString('en-US', { style: 'unit', unit: 'megabyte' })} (${Number((memory.rss / 1024 / 1024).toFixed(2)).toLocaleString('en-US', { style: 'unit', unit: 'megabyte' })})**\n> Installs: **${app.approximate_user_install_count}**`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: 'Invite Me!',
                  emoji: toEmoji('Link') as APIMessageComponentEmoji,
                  url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                  style: ButtonStyle.Link,
                },
                {
                  type: ComponentType.Button,
                  label: 'Support Server',
                  emoji: toEmoji('Discord') as APIMessageComponentEmoji,
                  url: 'https://discord.gg/EEAchFSWpr',
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
