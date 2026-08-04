import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../helpers/command';
import { getAutocompleteFocusedOption } from '../../../utils/utils';
import { DateTime } from 'luxon';
import { emoji } from '../../../utils/markdown';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'timezone',
  description: 'View the current time for a specific timezone',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'zone',
      description: 'The timezone to view the current time for',
      required: true,
      autocomplete: true,
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async autocomplete(interaction, api) {
    const focused = getAutocompleteFocusedOption(interaction.data.options);
    const value = String(focused?.value).toLowerCase() ?? '';

    const choices = Object.values(Intl.supportedValuesOf('timeZone'))
      .map((z) => ({
        name: z,
        value: z,
      }))
      .filter((c) => c.name.toLowerCase().includes(value))
      .slice(0, 25);

    await api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });
  },
  async run(interaction, options, api) {
    const { zone } = options;

    const time = DateTime.now().setZone(zone);

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Clock')} **${zone}**: ${time.toFormat("cccc d LLLL yyyy 'at' HH:mm:ss")}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
