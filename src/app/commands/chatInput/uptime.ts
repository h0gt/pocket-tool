import { ApplicationCommandType, ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { msToReadableTime } from '../../../utils/utils';
import { emoji, timestamp } from '../../../utils/markdown';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'uptime',
  description: 'View my uptime!',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  acknowledge: true,
  async run(interaction, options, api) {
    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Clock')} Uptime: **${msToReadableTime(process.uptime() * 1000)} (${timestamp(Math.floor(new Date().getTime() - process.uptime() * 1000), TimestampStyle.ShortDate)})**`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
