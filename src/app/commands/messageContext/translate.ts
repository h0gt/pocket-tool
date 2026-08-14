import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';
import { emoji } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';
import { SUPPORTED_LANGUAGES } from '../../../types/languages';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Translate This Message',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 5,
  acknowledge: true,
  async run(interaction, api) {
    const message = interaction.data.resolved.messages[interaction.data.target_id];

    if (message?.message_snapshots && message.message_snapshots.length > 0) {
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

    if (!message || !message.content.trim()) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
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

    const res = await makeRequest('https://translate.googleapis.com/translate_a/single', {
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

    const translated = res[0].map(([text]: [string]) => text).join('');

    const sourceLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === res[2]);
    const targetLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === interaction.locale.split('-')[0]);

    if (!sourceLanguage || !targetLanguage) {
      throw new Error(`Unsupported language: source=${res[2]}, target=${interaction.locale.split('-')[0]}`);
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
              content: `${translated}\n\n-# ${emoji('Exclamation')} Target language was selected based on the user's locale`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
