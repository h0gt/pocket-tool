import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { findClosestMatch, getAutocompleteFocusedOption } from '../../../utils/utils';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { emoji } from '../../../utils/markdown';
import { AZURE_LANGUAGES } from '../../constants';
import env from '../../../utils/env';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'translate',
  description: 'Translates the given text to pretty much any language',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
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
  async autocomplete(interaction, client) {
    const focused = getAutocompleteFocusedOption(interaction.data.options);
    const value = String(focused?.value ?? '').toLowerCase();

    const languages = AZURE_LANGUAGES.filter((language) => {
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

        await client.api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });

        break;
      }
      case 'to': {
        const choices = [
          {
            name: 'Use my Locale',
            value: 'auto',
          },
          ...languages.map((language) => ({
            name: language.name,
            value: language.code,
          })),
        ].slice(0, 25);

        await client.api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });

        break;
      }
    }
  },
  async run(interaction, options, client) {
    const { text: rawText, from, to } = options;

    const azureApiKey = env.get('azure_api_key').toString();

    if (!azureApiKey) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Microsoft Azure API key not set`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const text = rawText.trim();

    if (!text) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
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

    const sourceCode = from === 'auto' ? undefined : from;
    const targetCode =
      to === 'auto'
        ? (findClosestMatch(
            interaction.locale,
            AZURE_LANGUAGES.map((l) => l.code),
          ) ?? 'en')
        : (to ?? 'en');

    let translation;

    try {
      translation = await makeRequest('https://api.cognitive.microsofttranslator.com/translate', {
        method: RequestMethod.POST,
        response: ResponseType.JSON,
        headers: {
          'Content-type': 'application/json',
          'Ocp-Apim-Subscription-Key': azureApiKey,
        },
        params: {
          'api-version': '3.0',
          ...(sourceCode ? { from: sourceCode } : {}),
          to: targetCode,
        },
        body: [
          {
            text,
          },
        ],
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('(429)')) {
        await client.api.interactions.editReply(interaction.application_id, interaction.token, {
          components: [
            {
              type: ComponentType.Container,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emoji('Wrong')} I'm temporarily rate limited - please try again in a moment`,
                },
              ],
            },
          ],
          flags: MessageFlags.IsComponentsV2,
        });

        return;
      }

      throw error;
    }

    const result = translation[0];
    const translated = result?.translations[0];

    if (!result || !translated) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} I couldn't translate that - please try again`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    const actualSourceCode = sourceCode ?? result.detectedLanguage?.language;

    const sourceLanguage = AZURE_LANGUAGES.find((language) => language.code === actualSourceCode);

    if (!sourceLanguage) {
      throw new Error(`Unsupported source language: ${actualSourceCode}`);
    }

    const targetLanguage = AZURE_LANGUAGES.find((language) => language.code === translated.to);

    if (!targetLanguage) {
      throw new Error(`Unsupported target language: ${translated.to}`);
    }

    await client.api.interactions.editReply(interaction.application_id, interaction.token, {
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
              content: `${translated.text}${
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
