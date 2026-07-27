import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  TextInputStyle,
  type API,
  type APIMessage,
  type APIMessageComponentButtonInteraction,
  type APIMessageComponentEmoji,
  type APIMessageComponentSelectMenuInteraction,
  type APIModalSubmitInteraction,
  type APIMessageTopLevelComponent,
} from '@discordjs/core/http-only';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { cdn, emoji } from './markdown.js';
import { CARD_COLOURS, CARD_FONTS, CARD_LOOKS, CARD_SIZES, renderQuoteCard, type CardOptions } from './quoteCard.js';
import { toEmoji } from './utils.js';

const SESSION_LIFETIME = 24 * 60 * 60 * 1_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const SESSION_STORE_PATH = resolve(process.cwd(), '.cache', 'quote-sessions.json');

export type QuoteOption = 'font' | 'size' | 'colour' | 'look';
type CustomTextOption = 'size' | 'colour';

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
  editorChannelId?: string;
  editorMessageId?: string;
  editorInteractionToken?: string;
};

const sessions = new Map<string, QuoteSession>();

type StoredQuoteSession = Omit<QuoteSession, 'primaryImage' | 'avatarImage' | 'busy' | 'editorInteractionToken'> & {
  primaryImage?: string;
  avatarImage?: string;
};

function restoreSessions(): void {
  try {
    if (!existsSync(SESSION_STORE_PATH)) return;

    const stored = JSON.parse(readFileSync(SESSION_STORE_PATH, 'utf8')) as StoredQuoteSession[];
    const now = Date.now();
    for (const item of stored) {
      if (!item?.id || item.expiresAt <= now) continue;
      const { primaryImage, avatarImage, ...session } = item;
      sessions.set(item.id, {
        ...session,
        expiresAt: Math.max(session.expiresAt, now + SESSION_LIFETIME),
        ...(primaryImage && { primaryImage: Buffer.from(primaryImage, 'base64') }),
        ...(avatarImage && { avatarImage: Buffer.from(avatarImage, 'base64') }),
        busy: false,
      });
    }
  } catch {}
}

function restoreSession(sessionId: string): QuoteSession | undefined {
  try {
    if (!existsSync(SESSION_STORE_PATH)) return undefined;

    const item = (JSON.parse(readFileSync(SESSION_STORE_PATH, 'utf8')) as StoredQuoteSession[]).find((stored) => stored.id === sessionId);
    if (!item || item.expiresAt <= Date.now()) return undefined;

    const { primaryImage, avatarImage, ...session } = item;
    const restored: QuoteSession = {
      ...session,
      ...(primaryImage && { primaryImage: Buffer.from(primaryImage, 'base64') }),
      ...(avatarImage && { avatarImage: Buffer.from(avatarImage, 'base64') }),
      busy: false,
    };
    sessions.set(restored.id, restored);
    return restored;
  } catch (error) {
    console.error(`Could not restore quote editor ${sessionId}:`, error);
    return undefined;
  }
}

function persistSessions(): void {
  try {
    const stored: StoredQuoteSession[] = [...sessions.values()].map(
      ({ primaryImage, avatarImage, busy: _busy, editorInteractionToken: _token, ...session }) => ({
        ...session,
        ...(primaryImage && { primaryImage: primaryImage.toString('base64') }),
        ...(avatarImage && { avatarImage: avatarImage.toString('base64') }),
      }),
    );

    if (stored.length === 0) {
      if (existsSync(SESSION_STORE_PATH)) unlinkSync(SESSION_STORE_PATH);
      return;
    }

    mkdirSync(dirname(SESSION_STORE_PATH), { recursive: true });
    const temporaryPath = `${SESSION_STORE_PATH}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(stored));
    copyFileSync(temporaryPath, SESSION_STORE_PATH);
    unlinkSync(temporaryPath);
  } catch {}
}

restoreSessions();

setInterval(() => {
  const now = Date.now();
  let removed = false;
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
      removed = true;
    }
  }
  if (removed) persistSessions();
}, 60_000).unref();

export async function createQuoteSession(message: APIMessage, ownerId: string, displayName?: string, guildId?: string): Promise<QuoteSession> {
  const primaryUrl = findPrimaryImage(message);
  const avatarUrl = getAvatarUrl(message);
  const [primaryImage, avatarImage] = await Promise.all([primaryUrl ? downloadImage(primaryUrl) : Promise.resolve(undefined), downloadImage(avatarUrl)]);

  const session: QuoteSession = {
    id: randomBytes(8).toString('hex'),
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
  persistSessions();
  return session;
}

export function saveQuoteSession(session: QuoteSession): void {
  if (sessions.has(session.id)) persistSessions();
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

  const customSelect = (
    option: CustomTextOption,
    placeholder: string,
    values: Record<string, { label: string; description: string }>,
    customLabel: string,
  ) => ({
    type: ComponentType.ActionRow as const,
    components: [
      {
        type: ComponentType.StringSelect as const,
        custom_id: `quote-custom-select_${session.id}_${option}`,
        title: placeholder,
        placeholder,
        options: [
          ...Object.entries(values).map(([value, item]) => ({
            label: item.label,
            description: item.description,
            value,
            default: value === session.options[option],
          })),
          { label: customLabel, description: 'Enter your own value', value: 'custom' },
        ],
      },
    ],
  });

  return [
    select('font', 'Choose a font', CARD_FONTS),
    customSelect('size', 'Choose a text size', CARD_SIZES, 'Custom font size'),
    customSelect('colour', 'Choose a text colour', CARD_COLOURS, 'Custom text colour'),
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
    delete session.options.customSize;
    delete session.options.customColour;
    await refreshQuote(interaction, session, api);
    return;
  }

  if (action === 'close') {
    try {
      await api.interactions.deleteReply(interaction.application_id, interaction.token);
    } catch {
      if (!session.editorChannelId || !session.editorMessageId) throw new Error('Quote editor message could not be deleted');
      await api.channels.deleteMessage(session.editorChannelId, session.editorMessageId);
    }
    sessions.delete(session.id);
    persistSessions();
  }
}

export async function openQuoteCustomTextModal(
  interaction: APIMessageComponentSelectMenuInteraction,
  sessionId: string,
  option: CustomTextOption,
  api: API,
): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api, false);
  if (!session) return;

  const isSize = option === 'size';
  await api.interactions.createModal(interaction.id, interaction.token, {
    custom_id: `quote-custom-modal_${session.id}_${option}`,
    title: isSize ? 'Custom font size' : 'Custom text colour',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: isSize ? 'font-size' : 'colour',
            label: isSize ? 'Font size (30-140 px)' : 'Text colour (hex)',
            style: TextInputStyle.Short,
            value: isSize ? (session.options.customSize ? String(session.options.customSize) : undefined) : session.options.customColour,
            placeholder: isSize ? '30 to 140' : 'Example: #f7f3ec',
            required: true,
            max_length: isSize ? 3 : 7,
          },
        ],
      },
    ],
  });
}

export async function handleQuoteCustomSelect(
  interaction: APIMessageComponentSelectMenuInteraction,
  sessionId: string,
  option: CustomTextOption,
  api: API,
): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api, false);
  if (!session || !('values' in interaction.data)) return;

  const value = interaction.data.values[0];
  if (value === 'custom') {
    await openQuoteCustomTextModal(interaction, sessionId, option, api);
    return;
  }

  if (!value || !setQuoteOption(session, option, value)) {
    await reportComponentError(interaction, api, 'That quote option is no longer available.', false);
    return;
  }

  await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  await refreshQuote(interaction, session, api);
}

export async function handleQuoteCustomTextModal(interaction: APIModalSubmitInteraction, sessionId: string, option: CustomTextOption, api: API): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api, false);
  if (!session) return;

  const value = modalInputValue(interaction, option === 'size' ? 'font-size' : 'colour').trim();

  if (option === 'size' && (!/^\d+$/.test(value) || Number(value) < 30 || Number(value) > 140)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      content: 'Font size must be a whole number from 30 to 140.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (option === 'colour' && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      content: 'Colour must be a hex value such as #f7f3ec.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (option === 'size') session.options.customSize = Number(value);
  else session.options.customColour = value;
  session.expiresAt = Date.now() + SESSION_LIFETIME;
  persistSessions();
  await api.interactions.defer(interaction.id, interaction.token, { flags: MessageFlags.Ephemeral });
  session.busy = true;

  try {
    const image = await renderQuoteSession(session);
    await editQuoteEditor(api, session, image, interaction);
    await api.interactions.editReply(interaction.application_id, interaction.token, {
      content: option === 'size' ? 'Custom font size applied.' : 'Custom text colour applied.',
    });
  } finally {
    session.busy = false;
    persistSessions();
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
    await editQuoteEditor(api, session, image, interaction);
  } finally {
    session.busy = false;
    persistSessions();
  }
}

async function getAvailableSession(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction,
  sessionId: string,
  api: API,
  canFollowUp: boolean = true,
): Promise<QuoteSession | undefined> {
  const session = sessions.get(sessionId) ?? restoreSession(sessionId);
  const userId = interaction.user?.id ?? interaction.member?.user.id;

  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      sessions.delete(session.id);
      persistSessions();
    }
    console.warn(`Quote editor unavailable: ${sessionId} (active sessions: ${sessions.size})`);
    await reportComponentError(
      interaction,
      api,
      `${emoji('Exclamation')} That quote editor has expired - run **Apps -> Quote This Message** again`,
      canFollowUp,
    );
    return undefined;
  }

  if (session.ownerId !== userId) {
    await reportComponentError(interaction, api, `${emoji('Exclamation')} Only the person who made this quote can change it`, canFollowUp);
    return undefined;
  }

  if (session.busy) {
    await reportComponentError(interaction, api, `${emoji('Exclamation')} The quote is still rendering`, canFollowUp);
    return undefined;
  }
  if ('component_type' in interaction.data && 'message' in interaction && interaction.message) {
    session.editorChannelId = interaction.message.channel_id;
    session.editorMessageId = interaction.message.id;
    session.editorInteractionToken = interaction.token;
    persistSessions();
  }

  return session;
}

function modalInputValue(interaction: APIModalSubmitInteraction, customId: string): string {
  for (const component of interaction.data.components) {
    const inputs = 'components' in component ? component.components : 'component' in component ? [component.component] : [];
    const input = inputs.find((item) => item.custom_id === customId && 'value' in item);
    if (input && 'value' in input && typeof input.value === 'string') return input.value;
  }
  return '';
}

async function reportComponentError(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction,
  api: API,
  content: string,
  canFollowUp: boolean = true,
): Promise<void> {
  const response = {
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
    ] as APIMessageTopLevelComponent[],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };

  if (canFollowUp && 'message' in interaction) {
    await api.interactions.followUp(interaction.application_id, interaction.token, response);
  } else {
    await api.interactions.reply(interaction.id, interaction.token, response);
  }
}

function setQuoteOption(session: QuoteSession, option: QuoteOption, value: string): boolean {
  if (option === 'font' && value in CARD_FONTS) {
    session.options.font = value as CardOptions['font'];
  } else if (option === 'size' && value in CARD_SIZES) {
    session.options.size = value as CardOptions['size'];
    delete session.options.customSize;
  } else if (option === 'colour' && value in CARD_COLOURS) {
    session.options.colour = value as CardOptions['colour'];
    delete session.options.customColour;
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

async function editQuoteEditor(
  api: API,
  session: QuoteSession,
  image: Buffer,
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction,
): Promise<void> {
  const filename = `quote-${session.sourceMessageId}-${Date.now()}.gif`;
  const payload = {
    attachments: [{ id: 0, filename }],
    files: [{ name: filename, data: image }],
    components: buildQuoteComponents(session),
  };

  const editorToken = session.editorInteractionToken;
  if (editorToken) {
    await api.interactions.editReply(interaction.application_id, editorToken, payload);
    return;
  }

  if ('message' in interaction && interaction.message) {
    session.editorChannelId = interaction.message.channel_id;
    session.editorMessageId = interaction.message.id;
    persistSessions();
    await api.channels.editMessage(session.editorChannelId, session.editorMessageId, payload);
    return;
  }

  throw new Error(`Quote editor ${session.id} has no editable message reference`);
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
