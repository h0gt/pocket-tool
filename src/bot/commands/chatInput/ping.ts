import { ApplicationCommandType, ApplicationIntegrationType, InteractionContextType } from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'ping',
  description: 'Pong!',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  acknowledge: true,
  async run(interaction, options, client) {
    await client.api.interactions.editReply(interaction.application_id, interaction.token, {
      content: `Pong!`,
    });
  },
});
