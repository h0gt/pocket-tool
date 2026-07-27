import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type API,
  type APIMessage,
  type APIMessageComponentButtonInteraction,
  type APIMessageComponentEmoji,
  type APIMessageComponentSelectMenuInteraction,
  type APIMessageTopLevelComponent,
} from '@discordjs/core/http-only';
import { randomBytes } from 'node:crypto';
import { cdn, emoji } from './markdown.js';
import { CARD_COLOURS, CARD_FONTS, CARD_LOOKS, CARD_SIZES, renderQuoteCard, type CardOptions } from './quoteCard.js';
import { toEmoji } from './utils.js';

const SESSION_LIFETIME = 14 * 60 * 1_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export type QuoteOption = 'font' | 'size' | 'colour' | 'look';

export type QuoteSession = {
  id: string;
  ownerId: string;
  sourceMessageId: string;
  sourceUrl: string;
  options: CardOptions;
  primaryImage?: Buffer;
  avatarImage?: Buffer;
  expiresAt: number;
  busy: boolean;
};

const sessions = new Map<string, QuoteSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}, 60_000).unref();

export async function createQuoteSession(message: APIMessage, ownerId: string, displayName?: string, guildId?: string): Promise<QuoteSession> {
  const primaryUrl = findPrimaryImage(message);
  const avatarUrl = getAvatarUrl(message);
  const [primaryImage, avatarImage] = await Promise.all([primaryUrl ? downloadImage(primaryUrl) : Promise.resolve(undefined), downloadImage(avatarUrl)]);

  const session: QuoteSession = {
    id: randomBytes(6).toString('hex'),
    ownerId,
    sourceMessageId: message.id,
    sourceUrl: `https://discord.com/channels/${guildId ?? '@me'}/${message.channel_id}/${message.id}`,
    options: {
      quote: extractQuoteText(message),
      credit: displayName || displayNameFor(message),
      handle: `@${message.author.username}`,
      font: 'modern',
      size: 'auto',
      colour: 'auto',
      look: 'spotlight-original',
    },
    ...(primaryImage !== undefined && { primaryImage }),
    ...(avatarImage !== undefined && { avatarImage }),
    expiresAt: Date.now() + SESSION_LIFETIME,
    busy: false,
  };

  sessions.set(session.id, session);
  return session;
}

export function hasQuoteContent(message: APIMessage): boolean {
  return Boolean(message.content.trim() || message.embeds.some((embed) => embed.description?.trim() || embed.title?.trim()));
}
export async function renderQuoteSession(session: QuoteSession): Promise<Buffer> {
  return renderQuoteCard({
    ...session.options,
    ...(session.primaryImage !== undefined && {
      primaryImage: session.primaryImage,
    }),
    ...(session.avatarImage !== undefined && {
      avatarImage: session.avatarImage,
    }),
  });
}

export function buildQuoteComponents(session: QuoteSession): APIMessageTopLevelComponent[] {
  const select = (option: QuoteOption, placeholder: string, values: Record<string, { label: string; description: string }>) => ({
    type: ComponentType.ActionRow as const,
    components: [
      {
        type: ComponentType.StringSelect as const,
        custom_id: `quote-select_${session.id}_${option}`,
        title: placeholder,
        placeholder,
        options: Object.entries(values).map(([value, item]) => ({
          label: item.label,
          description: item.description,
          value,
          default: value === session.options[option],
        })),
      },
    ],
  });

  return [
    select('font', 'Choose a font', CARD_FONTS),
    select('size', 'Choose a text size', CARD_SIZES),
    select('colour', 'Choose a text colour', CARD_COLOURS),
    select('look', 'Choose a layout and image effect', CARD_LOOKS),
    {
      type: ComponentType.ActionRow as const,
      components: [
        {
          type: ComponentType.Button as const,
          custom_id: `quote-action_${session.id}_shuffle`,
          label: 'Surprise me',
          style: ButtonStyle.Secondary as ButtonStyle.Secondary,
        },
        {
          type: ComponentType.Button as const,
          url: session.sourceUrl,
          label: 'View original',
          style: ButtonStyle.Link as ButtonStyle.Link,
        },
        {
          type: ComponentType.Button as const,
          custom_id: `quote-action_${session.id}_close`,
          emoji: toEmoji('Trash') as APIMessageComponentEmoji,
          style: ButtonStyle.Secondary as ButtonStyle.Secondary,
        },
      ],
    },
  ];
}

export async function handleQuoteSelect(interaction: APIMessageComponentSelectMenuInteraction, sessionId: string, option: string, api: API): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api);
  if (!session || session.busy) return;

  if (!isQuoteOption(option) || !('values' in interaction.data)) {
    await reportComponentError(interaction, api, 'That quote option is no longer available.');
    return;
  }

  const value = interaction.data.values[0];
  if (!value || !setQuoteOption(session, option, value)) {
    await reportComponentError(interaction, api, 'That quote option is no longer available.');
    return;
  }

  await refreshQuote(interaction, session, api);
}

export async function handleQuoteAction(interaction: APIMessageComponentButtonInteraction, sessionId: string, action: string, api: API): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api);
  if (!session || session.busy) return;

  if (action === 'shuffle') {
    session.options.font = randomKey(CARD_FONTS);
    session.options.size = randomKey(CARD_SIZES);
    session.options.colour = randomKey(CARD_COLOURS);
    session.options.look = randomKey(CARD_LOOKS);
    await refreshQuote(interaction, session, api);
    return;
  }

  if (action === 'close') {
    sessions.delete(session.id);
    await api.interactions.deleteReply(interaction.application_id, interaction.token);
  }
}

async function refreshQuote(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction,
  session: QuoteSession,
  api: API,
): Promise<void> {
  session.busy = true;
  session.expiresAt = Date.now() + SESSION_LIFETIME;

  try {
    const image = await renderQuoteSession(session);
    await api.interactions.editReply(interaction.application_id, interaction.token, {
      attachments: [],
      files: [
        {
          name: `quote-${session.sourceMessageId}.png`,
          data: image,
        },
      ],
      components: buildQuoteComponents(session),
    });
  } finally {
    session.busy = false;
  }
}

async function getAvailableSession(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction,
  sessionId: string,
  api: API,
): Promise<QuoteSession | undefined> {
  const session = sessions.get(sessionId);
  const userId = interaction.user?.id ?? interaction.member?.user.id;

  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(session.id);
    await reportComponentError(interaction, api, `${emoji('Exclamation')} That quote editor has expired - run **Apps -> Quote Message** again`);
    return undefined;
  }

  if (session.ownerId !== userId) {
    await reportComponentError(interaction, api, `${emoji('Exclamation')} Only the person who made this quote can change it`);
    return undefined;
  }

  if (session.busy) {
    await reportComponentError(interaction, api, `${emoji('Exclamation')} The quote is still rendering`);
    return undefined;
  }

  return session;
}

async function reportComponentError(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction,
  api: API,
  content: string,
): Promise<void> {
  await api.interactions.followUp(interaction.application_id, interaction.token, {
    components: [
      {
        type: ComponentType.Container,
        components: [
          {
            type: ComponentType.TextDisplay,
            content,
          },
        ],
      },
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

function setQuoteOption(session: QuoteSession, option: QuoteOption, value: string): boolean {
  if (option === 'font' && value in CARD_FONTS) {
    session.options.font = value as CardOptions['font'];
  } else if (option === 'size' && value in CARD_SIZES) {
    session.options.size = value as CardOptions['size'];
  } else if (option === 'colour' && value in CARD_COLOURS) {
    session.options.colour = value as CardOptions['colour'];
  } else if (option === 'look' && value in CARD_LOOKS) {
    session.options.look = value as CardOptions['look'];
  } else {
    return false;
  }

  return true;
}

function isQuoteOption(value: string): value is QuoteOption {
  return value === 'font' || value === 'size' || value === 'colour' || value === 'look';
}

function extractQuoteText(message: APIMessage): string {
  const fromEmbed = message.embeds.map((embed) => embed.description || embed.title).find((value): value is string => Boolean(value?.trim()));

  return (message.content.trim() || fromEmbed || 'Shared a moment worth remembering')
    .replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ':$1:')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 600);
}

function displayNameFor(message: APIMessage): string {
  return message.author.global_name || message.author.username;
}

function findPrimaryImage(message: APIMessage): string | undefined {
  const attachment = Object.values(message.attachments).find(
    (item) => item.content_type?.startsWith('image/') || /\.(?:png|jpe?g|webp|gif)$/i.test(item.filename),
  );
  if (attachment) return preferredImageUrl(attachment.url, attachment.proxy_url);

  for (const embed of message.embeds) {
    if (embed.image?.proxy_url || embed.image?.url) {
      return preferredImageUrl(embed.image.url, embed.image.proxy_url);
    }
    if (embed.thumbnail?.proxy_url || embed.thumbnail?.url) {
      return preferredImageUrl(embed.thumbnail.url, embed.thumbnail.proxy_url);
    }
  }

  return undefined;
}

/** Prefer Discord's original CDN asset; embedded external images use Discord's safe proxy. */
function preferredImageUrl(original?: string, proxy?: string): string | undefined {
  if (original && isTrustedDiscordUrl(original)) return original;
  return proxy || original;
}

function isTrustedDiscordUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      (parsedUrl.hostname === 'discordapp.com' ||
        parsedUrl.hostname.endsWith('.discordapp.com') ||
        parsedUrl.hostname === 'discordapp.net' ||
        parsedUrl.hostname.endsWith('.discordapp.net'))
    );
  } catch {
    return false;
  }
}

function getAvatarUrl(message: APIMessage): string {
  if (message.author.avatar) {
    return cdn(`/avatars/${message.author.id}/${message.author.avatar}`, 1024, 'png', message.author.avatar.startsWith('a_'));
  }

  const index = message.author.discriminator === '0' ? Number((BigInt(message.author.id) >> 22n) % 6n) : Number(message.author.discriminator) % 5;
  return cdn(`/embed/avatars/${index}`, 1024, 'png');
}

async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    const parsedUrl = new URL(url);
    if (!isTrustedDiscordUrl(parsedUrl.toString())) return undefined;

    const response = await fetch(parsedUrl, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'PocketToolQuote/1.0' },
    });
    if (!response.ok || !response.body) return undefined;

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return undefined;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks, totalBytes);
  } catch (error) {
    console.warn(`Could not download quote image: ${String(error)}`);
    return undefined;
  }
}

function randomKey<T extends Record<string, unknown>>(record: T): keyof T {
  const keys = Object.keys(record) as Array<keyof T>;
  return keys[Math.floor(Math.random() * keys.length)]!;
}
