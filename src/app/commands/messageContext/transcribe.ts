import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { codeblock, emoji, truncate } from '../../../utils/markdown';
import env from '../../../utils/env';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Speech to Text',
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

    if (
      !message ||
      message.attachments.length === 0 ||
      !message.attachments.find((attachment) => attachment.content_type?.startsWith('audio/'))
    ) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please select a voice message to convert to speech`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const voice = message.attachments.find((attachment) => attachment.content_type?.startsWith('audio/'))!;

    if (!voice.duration_secs || voice.duration_secs > 1 * 60 * 1000) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Voice message must be less than 1 minute`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const elevenLabsApiKey = env.get('eleven_labs_api_key').toString();

    if (!elevenLabsApiKey) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Eleven Labs API key not set`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const buffer = await makeRequest(voice.url, {
      method: RequestMethod.GET,
      response: ResponseType.BUFFER,
    });

    const { ElevenLabsClient } = await import('@elevenlabs/elevenlabs-js');

    const elevenlabs = new ElevenLabsClient({ apiKey: elevenLabsApiKey });

    const transcript = await elevenlabs.speechToText.convert({
      modelId: 'scribe_v2',
      file: new Blob([buffer], {
        type: voice.content_type ?? 'audio/ogg',
      }),
    });

    if (!transcript) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Failed to transcribe voice message`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: codeblock('ansi', truncate(transcript.text, 3995)),
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
