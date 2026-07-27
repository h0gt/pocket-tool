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
import { getChatInputFocusedOption } from '../../../utils/utils';
import env from '../../../utils/env';
import { emoji } from '../../../utils/markdown';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

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
      max_length: 500,
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
    const focused = getChatInputFocusedOption(interaction.data.options);
    const value = String(focused?.value).toLowerCase() ?? '';

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

    const elevenlabs = new ElevenLabsClient({ apiKey: elevenLabsApiKey });

    const audio = await elevenlabs.textToSpeech.convertWithTimestamps(voice ?? 'M563YhMmA0S8vEYwkgYa', {
      text,
      languageCode: !language || language === 'auto' ? interaction.locale.split('-')[0]! : language.split('-')[0]!,
      modelId: 'eleven_flash_v2_5',
      outputFormat: 'opus_48000_192',
    });

    const buffer = Buffer.from(audio.audioBase64, 'base64');

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      attachments: [
        {
          id: 0,
          filename: 'tts.opus',
          waveform: 'AAAAAA==',
          duration_secs: 1,
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
  },
});
