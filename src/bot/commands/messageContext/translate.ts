import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { emoji } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { LANGUAGES } from '../../constants';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Translate This Message',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 5,
  acknowledge: true,
  async run(interaction, client) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

    if (message?.message_snapshots && message.message_snapshots.length > 0) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
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

    if (!message || !message.content.trim()) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select a text message to translate`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    let translation;

    try {
      translation = await makeRequest('https://translate.googleapis.com/translate_a/single', {
        method: RequestMethod.GET,
        response: ResponseType.JSON,
        params: {
          client: 'gtx',
          sl: 'auto',
          tl: interaction.locale.split('-')[0]!,
          dt: 't',
          q: message.content.trim(),
        },
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

    const translated = translation[0].map(([text]: [string]) => text).join('');

    const sourceLanguage = LANGUAGES.find((l) => l.code === translation[2]);
    const targetLanguage = LANGUAGES.find((l) => l.code === interaction.locale.split('-')[0]);

    if (!sourceLanguage || !targetLanguage) {
      throw new Error(`Unsupported language: source=${translation[2]}, target=${interaction.locale.split('-')[0]}`);
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
              content: `${translated}\n\n-# ${emoji('Exclamation')} Target language was selected based on the user's locale`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
