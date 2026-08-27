import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { codeblock, emoji, truncate } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import env from '../../../utils/env';
import { RequestMethod, ResponseType } from '../../../types/types';

createApplicationCommand({
  type: ApplicationCommandType.Message,
  name: 'What Did They Type?',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, client) {
    const saplingApiKey = env.get('sapling_api_key').toString();

    if (!saplingApiKey) {
      await client.api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Sapling api key not set`,
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
                content: `${emoji('Exclamation')} Please select a message with text to spellcheck`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const text = message.content.trim();

    let spellcheck;

    try {
      spellcheck = await makeRequest('https://api.sapling.ai/api/v1/spellcheck', {
        method: RequestMethod.POST,
        response: ResponseType.JSON,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          key: saplingApiKey,
          text: text,
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

    const corrected = applyCorrections(text, spellcheck.edits ?? []);

    await client.api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: codeblock('ansi', truncate(corrected, 3995)),
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});

function applyCorrections(text: string, edits: any[]) {
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  }

  return text;
}
