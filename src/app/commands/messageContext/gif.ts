import { ApplicationCommandType, ApplicationIntegrationType, ComponentType, InteractionContextType, MessageFlags } from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { emoji } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import sharp from 'sharp';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Turn Into GIF',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, api) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

    if (!message) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select an image to turn into a GIF`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    if (message.message_snapshots && message.message_snapshots.length > 0) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Forwarded messages are currently not supported`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const attachments = Object.values(message.attachments)
      .filter((attachment) => attachment.content_type?.startsWith('image/'))
      .slice(0, 10);

    if (attachments.length === 0) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select at least one image to turn into a GIF`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const files = await Promise.all(
      attachments.map(async (attachment, index) => {
        const buffer = await makeRequest(attachment.url, {
          method: RequestMethod.GET,
          response: ResponseType.BUFFER,
        });

        const gif = await sharp(buffer).gif({ effort: 10 }).toBuffer();

        return {
          name: `gif-${index + 1}.gif`,
          data: gif,
        };
      }),
    );

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      content: `-# ${emoji('GIF')} Hover over the GIF to add them to your favorites`,
      files,
    });
  },
});
