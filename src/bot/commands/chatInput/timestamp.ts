import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { parseDate } from 'chrono-node';
import { emoji } from '../../../utils/markdown';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'timestamp',
  description: 'Generates a Discord style timestamp for the given time',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'time',
      description: 'The time to convert to a timestamp',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'style',
      description: 'The timestamp style to use',
      required: true,
      choices: [
        {
          name: 'Short Time',
          value: 't',
        },
        {
          name: 'Medium Time',
          value: 'T',
        },
        {
          name: 'Short Date',
          value: 'd',
        },
        {
          name: 'Long Date',
          value: 'D',
        },
        {
          name: 'Long Date and Short Time',
          value: 'f',
        },
        {
          name: 'Full Date and Short Time',
          value: 'F',
        },
        {
          name: 'Short Date and Short Time',
          value: 's',
        },
        {
          name: 'Short Date and Medium Time',
          value: 'S',
        },
        {
          name: 'Relative Time',
          value: 'R',
        },
      ],
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    const { time, style } = options;

    const date = parseDate(time, new Date(), { forwardDate: true });

    if (!date) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Please provide a valid time to convert`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.TextDisplay,
          content: `<t:${Math.floor(date.getTime() / 1000)}:${style}>`,
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
