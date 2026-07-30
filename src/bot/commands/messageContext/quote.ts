import { ApplicationCommandType, ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { emoji } from '../../../utils/markdown';
import { buildQuoteComponents, createQuoteSession, hasQuoteContent, renderQuoteSession, saveQuoteSession } from '../../../utils/quote';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Quote This Message',
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
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select a message with text to quote`,
              },
            ],
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
    session.editorApplicationId = interaction.application_id;
    session.editorInteractionToken = interaction.token;
    const image = await renderQuoteSession(session);

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      attachments: [{ id: 0, filename: `quote-${message.id}-${session.id}.gif` }],
      files: [
        {
          name: `quote-${message.id}-${session.id}.gif`,
          data: image,
        },
      ],
      components: buildQuoteComponents(session),
    });

    const editor = await api.interactions.getOriginalReply(interaction.application_id, interaction.token);
    session.editorChannelId = editor.channel_id;
    session.editorMessageId = editor.id;

    saveQuoteSession(session);
  },
});
