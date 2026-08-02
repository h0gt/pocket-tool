import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import util from 'util';
import { codeblock, truncate } from '../../../utils/markdown';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'eval',
  description: 'Evaluates the provided code',
  integration_types: [ApplicationIntegrationType.GuildInstall],
  contexts: [InteractionContextType.Guild],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'code',
      description: 'The code to evaluate',
      required: true,
    },
  ],
  guilds: ['1533439024637939792'],
  dev: true,
  acknowledge: true,
  async run(interaction, options, api) {
    const { code } = options;

    let result;

    try {
      result = eval(code);
    } catch (error) {
      result = error;
    }

    let value = result;

    if (result && typeof result.then === 'function') {
      try {
        value = await result;
      } catch (error) {
        value = error;
      }
    }

    const formatted = typeof value === 'string' ? value : util.inspect(value);

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: codeblock('ts', truncate(formatted, 3985)),
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
