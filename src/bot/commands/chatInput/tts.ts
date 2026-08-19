import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { getAutocompleteFocusedOption, hasPlus } from '../../../utils/utils';
import env from '../../../utils/env';
import { emoji, timestamp, truncate } from '../../../utils/markdown';
import { SUPPORTED_LANGUAGES } from '../../../types/constants';
import { redis } from '../../../utils/redis';
import { TimestampStyle } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'tts',
  description: 'Converts text to speech',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'text',
      description: 'The text to convert to speech',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'voice',
      description: 'The voice to use for the TTS',
      required: false,
      choices: [
        { name: 'Male', value: 'UgBBYS2sOqTuMpoF3BR0' },
        { name: 'Female', value: 'nf4MCGNSdM0hxM95ZBQR' },
        { name: 'Neutral', value: 'M563YhMmA0S8vEYwkgYa' },
      ],
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'language',
      description: 'The language to use for the TTS',
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
  },
  async run(interaction, options, api) {
    const { text, voice, language } = options;

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

    if (!text.trim()) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a text message to convert to speech`,
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

    const audio = await elevenlabs.textToSpeech.convertWithTimestamps(voice ?? 'M563YhMmA0S8vEYwkgYa', {
      text: truncate(text.trim(), plus ? 1000 : 500),
      languageCode: !language || language === 'auto' ? interaction.locale.split('-')[0]! : language.split('-')[0]!,
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
