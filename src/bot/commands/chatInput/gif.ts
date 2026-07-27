import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { emoji } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import sharp from 'sharp';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'gif',
  description: 'Turn an image into a GIF',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.Attachment,
      name: 'image',
      description: 'The image to turn into a GIF',
      required: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { image } = options;

    if (!image || !image.content_type?.startsWith('image/')) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a valid image to turn into a GIF`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const buffer = await makeRequest(image.url, {
      method: RequestMethod.GET,
      response: ResponseType.BUFFER,
    });

    const gif = await sharp(buffer).gif().toBuffer();

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      content: '-# Hover over the GIF to add it to your favorites',
      files: [
        {
          name: 'output.gif',
          data: gif,
        },
      ],
    });
  },
});
