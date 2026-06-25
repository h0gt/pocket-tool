import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { all, create } from 'mathjs';
import { emoji } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import sharp from 'sharp';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'calculate',
  description: 'Solved mathematical expressions',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'expression',
      description: 'The mathematical expression to solve',
      required: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { expression } = options;

    let result: number;
    let latex: string;

    const math = create(all!);

    try {
      const node = math.parse(expression);
      result = node.evaluate();
      latex = node.toTex({ parenthesis: 'auto' });
    } catch {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Invalid expression provided, use an expression such as 2^10 or sqrt(144)`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const fullLatex = `\\mathbf{${latex} = ${result}}`;
    const encoded = encodeURIComponent(`\\dpi{300}\\bg_white ${fullLatex}`);

    const buffer = await makeRequest(`https://latex.codecogs.com/png.latex?${encoded}`, {
      method: RequestMethod.GET,
      response: ResponseType.BUFFER,
    });

    const image = sharp(buffer);

    const paddingX = 40;
    const paddingY = 30;

    const finalBuffer = await image
      .extend({
        top: paddingY,
        bottom: paddingY,
        left: paddingX,
        right: paddingX,
        background: { r: 255, g: 255, b: 255 },
      })
      .toBuffer();

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.MediaGallery,
              items: [
                {
                  media: {
                    url: `attachment://result.png`,
                  },
                },
              ],
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
      files: [
        {
          name: 'result.png',
          data: finalBuffer,
        },
      ],
    });
  },
});
