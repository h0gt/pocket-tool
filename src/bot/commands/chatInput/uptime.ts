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
  name: 'uptime',
  description: 'View my uptime!',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  acknowledge: true,
  async run(interaction, options, api) {
    const uptime = process.uptime();

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.TextDisplay,
          content: `Uptime: **${uptime.toLocaleString('en-US', { style: 'unit', unit: 'second' })}** (${timestamp(Math.floor(new Date().getTime() - uptime * 1000), TimestampStyle.RelativeTime)})`,
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
