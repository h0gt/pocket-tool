import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
  type APIMessageTopLevelComponent,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { getAutocompleteFocusedOption } from '../../../utils/utils';
import env from '../../../utils/env';
import { emoji, hyperlink, timestamp } from '../../../utils/markdown';
import { makeRequest } from '../../../utils/request';
import { RequestMethod, ResponseType, TimestampStyle } from '../../../types/types';
import { SUPPORTED_LANGUAGES } from '../../constants';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'tweet',
  description: 'Display a tweet preview',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'url',
      description: 'The URL or ID of the tweet',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'language',
      description: 'The language of the tweet (auto for discord locale)',
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
    const { url, language } = options;

    const tolgchuTwitterApiKey = env.get('tolgchu_twitter_api_key').toString();

    if (!tolgchuTwitterApiKey) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Wrong')} Twitter API key not set`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const tweetId = extractTweetId(url);

    if (!tweetId) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a valid tweet URL or ID to view`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    const res = await makeRequest('https://x.tolgchu.dev/post', {
      method: RequestMethod.GET,
      response: ResponseType.JSON,
      headers: {
        Authorization: `Bearer ${tolgchuTwitterApiKey}`,
      },
      params: {
        id: tweetId,
      },
    });

    if (!res) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `${emoji('Exclamation')} Failed to find the tweet`,
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    let content = res.hasText ? res.displayText : undefined;

    let isTranslated = false;

    if (language && content) {
      const translated = await makeRequest('https://translate.googleapis.com/translate_a/single', {
        method: RequestMethod.GET,
        response: ResponseType.JSON,
        params: {
          client: 'gtx',
          sl: res.language ?? 'auto',
          tl: language === 'auto' ? interaction.locale : language,
          dt: 't',
          q: content,
        },
      });

      content = translated[0].map(([translation]: [string]) => translation).join('');
      isTranslated = true;
    }

    for (const hashtag of res.hashtags) {
      const escaped = hashtag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`#${escaped}(?![\\p{L}\\p{N}_])`, 'gu');

      content = content?.replace(pattern, hyperlink(`https://x.com/hashtag/${hashtag}`, `#${hashtag}`));
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        ...(res.quotedPost
          ? ([
              {
                type: ComponentType.TextDisplay,
                content: `-# *Quoting ${hyperlink(`https://x.com/${res.quotedPost?.author.username}/status/${res.quotedPost?.id}`, 'this tweet')}, posted by ${hyperlink(`https://x.com/${res.quotedPost?.author.username}`, `@${res.quotedPost?.author.username}`)}*`,
              },
            ] satisfies APIMessageTopLevelComponent[])
          : res.parentPost
            ? ([
                {
                  type: ComponentType.TextDisplay,
                  content: `-# *Replying to ${hyperlink(`https://x.com/${res.parentPost?.author.username}/status/${res.parentPost?.id}`, 'this tweet')}, posted by ${hyperlink(`https://x.com/${res.parentPost?.author.username}`, `@${res.parentPost?.author.username}`)}*`,
                },
              ] satisfies APIMessageTopLevelComponent[])
            : []),
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `-# Posted by ${res.author.isVerified ? `${emoji('Verified')} ` : ''}**${res.author.name} (${hyperlink(`https://x.com/${res.author.username}`, `@${res.author.username}`)})**${content ? `\n\n${content}` : ''}`,
            },
            ...(res.media.length > 0
              ? ([
                  {
                    type: ComponentType.MediaGallery,
                    items: res.media.slice(0, 10).map((media: any) => ({
                      media: {
                        url: media.url,
                      },
                    })),
                  },
                ] satisfies APIMessageTopLevelComponent[])
              : []),
            ...(isTranslated
              ? ([
                  {
                    type: ComponentType.TextDisplay,
                    content: '-# Translated tweets may be inaccurate or may not reflect the original content',
                  },
                ] satisfies APIMessageTopLevelComponent[])
              : []),
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content: `-# ${timestamp(Temporal.Instant.from(res.createdAt).epochMilliseconds, TimestampStyle.FullDateShortTime)} (${timestamp(Temporal.Instant.from(res.createdAt).epochMilliseconds, TimestampStyle.RelativeTime)})`,
            },
            {
              type: ComponentType.Section,
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: `${emoji('Reply')} ${(res.replyCount ?? 0).toLocaleString('en-US')}   ${emoji('Repost')} ${(res.repostCount ?? 0).toLocaleString('en-US')}   ${emoji('Like')} ${(res.likeCount ?? 0).toLocaleString('en-US')}   ${emoji('Bookmark')} ${(res.bookmarkCount ?? 0).toLocaleString('en-US')}`,
                },
              ],
              accessory: {
                type: ComponentType.Button,
                url: `https://x.com/${res.author.username}/status/${tweetId}`,
                label: 'View Tweet',
                style: ButtonStyle.Link,
              },
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});

function extractTweetId(input: string): string | undefined {
  const trimmed = input.trim();

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const tweetUrl = new URL(trimmed);
    const id = tweetUrl.pathname.split('/').pop();
    return id && /^\d+$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
