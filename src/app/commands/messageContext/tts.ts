import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';
import env from '../../../utils/env';
import { emoji, timestamp, truncate } from '../../../utils/markdown';
import { redis } from '../../../utils/redis';
import { TimestampStyle } from '../../../types/types';
import { hasPlus } from '../../../utils/utils';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'Text To Speech',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 5,
  acknowledge: true,
  async run(interaction, api) {
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

    const date = new Date().toISOString().slice(0, 10);
    const key = `tts:${interaction.user?.id ?? interaction.member?.user.id}:${date}`;

    const usage = Number((await redis.get(key)) ?? 0);

    const plus = await hasPlus((interaction.user?.id ?? interaction.member?.user.id)!, api);
    const limit = plus ? 50 : 10;

    if (usage >= limit) {
      const resetAt = new Date();
      resetAt.setUTCHours(24, 0, 0, 0);

      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} You have reached your daily TTS limit of ${limit} messages - try again ${timestamp(resetAt.getTime(), TimestampStyle.RelativeTime)}.`,
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
                content: `${emoji('Exclamation')} Please select a text message to convert to speech`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const [{ ElevenLabsClient }, { decodeOpusBytes, getWaveform }] = await Promise.all([
      import('@elevenlabs/elevenlabs-js'),
      import('../../../utils/opus'),
    ]);

    const elevenlabs = new ElevenLabsClient({ apiKey: elevenLabsApiKey });

    const audio = await elevenlabs.textToSpeech.convertWithTimestamps('M563YhMmA0S8vEYwkgYa', {
      text: truncate(message.content.trim(), plus ? 500 : 100),
      modelId: 'eleven_flash_v2_5',
      outputFormat: 'opus_48000_192',
    });

    if (!audio) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Failed to generate TTS audio`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const buffer = Buffer.from(audio.audioBase64, 'base64');
    const decoded = await decodeOpusBytes(buffer);

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      attachments: [
        {
          id: 0,
          filename: 'tts.opus',
          waveform: getWaveform(decoded),
          duration_secs: decoded.samplesDecoded / decoded.sampleRate,
        },
      ],
      files: [
        {
          name: 'tts.opus',
          data: buffer,
        },
      ],
      flags: MessageFlags.IsVoiceMessage,
    });

    await redis.incr(key);
  },
});
