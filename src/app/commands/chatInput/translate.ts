import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  Locale,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { getAutocompleteFocusedOption } from '../../../utils/utils';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { emoji } from '../../../utils/markdown';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'translate',
  description: 'Translates the given text to any language',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'text',
      description: 'The text to translate',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'from',
      description: 'The language to translate from',
      required: false,
      autocomplete: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'to',
      description: 'The language to translate to',
      required: false,
      autocomplete: true,
    },
  ],
  cooldown: 5,
  acknowledge: true,
  async autocomplete(interaction, api) {
    const focused = getAutocompleteFocusedOption(interaction.data.options);
    const value = String(focused?.value).toLowerCase() ?? '';

    switch (focused?.name) {
      case 'from': {
        const choices = [
          {
            name: 'Auto',
            value: 'auto',
          },
          ...Object.entries(Locale).map(([key, value]) => ({
            name: key,
            value,
          })),
        ]
          .filter((c) => c.name.toLowerCase().includes(value))
          .slice(0, 25);

        await api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });
        break;
      }
      case 'to': {
        const choices = Object.entries(Locale)
          .map(([key, value]) => ({
            name: key,
            value,
          }))
          .filter((c) => c.name.toLowerCase().includes(value))
          .slice(0, 25);

        await api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });
        break;
      }
    }
  },
  async run(interaction, options, api) {
    const { text, from, to } = options;

    const query = text.trim();

    if (!query) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a text message to translate`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const res = await makeRequest('https://translate.googleapis.com/translate_a/single', {
      method: RequestMethod.GET,
      response: ResponseType.JSON,
      params: {
        client: 'gtx',
        sl: from ?? 'auto',
        tl: to ?? interaction.locale,
        dt: 't',
        q: query,
      },
    });

    const languages = new Intl.DisplayNames(['en-US'], {
      type: 'language',
    });

    const translated = res[0].map(([text]: [string]) => text).join('');

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `> ${emoji('Translate')} Translated from **${languages.of(res[2])}** to **${languages.of(to ?? interaction.locale)}**`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `${translated}${to === undefined ? `\n\n-# ${emoji('Exclamation')} Target language was selected based on the user's locale` : ''}`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
