import { ApplicationCommandType, ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command.js';
import { emoji } from '../../../utils/markdown.js';
import { buildQuoteComponents, createQuoteSession, hasQuoteContent, renderQuoteSession } from '../../../utils/quote.js';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Quote Message',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, api) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

    if (!message || !hasQuoteContent(message)) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Please select a message with text to quote`,
          },
          {
            type: ComponentType.Separator,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const ownerId = interaction.user?.id ?? interaction.member?.user.id;
    if (!ownerId) return;

    const member = interaction.guild_id ? await api.guilds.getMember(interaction.guild_id, message.author.id).catch(() => undefined) : undefined;
    const displayName = member?.nick ?? message.author.global_name ?? message.author.username;
    const session = await createQuoteSession(message, ownerId, displayName, interaction.guild_id);
    const image = await renderQuoteSession(session);

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      files: [
        {
          name: `quote-${message.id}.png`,
          data: image,
        },
      ],
      components: buildQuoteComponents(session),
    });
  },
});
