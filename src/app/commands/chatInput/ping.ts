import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'ping',
  description: 'Pong!',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  acknowledge: true,
  async run(interaction, options, api) {
    await api.interactions.editReply(interaction.application_id, interaction.token, {
      content: `Pong!`,
    });
  },
});
