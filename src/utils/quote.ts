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
import { cdn, emoji } from './markdown';
import { CARD_COLORS, CARD_FONTS, CARD_LOOKS, CARD_SIZES, renderQuoteCard, type CardOptions } from './quoteCard';
import { toEmoji } from './utils';
import { Collection } from '@discordjs/collection';

const SESSION_LIFETIME = 3 * 60 * 1_000;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const SESSION_STORE_PATH = resolve(process.cwd(), '.cache', 'quote-sessions.json');

export type QuoteOption = 'font' | 'size' | 'color' | 'look';
type CustomTextOption = 'size' | 'color';

export type QuoteSession = {
  id: string;
  ownerId: string;
  sourceMessageId: string;
  sourceUrl: string;
  options: CardOptions;
  avatarImage?: Buffer;
  emojiImages?: Record<string, Buffer>;
  expiresAt: number;
  busy: boolean;
  editorChannelId?: string;
  editorMessageId?: string;
  editorApplicationId?: string;
  editorInteractionToken?: string;
};

type StoredQuoteSession = Omit<QuoteSession, 'avatarImage' | 'emojiImages' | 'busy' | 'editorInteractionToken'> & {
  avatarImage?: string;
  emojiImages?: Record<string, string>;
};

const sessions = new Collection<string, QuoteSession>();
const expiryTimers = new Collection<string, ReturnType<typeof setTimeout>>();

function restoreSessions(): void {
  try {
    if (!existsSync(SESSION_STORE_PATH)) return;
    const now = Date.now();
    const stored = JSON.parse(readFileSync(SESSION_STORE_PATH, 'utf8')) as StoredQuoteSession[];
    for (const item of stored) {
      if (!item?.id || item.expiresAt <= now) continue;
      const { avatarImage, emojiImages, ...session } = item;
      sessions.set(item.id, {
        ...session,
        options: {
          ...session.options,
          font: session.options.font in CARD_FONTS ? session.options.font : 'modern',
          size: session.options.size in CARD_SIZES ? session.options.size : 'auto',
          color: session.options.color in CARD_COLORS ? session.options.color : 'auto',
          look: session.options.look in CARD_LOOKS ? session.options.look : 'cinematic',
        },
        expiresAt: Math.min(session.expiresAt, now + SESSION_LIFETIME),
        ...(avatarImage && { avatarImage: Buffer.from(avatarImage, 'base64') }),
        ...(emojiImages && {
          emojiImages: Object.fromEntries(Object.entries(emojiImages).map(([id, data]) => [id, Buffer.from(data, 'base64')])),
        }),
        busy: false,
      });
    }
  } catch (error) {
    console.error('Could not restore quote editors:', error);
  }
}

function persistSessions(): void {
  try {
    const stored: StoredQuoteSession[] = [...sessions.values()].map(
      ({ avatarImage, emojiImages, busy: _busy, editorInteractionToken: _token, ...session }) => ({
        ...session,
        ...(avatarImage && { avatarImage: avatarImage.toString('base64') }),
        ...(emojiImages && {
          emojiImages: Object.fromEntries(Object.entries(emojiImages).map(([id, data]) => [id, data.toString('base64')])),
        }),
      }),
    );

    if (!stored.length) {
      if (existsSync(SESSION_STORE_PATH)) unlinkSync(SESSION_STORE_PATH);
      return;
    }

    mkdirSync(dirname(SESSION_STORE_PATH), { recursive: true });
    const temporaryPath = `${SESSION_STORE_PATH}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(stored));
    copyFileSync(temporaryPath, SESSION_STORE_PATH);
    unlinkSync(temporaryPath);
  } catch (error) {
    console.error('Could not persist quote editors:', error);
  }
}

export function initializeQuoteSessions(api: API): void {
  restoreSessions();

  for (const session of sessions.values()) {
    armSessionExpiry(session, api);
  }
}

export async function createQuoteSession(message: APIMessage, ownerId: string, displayName?: string, guildId?: string): Promise<QuoteSession> {
  const [avatarImage, emojiImages] = await Promise.all([downloadImage(getAvatarUrl(message)), downloadCustomEmojis(message.content)]);
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
      color: 'auto',
      look: 'cinematic',
      effects: [],
    },
    ...(avatarImage && { avatarImage }),
    ...(Object.keys(emojiImages).length && { emojiImages }),
    expiresAt: Date.now() + SESSION_LIFETIME,
    busy: false,
  };

  sessions.set(session.id, session);
  persistSessions();
  return session;
}

export function saveQuoteSession(session: QuoteSession, api?: API): void {
  if (!sessions.has(session.id)) return;
  persistSessions();
  if (api) armSessionExpiry(session, api);
}

export function hasQuoteContent(message: APIMessage): boolean {
  return Boolean(message.content.trim());
}

export async function renderQuoteSession(session: QuoteSession): Promise<Buffer> {
  return renderQuoteCard({
    ...session.options,
    ...(session.avatarImage && { avatarImage: session.avatarImage }),
    ...(session.emojiImages && { emojiImages: session.emojiImages }),
  });
}

export function buildQuoteComponents(session: QuoteSession): APIMessageTopLevelComponent[] {
  const select = (option: QuoteOption, title: string, values: Record<string, { label: string; description: string }>) => ({
    type: ComponentType.ActionRow as const,
    components: [
      {
        type: ComponentType.StringSelect as const,
        custom_id: `quote-select_${session.id}_${option}`,
        title,
        options: Object.entries(values).map(([value, item]) => ({
          label: item.label,
          description: item.description,
          value,
          default: value === session.options[option],
        })),
      },
    ],
  });

  const customSelect = (option: CustomTextOption, title: string, values: Record<string, { label: string; description: string }>, customLabel: string) => ({
    type: ComponentType.ActionRow as const,
    components: [
      {
        type: ComponentType.StringSelect as const,
        custom_id: `quote-custom-select_${session.id}_${option}`,
        title,
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

  const selectedEffects =
    session.options.effects ??
    (session.options.look !== 'cinematic' && session.options.look in CARD_LOOKS ? [session.options.look as keyof typeof CARD_LOOKS] : []);
  const effectSelect = {
    type: ComponentType.ActionRow as const,
    components: [
      {
        type: ComponentType.StringSelect as const,
        custom_id: `quote-select_${session.id}_look`,
        placeholder: selectedEffects.length
          ? `${selectedEffects.length} effect${selectedEffects.length === 1 ? '' : 's'} selected`
          : 'Cinematic Split (default)',
        min_values: 0,
        max_values: Object.keys(CARD_LOOKS).length,
        options: Object.entries(CARD_LOOKS).map(([value, item]) => ({
          label: item.label,
          description: item.description,
          value,
          default: selectedEffects.includes(value as keyof typeof CARD_LOOKS),
        })),
      },
    ],
  };

  return [
    select('font', 'Choose a font', CARD_FONTS),
    customSelect('size', 'Choose a text size', CARD_SIZES, 'Custom font size'),
    customSelect('color', 'Choose a text color', CARD_COLORS, 'Custom text color'),
    effectSelect,
    {
      type: ComponentType.ActionRow as const,
      components: [
        {
          type: ComponentType.Button as const,
          custom_id: `quote-action_${session.id}_shuffle`,
          label: 'Surprise me',
          style: ButtonStyle.Secondary,
        },
        ...viewOriginalButton(session),
        {
          type: ComponentType.Button as const,
          custom_id: `quote-action_${session.id}_close`,
          emoji: toEmoji('Trash') as APIMessageComponentEmoji,
          style: ButtonStyle.Secondary,
        },
      ],
    },
  ];
}

function buildExpiredQuoteComponents(session: QuoteSession): APIMessageTopLevelComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: viewOriginalButton(session),
    },
  ];
}

function viewOriginalButton(session: QuoteSession) {
  return [
    {
      type: ComponentType.Button as const,
      url: session.sourceUrl,
      label: 'View original',
      style: ButtonStyle.Link as const,
    },
  ];
}

export async function handleQuoteSelect(interaction: APIMessageComponentSelectMenuInteraction, sessionId: string, option: string, api: API): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api);
  if (!session || !isQuoteOption(option) || !('values' in interaction.data)) return;

  if (option === 'look') {
    const effects = interaction.data.values.filter((value): value is keyof typeof CARD_LOOKS => value in CARD_LOOKS);
    if (effects.length !== interaction.data.values.length) {
      await reportComponentError(interaction, api, 'That quote effect is no longer available.');
      return;
    }
    session.options.look = 'cinematic';
    session.options.effects = effects;
  } else {
    const value = interaction.data.values[0];
    if (!value || !setQuoteOption(session, option, value)) {
      await reportComponentError(interaction, api, 'That quote option is no longer available.');
      return;
    }
  }

  rememberEditorInteraction(session, interaction);
  await refreshQuote(interaction, session, api);
}

export async function handleQuoteAction(interaction: APIMessageComponentButtonInteraction, sessionId: string, action: string, api: API): Promise<void> {
  const session = await getAvailableSession(interaction, sessionId, api);
  if (!session) return;

  if (action === 'shuffle') {
    session.options.font = randomKey(CARD_FONTS);
    session.options.size = randomKey(CARD_SIZES);
    session.options.color = randomKey(CARD_COLORS);
    session.options.look = 'cinematic';
    session.options.effects = randomEffectCombination();
    delete session.options.customSize;
    delete session.options.customColor;
    rememberEditorInteraction(session, interaction);
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
    title: isSize ? 'Custom font size' : 'Custom text color',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: isSize ? 'font-size' : 'color',
            label: isSize ? 'Font size (30-140 px)' : 'Text color (hex)',
            style: TextInputStyle.Short,
            value: isSize ? (session.options.customSize ? String(session.options.customSize) : undefined) : session.options.customColor,
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

  const value = modalInputValue(interaction, option === 'size' ? 'font-size' : 'color').trim();

  if (option === 'size' && (!/^\d+$/.test(value) || Number(value) < 30 || Number(value) > 140)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Exclamation')} Font size must be a whole number from 30 to 140`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    return;
  }

  if (option === 'color' && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `${emoji('Exclamation')} Color must be a hex value such as #f7f3ec`,
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  if (option === 'size') session.options.customSize = Number(value);
  else session.options.customColor = value;
  session.expiresAt = Date.now() + SESSION_LIFETIME;
  persistSessions();
  await api.interactions.deferMessageUpdate(interaction.id, interaction.token);
  session.busy = true;

  try {
    const image = await renderQuoteSession(session);
    await editQuoteEditor(api, session, image, interaction);
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
  try {
    const image = await renderQuoteSession(session);
    await editQuoteEditor(api, session, image, interaction);
  } finally {
    session.busy = false;
    touchSession(session, api);
  }
}

async function getAvailableSession(
  interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction | APIModalSubmitInteraction,
  sessionId: string,
  api: API,
  canFollowUp = true,
): Promise<QuoteSession | undefined> {
  const session = sessions.get(sessionId);
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
  }
  session.editorApplicationId = interaction.application_id;
  touchSession(session, api);
  return session;
}

function rememberEditorInteraction(session: QuoteSession, interaction: APIMessageComponentSelectMenuInteraction | APIMessageComponentButtonInteraction): void {
  session.editorApplicationId = interaction.application_id;
  session.editorInteractionToken = interaction.token;
}

function touchSession(session: QuoteSession, api: API): void {
  session.expiresAt = Date.now() + SESSION_LIFETIME;
  persistSessions();
  armSessionExpiry(session, api);
}

function armSessionExpiry(session: QuoteSession, api: API): void {
  const existing = expiryTimers.get(session.id);
  if (existing) clearTimeout(existing);
  const expectedExpiry = session.expiresAt;
  const timer = setTimeout(
    () => {
      if (session.expiresAt !== expectedExpiry) {
        armSessionExpiry(session, api);
        return;
      }
      if (session.busy) {
        session.expiresAt = Date.now() + 1_000;
        armSessionExpiry(session, api);
        return;
      }
      void expireSession(session, api);
    },
    Math.max(0, expectedExpiry - Date.now()),
  );
  timer.unref();
  expiryTimers.set(session.id, timer);
}

async function expireSession(session: QuoteSession, api: API): Promise<void> {
  const components = buildExpiredQuoteComponents(session);
  try {
    if (session.editorApplicationId && session.editorInteractionToken) {
      try {
        await api.interactions.editReply(session.editorApplicationId, session.editorInteractionToken, { components });
        return;
      } catch {}
    }
    if (session.editorChannelId && session.editorMessageId) await api.channels.editMessage(session.editorChannelId, session.editorMessageId, { components });
  } catch (error) {
    console.warn(`Could not remove controls from expired quote editor ${session.id}:`, error);
  } finally {
    removeSession(session.id);
  }
}

function removeSession(sessionId: string): void {
  const timer = expiryTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  expiryTimers.delete(sessionId);
  sessions.delete(sessionId);
  persistSessions();
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
  _canFollowUp = true,
): Promise<void> {
  const response = {
    components: [
      {
        type: ComponentType.Container,
        components: [{ type: ComponentType.TextDisplay, content }],
      },
    ] as APIMessageTopLevelComponent[],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };

  if (_canFollowUp && 'message' in interaction) await api.interactions.followUp(interaction.application_id, interaction.token, response);
  else await api.interactions.reply(interaction.id, interaction.token, response);
}

function setQuoteOption(session: QuoteSession, option: QuoteOption, value: string): boolean {
  if (option === 'font' && value in CARD_FONTS) {
    session.options.font = value as CardOptions['font'];
  } else if (option === 'size' && value in CARD_SIZES) {
    session.options.size = value as CardOptions['size'];
    delete session.options.customSize;
  } else if (option === 'color' && value in CARD_COLORS) {
    session.options.color = value as CardOptions['color'];
    delete session.options.customColor;
  } else if (option === 'look' && value in CARD_LOOKS) {
    session.options.look = value as CardOptions['look'];
  } else {
    return false;
  }
  return true;
}

function isQuoteOption(value: string): value is QuoteOption {
  return value === 'font' || value === 'size' || value === 'color' || value === 'look';
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

  if (session.editorApplicationId && session.editorInteractionToken) {
    await api.interactions.editReply(session.editorApplicationId, session.editorInteractionToken, payload);
    return;
  }
  if ('message' in interaction && interaction.message) {
    await api.channels.editMessage(interaction.message.channel_id, interaction.message.id, payload);
    return;
  }
  throw new Error(`Quote editor ${session.id} has no editable message reference`);
}

function extractQuoteText(message: APIMessage): string {
  return message.content
    .trim()
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 600);
}

function displayNameFor(message: APIMessage): string {
  return message.author.global_name || message.author.username;
}

function getAvatarUrl(message: APIMessage): string {
  if (message.author.avatar) {
    return cdn(`/avatars/${message.author.id}/${message.author.avatar}`, 2048, 'png', message.author.avatar.startsWith('a_'));
  }
  const index = message.author.discriminator === '0' ? Number((BigInt(message.author.id) >> 22n) % 6n) : Number(message.author.discriminator) % 5;
  return cdn(`/embed/avatars/${index}`, 2048, 'png');
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

async function downloadCustomEmojis(content: string): Promise<Record<string, Buffer>> {
  const emojis = new Collection<string, { animated: boolean }>();
  for (const match of content.matchAll(/<(a?):[a-zA-Z0-9_]+:(\d+)>/g)) {
    if (emojis.size >= 20) break;
    emojis.set(match[2]!, { animated: match[1] === 'a' });
  }

  const entries = await Promise.all(
    [...emojis].map(async ([id, { animated }]) => {
      const image = await downloadImage(cdn(`/emojis/${id}`, 128, animated ? 'gif' : 'png', animated));
      return [id, image] as const;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, Buffer] => Boolean(entry[1])));
}

async function downloadImage(url: string): Promise<Buffer | undefined> {
  try {
    if (!isTrustedDiscordUrl(url)) return undefined;
    const response = await fetch(url, {
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
    console.warn(`Could not download quote avatar: ${String(error)}`);
    return undefined;
  }
}

function randomKey<T extends Record<string, unknown>>(record: T): keyof T {
  const keys = Object.keys(record) as Array<keyof T>;
  return keys[Math.floor(Math.random() * keys.length)]!;
}

function randomEffectCombination(): Array<keyof typeof CARD_LOOKS> {
  const effects = Object.keys(CARD_LOOKS) as Array<keyof typeof CARD_LOOKS>;
  for (let index = effects.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [effects[index], effects[swapIndex]] = [effects[swapIndex]!, effects[index]!];
  }
  return effects.slice(0, 1 + Math.floor(Math.random() * Math.min(3, effects.length)));
}
