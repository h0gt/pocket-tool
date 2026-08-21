import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { getAutocompleteFocusedOption } from '../../../utils/utils';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { emoji } from '../../../utils/markdown';
import { SUPPORTED_LANGUAGES } from '../../constants';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'translate',
  description: 'Translates the given text to pretty much any language',
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

    const languages = SUPPORTED_LANGUAGES.filter((language) => {
      return language.name.toLowerCase().includes(value) || language.code.toLowerCase().includes(value);
    });

    switch (focused?.name) {
      case 'from': {
        const choices = [
          {
            name: 'Auto Detect',
            value: 'auto',
          },
          ...languages.map((language) => ({
            name: language.name,
            value: language.code,
          })),
        ].slice(0, 25);

        await api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });

        break;
      }
      case 'to': {
        const choices = [
          {
            name: 'Use my locale',
            value: 'auto',
          },
          ...languages.map((language) => ({
            name: language.name,
            value: language.code,
          })),
        ].slice(0, 25);

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
        tl: to === 'auto' ? interaction.locale.split('-')[0]! : (to ?? interaction.locale.split('-')[0]!),
        dt: 't',
        q: query,
      },
    });

    const translated = res[0].map(([translation]: [string]) => translation).join('');

    const sourceCode = res[2];
    const targetCode = to === 'auto' ? interaction.locale.split('-')[0]! : (to ?? interaction.locale.split('-')[0]!);

    const sourceLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === sourceCode);
    const targetLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === targetCode);

    if (!sourceLanguage || !targetLanguage) {
      throw new Error(`Unsupported language: source=${sourceCode}, target=${targetCode}`);
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `> ${emoji('Translate')} Translated from **${sourceLanguage.flag ? `${sourceLanguage.flag} ` : ''}${sourceLanguage.name}** to **${targetLanguage.flag ? `${targetLanguage.flag} ` : ''}${targetLanguage.name}**`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `${translated}${
                to === undefined || to === 'auto'
                  ? `\n\n-# ${emoji('Exclamation')} Target language was selected based on the user's locale`
                  : ''
              }`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
