import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { isHex, type Hexadecimal } from '@tolga1452/toolbox.js';
import sharp from 'sharp';
import emojiRegex from 'emoji-regex';
import path from 'path';

const FONTS = [
  ['M PLUS Rounded 1c', 'MPLUSRounded1c_regular.ttf'],
  ['Dela Gothic One', 'DelaGothicOne-Regular.ttf'],
  ['DotGothic16', 'DotGothic16-Regular.ttf'],
  ['Hachi Maru Pop', 'HachiMaruPop-Regular.ttf'],
  ['Rampart One', 'RampartOne-Regular.ttf'],
  ['Reggae One', 'ReggaeOne-Regular.ttf'],
  ['RocknRoll One', 'RocknRollOne-Regular.ttf'],
  ['Zen Old Mincho', 'ZenOldMincho-Regular.ttf'],
  ['Yuji Syuku', 'YujiSyuku-Regular.ttf'],
  ['Yusei Magic', 'YuseiMagic-Regular.ttf'],
  ['Inconsolata', 'Inconsolata-Regular.ttf'],
  ['Exo 2', 'Exo2-Regular.ttf'],
  ['Castoro Titling', 'CastoroTitling-Regular.ttf'],
  ['Poltawski Nowy', 'PoltawskiNowy-Regular.ttf'],
  ['Vina Sans', 'VinaSans-Regular.ttf'],
  ['Dancing Script', 'DancingScript-Regular.ttf'],
  ['Minecraft', 'MinecraftStandard.otf'],
] as const;

const attemptedFonts = new Set<string>();

function loadFonts(font: FontKey): void {
  const requiredFamilies = new Set([CARD_FONTS[font].family, 'Exo 2', 'Inconsolata']);

  for (const [family, file] of FONTS) {
    if (!requiredFamilies.has(family) || attemptedFonts.has(family)) {
      continue;
    }

    try {
      GlobalFonts.registerFromPath(path.join(process.cwd(), 'fonts', file), family);
    } catch (error) {
      console.error(`Failed to load font ${family}:`, error);
    } finally {
      attemptedFonts.add(family);
    }
  }
}

const SCALE = 3;
const WIDTH = 850;
const HEIGHT = 450;

export const CARD_FONTS = {
  modern: {
    label: 'M PLUS Rounded 1c',
    description: 'Clean rounded sans-serif',
    family: 'M PLUS Rounded 1c',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  display: {
    label: 'Dela Gothic One',
    description: 'Bold display lettering',
    family: 'Dela Gothic One',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  pixel: {
    label: 'DotGothic16',
    description: 'Pixel-inspired gothic',
    family: 'DotGothic16',
    fallback: 'monospace',
    weight: 400,
    style: 'normal',
  },
  pop: {
    label: 'Hachi Maru Pop',
    description: 'Cute handwritten style',
    family: 'Hachi Maru Pop',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  graffiti: {
    label: 'Rampart One',
    description: 'Bold playful lettering',
    family: 'Rampart One',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  reggae: {
    label: 'Reggae One',
    description: 'Fun decorative display',
    family: 'Reggae One',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  rock: {
    label: 'RocknRoll One',
    description: 'Strong expressive display',
    family: 'RocknRoll One',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  editorial: {
    label: 'Zen Old Mincho',
    description: 'Classic serif',
    family: 'Zen Old Mincho',
    fallback: 'serif',
    weight: 400,
    style: 'normal',
  },
  calligraphy: {
    label: 'Yuji Syuku',
    description: 'Traditional calligraphy',
    family: 'Yuji Syuku',
    fallback: 'serif',
    weight: 400,
    style: 'normal',
  },
  magic: {
    label: 'Yusei Magic',
    description: 'Friendly handwritten',
    family: 'Yusei Magic',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  mono: {
    label: 'Inconsolata',
    description: 'Modern monospace',
    family: 'Inconsolata',
    fallback: 'monospace',
    weight: 400,
    style: 'normal',
  },
  exo: {
    label: 'Exo 2',
    description: 'Modern geometric sans',
    family: 'Exo 2',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  titling: {
    label: 'Castoro Titling',
    description: 'Elegant titles',
    family: 'Castoro Titling',
    fallback: 'serif',
    weight: 400,
    style: 'normal',
  },
  classic: {
    label: 'Poltawski Nowy',
    description: 'Traditional serif',
    family: 'Poltawski Nowy',
    fallback: 'serif',
    weight: 400,
    style: 'normal',
  },
  vina: {
    label: 'Vina Sans',
    description: 'Heavy condensed display',
    family: 'Vina Sans',
    fallback: 'sans-serif',
    weight: 400,
    style: 'normal',
  },
  script: {
    label: 'Dancing Script',
    description: 'Elegant cursive',
    family: 'Dancing Script',
    fallback: 'cursive',
    weight: 400,
    style: 'normal',
  },
  minecraft: {
    label: 'Minecraft',
    description: 'Minecraft-style pixel font',
    family: 'Minecraft',
    fallback: 'monospace',
    weight: 400,
    style: 'normal',
  },
} as const;

export const CARD_SIZES = {
  auto: {
    label: 'Smart Fit',
    description: 'Fits the text to the card',
    pixels: 42,
  },
  compact: {
    label: 'Compact - 28px',
    description: 'Best for longer messages',
    pixels: 28,
  },
  medium: {
    label: 'Medium - 36px',
    description: 'Balanced everyday size',
    pixels: 36,
  },
  large: {
    label: 'Large - 46px',
    description: 'Strong and expressive',
    pixels: 46,
  },
  huge: {
    label: 'Huge - 58px',
    description: 'Best for very short quotes',
    pixels: 58,
  },
} as const;

export const CARD_COLORS = {
  auto: {
    label: 'Automatic',
    description: 'Matches the selected layout',
    value: 'auto',
  },
  pearl: {
    label: 'Pearl',
    description: 'Soft white',
    value: '#f7f3ec',
  },
  ink: {
    label: 'Ink',
    description: 'Deep near-black',
    value: '#16161a',
  },
  rose: {
    label: 'Rose',
    description: 'Warm muted pink',
    value: '#ffb4c8',
  },
  sky: {
    label: 'Electric Sky',
    description: 'Bright cool blue',
    value: '#8bd5ff',
  },
  citrus: {
    label: 'Citrus',
    description: 'Fresh golden yellow',
    value: '#ffd76a',
  },
  mint: {
    label: 'Mint',
    description: 'Soft vivid green',
    value: '#9fffc5',
  },
  violet: {
    label: 'Violet',
    description: 'Dreamy lavender',
    value: '#c9b6ff',
  },
} as const;

export const CARD_EFFECTS = {
  'full-bleed': {
    label: 'Full-Bleed Split',
    description: 'Avatar fills the entire card',
    layout: 'full-bleed',
    effect: 'original',
  },
  flip: {
    label: 'Flip Image',
    description: 'Mirror the avatar horizontally',
    layout: 'split',
    effect: 'flip',
  },
  grayscale: {
    label: 'Grayscale',
    description: 'Convert avatar to black and white',
    layout: 'split',
    effect: 'grayscale',
  },
  blur: {
    label: 'Blur',
    description: 'Gaussian blur on the avatar',
    layout: 'split',
    effect: 'blur',
  },
  brightness: {
    label: 'Brightness Boost',
    description: 'Brighten the avatar',
    layout: 'split',
    effect: 'brightness',
  },
  pixelate: {
    label: 'Pixelate',
    description: 'Pixelate the avatar',
    layout: 'split',
    effect: 'pixelate',
  },
  'remove-watermark': {
    label: 'Remove Watermark',
    description: 'Hide the Pocket Tool watermark',
    layout: 'split',
    effect: 'remove-watermark',
  },
  gif: {
    label: 'GIF',
    description: 'Export the card as an animated GIF',
    layout: 'split',
    effect: 'gif',
  },
} as const;

export type FontKey = keyof typeof CARD_FONTS;
export type SizeKey = keyof typeof CARD_SIZES;
export type ColorKey = keyof typeof CARD_COLORS;
export type EffectKey = keyof typeof CARD_EFFECTS;
export type Layout = (typeof CARD_EFFECTS)[EffectKey]['layout'];
export type Effect = (typeof CARD_EFFECTS)[EffectKey]['effect'];

export type CardOptions = {
  quote: string;
  credit: string;
  mention: string;
  font: FontKey;
  size: SizeKey | number;
  color: ColorKey | Hexadecimal;
  effects: EffectKey[];
};

export type RenderQuoteCardOptions = CardOptions & {
  avatar: Buffer;
  emojis?: Record<string, Buffer>;
};

type LoadedImage = Awaited<ReturnType<typeof loadImage>>;
type RichSpan = { type: 'text'; value: string } | { type: 'emoji'; name: string; id?: string; unicode?: boolean };
type RichLine = RichSpan[];

type TextArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  align: 'center' | 'left';
  vertical: 'middle' | 'bottom';
};

export async function renderQuoteCard(options: RenderQuoteCardOptions): Promise<Buffer> {
  loadFonts(options.font);

  const canvas = createCanvas(WIDTH * SCALE, HEIGHT * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  const effects = new Set(options.effects.map((effect) => CARD_EFFECTS[effect].effect));
  const layout: Layout = options.effects.includes('full-bleed') ? 'full-bleed' : 'split';
  const [avatar, emojis] = await Promise.all([
    options.avatar ? loadImage(options.avatar) : undefined,
    Promise.all(
      Object.entries(options.emojis ?? {}).map(async ([id, data]) => [id, await loadImage(data)] as const),
    ).then((entries) =>
      Object.fromEntries(entries.filter((entry): entry is readonly [string, LoadedImage] => Boolean(entry[1]))),
    ),
  ]);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const area = drawLayout(ctx, layout, effects, avatar);
  await drawQuote(ctx, options, area, resolveTextColor(options.color), emojis);

  if (!effects.has('remove-watermark')) {
    drawBrandMark(ctx);
  }

  const frame = await canvas.encode('png');

  const image = sharp(frame).resize(WIDTH, HEIGHT);

  if (effects.has('gif')) {
    return image.gif({ effort: 10 }).toBuffer();
  }

  return image
    .png({
      compressionLevel: 9,
      effort: 10,
    })
    .toBuffer();
}

function drawLayout(ctx: SKRSContext2D, layout: Layout, effects: ReadonlySet<Effect>, avatar?: LoadedImage): TextArea {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (layout === 'full-bleed') {
    if (avatar) {
      drawImageCover(ctx, avatar, 0, 0, WIDTH, HEIGHT, effects);
    } else {
      drawFallbackAvatar(ctx, 0, 0, WIDTH, HEIGHT);
    }

    const diagonalShade = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    diagonalShade.addColorStop(0, 'rgba(22,24,30,.14)');
    diagonalShade.addColorStop(0.36, 'rgba(22,24,30,.28)');
    diagonalShade.addColorStop(0.64, 'rgba(9,12,20,.55)');
    diagonalShade.addColorStop(0.84, 'rgba(3,6,13,.82)');
    diagonalShade.addColorStop(1, 'rgba(0,3,10,.96)');

    ctx.fillStyle = diagonalShade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const lowerShade = ctx.createLinearGradient(0, 155, 0, HEIGHT);
    lowerShade.addColorStop(0, 'rgba(0,0,0,0)');
    lowerShade.addColorStop(1, 'rgba(0,0,0,.32)');

    ctx.fillStyle = lowerShade;
    ctx.fillRect(0, 155, WIDTH, HEIGHT - 155);

    return { x: 69, y: 197, width: 402, height: 188, align: 'left', vertical: 'middle' };
  }

  drawSplitAvatar(ctx, avatar, effects);

  return { x: 445, y: 55, width: 330, height: 340, align: 'center', vertical: 'middle' };
}

function drawSplitAvatar(ctx: SKRSContext2D, avatar: LoadedImage | undefined, effects: ReadonlySet<Effect>): void {
  const panelWidth = 420;

  if (avatar) {
    drawImageCover(ctx, avatar, 0, 0, panelWidth, HEIGHT, effects);
  } else {
    drawFallbackAvatar(ctx, 0, 0, panelWidth, HEIGHT);
  }

  const fadeStart = 255;
  const fade = ctx.createLinearGradient(fadeStart, 0, panelWidth, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.18, 'rgba(0,0,0,.025)');
  fade.addColorStop(0.36, 'rgba(0,0,0,.1)');
  fade.addColorStop(0.54, 'rgba(0,0,0,.28)');
  fade.addColorStop(0.7, 'rgba(0,0,0,.56)');
  fade.addColorStop(0.84, 'rgba(0,0,0,.82)');
  fade.addColorStop(0.94, 'rgba(0,0,0,.96)');
  fade.addColorStop(1, '#000');

  ctx.fillStyle = fade;
  ctx.fillRect(fadeStart, 0, panelWidth - fadeStart, HEIGHT);
}

function drawImageCover(
  ctx: SKRSContext2D,
  image: LoadedImage,
  x: number,
  y: number,
  width: number,
  height: number,
  effects: ReadonlySet<Effect>,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  let source = image as Parameters<SKRSContext2D['drawImage']>[0];
  let drawSourceX = sourceX;
  let drawSourceY = sourceY;
  let drawSourceWidth = sourceWidth;
  let drawSourceHeight = sourceHeight;

  if (effects.has('pixelate')) {
    const pixelWidth = 28;
    const pixelHeight = Math.max(24, Math.round((pixelWidth * height) / width));
    const pixels = createCanvas(pixelWidth, pixelHeight);
    const pixelsCtx = pixels.getContext('2d');
    pixelsCtx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, pixelWidth, pixelHeight);
    source = pixels;
    drawSourceX = 0;
    drawSourceY = 0;
    drawSourceWidth = pixelWidth;
    drawSourceHeight = pixelHeight;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  if (effects.has('pixelate')) {
    ctx.imageSmoothingEnabled = false;
  }

  const filters: string[] = [];

  if (effects.has('grayscale')) {
    filters.push('grayscale(1)', 'contrast(1.08)');
  }

  if (effects.has('blur')) {
    filters.push('blur(12px)', 'saturate(.82)');
  }

  if (effects.has('brightness')) {
    filters.push('brightness(1.55)', 'contrast(1.04)');
  }

  if (filters.length) {
    ctx.filter = filters.join(' ');
  }

  const overscan = effects.has('blur') ? 20 : 0;

  if (effects.has('flip')) {
    ctx.translate(x * 2 + width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(
    source,
    drawSourceX,
    drawSourceY,
    drawSourceWidth,
    drawSourceHeight,
    x - overscan,
    y - overscan,
    width + overscan * 2,
    height + overscan * 2,
  );
  ctx.restore();
}

function drawFallbackAvatar(ctx: SKRSContext2D, x: number, y: number, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, '#454545');
  gradient.addColorStop(0.52, '#222');
  gradient.addColorStop(1, '#080808');

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

async function drawQuote(
  ctx: SKRSContext2D,
  options: RenderQuoteCardOptions,
  area: TextArea,
  color: string,
  emojiImages: Record<string, LoadedImage>,
): Promise<void> {
  const selectedFont = CARD_FONTS[options.font];
  let fontSize =
    typeof options.size === 'number'
      ? options.size
      : options.size === 'auto'
        ? smartFontSize(options.quote)
        : CARD_SIZES[options.size].pixels;
  const minFontSize = 20;
  const maxLines = 7;
  let lines: RichLine[] = [];

  while (fontSize >= minFontSize) {
    ctx.font = resolveFont(selectedFont, fontSize);
    lines = wrapRichText(ctx, options.quote, area.width, fontSize);

    if (lines.length <= maxLines && lines.length * fontSize * 1.16 <= area.height - 62) {
      break;
    }

    fontSize -= 2;
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    appendText(lines[maxLines - 1]!, '…');
  }

  const lineHeight = fontSize * 1.16;
  const creditSize = Math.max(15, Math.min(22, fontSize * 0.48));
  const handleSize = Math.max(13, Math.min(17, creditSize * 0.78));
  const creditGap = options.credit ? 18 + creditSize + handleSize : 0;
  const contentHeight = lines.length * lineHeight + creditGap;

  let startY = area.y;

  if (area.vertical === 'middle') {
    startY += (area.height - contentHeight) / 2;
  }

  if (area.vertical === 'bottom') {
    startY += area.height - contentHeight;
  }

  const drawX = area.align === 'center' ? area.x + area.width / 2 : area.x;

  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.font = resolveFont(selectedFont, fontSize);

  for (const [index, line] of lines.entries()) {
    await drawRichLine(ctx, line, drawX, startY + index * lineHeight, area.align, fontSize, emojiImages);
  }

  const creditY = startY + lines.length * lineHeight + 14;

  ctx.globalAlpha = 0.9;
  ctx.font = `400 ${creditSize}px "Exo 2", sans-serif`;

  const creditLine = parseRichWord(`– ${options.credit}`);

  await drawRichLine(ctx, creditLine, drawX, creditY, area.align, creditSize, emojiImages);

  ctx.globalAlpha = 0.58;
  ctx.font = `400 ${handleSize}px "Exo 2", sans-serif`;

  const mentionLine = parseRichWord(options.mention);

  await drawRichLine(ctx, mentionLine, drawX, creditY + creditSize + 4, area.align, handleSize, emojiImages);

  ctx.globalAlpha = 1;
}

function resolveFont(font: (typeof CARD_FONTS)[FontKey], size: number): string {
  return `${font.style} ${font.weight} ${size}px "${font.family}", ${font.fallback}`;
}

function wrapRichText(ctx: SKRSContext2D, input: string, maxWidth: number, fontSize: number): RichLine[] {
  const lines: RichLine[] = [];

  for (const paragraph of input.replace(/\r/g, '').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      if (lines.length) lines.push([]);
      continue;
    }

    let current: RichLine = [];

    for (const word of words) {
      const wordSpans = parseRichWord(word);
      const candidate = current.length ? [...current, { type: 'text', value: ' ' } as const, ...wordSpans] : wordSpans;

      if (measureRichLine(ctx, candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current.length) lines.push(current);

      if (measureRichLine(ctx, wordSpans, fontSize) <= maxWidth) {
        current = wordSpans;
      } else {
        const chunks = breakLongRichWord(ctx, wordSpans, maxWidth, fontSize);
        lines.push(...chunks.slice(0, -1));
        current = chunks.at(-1) || [];
      }
    }

    if (current.length) {
      lines.push(current);
    }
  }

  return lines.length ? lines : [[]];
}

function parseRichWord(word: string): RichLine {
  const spans: RichLine = [];

  const regex = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;

  let cursor = 0;

  const matches = [
    ...word.matchAll(regex),
    ...[...word.matchAll(emojiRegex())].map((match) => ({
      ...match,
      index: match.index!,
      0: match[0],
      1: undefined,
      2: undefined,
    })),
  ].sort((a, b) => a.index! - b.index!);

  for (const match of matches) {
    if (match.index! > cursor) {
      appendText(spans, word.slice(cursor, match.index));
    }

    if (match[2]) {
      // custom emoji
      spans.push({
        type: 'emoji',
        name: match[1]!,
        id: match[2]!,
      });
    } else {
      // unicode emoji
      spans.push({
        type: 'emoji',
        name: match[0],
        unicode: true,
      });
    }

    cursor = match.index! + match[0].length;
  }

  if (cursor < word.length) {
    appendText(spans, word.slice(cursor));
  }

  return spans;
}

function breakLongRichWord(ctx: SKRSContext2D, spans: RichLine, maxWidth: number, fontSize: number): RichLine[] {
  const chunks: RichLine[] = [];
  let current: RichLine = [];

  const atoms = spans.flatMap((span): RichSpan[] =>
    span.type === 'emoji' ? [span] : [...span.value].map((value) => ({ type: 'text', value })),
  );

  for (const atom of atoms) {
    const candidate = [...current, atom];

    if (current.length && measureRichLine(ctx, candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = [atom];
    } else {
      current = candidate;
    }
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

function measureRichLine(ctx: SKRSContext2D, line: RichLine, fontSize: number): number {
  return line.reduce((width, span) => {
    if (span.type === 'emoji') {
      return width + fontSize;
    }

    return width + ctx.measureText(span.value).width;
  }, 0);
}

async function drawRichLine(
  ctx: SKRSContext2D,
  line: RichLine,
  anchorX: number,
  y: number,
  align: TextArea['align'],
  fontSize: number,
  emojis: Record<string, LoadedImage>,
): Promise<void> {
  const width = measureRichLine(ctx, line, fontSize);
  let x = align === 'center' ? anchorX - width / 2 : anchorX;

  ctx.textAlign = 'left';

  for (const span of line) {
    if (span.type === 'text') {
      ctx.fillText(span.value, x, y);
      x += ctx.measureText(span.value).width;

      continue;
    }

    const emoji = span.id ? emojis[span.id] : undefined;

    if (emoji) {
      ctx.drawImage(emoji, x, y, fontSize, fontSize);
      x += fontSize;

      continue;
    }

    if (span.unicode) {
      try {
        const img = await loadImage(getTwemojiUrl(span.name));

        ctx.drawImage(img, x, y, fontSize, fontSize);
      } catch {}

      x += fontSize;
      continue;
    }

    ctx.fillText(span.name, x, y);
    x += ctx.measureText(span.name).width;
  }
}

function appendText(line: RichLine, value: string): void {
  const last = line.at(-1);

  if (last?.type === 'text') {
    last.value += value;
  } else {
    line.push({ type: 'text', value });
  }
}

function smartFontSize(quote: string): number {
  const length = [...quote].length;

  if (length <= 35) {
    return 42;
  } else if (length <= 75) {
    return 36;
  } else if (length <= 140) {
    return 31;
  } else if (length <= 240) {
    return 26;
  } else {
    return 22;
  }
}

function drawBrandMark(ctx: SKRSContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#d8d8d8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '400 14px "Inconsolata", monospace';
  ctx.fillText('Pocket Tool', WIDTH - 17, HEIGHT - 14);
  ctx.restore();
}

function resolveTextColor(color: ColorKey | Hexadecimal): string {
  if (isHex(color)) {
    return color;
  }

  return color === 'auto' ? '#f5f5f5' : CARD_COLORS[color].value;
}

function getTwemojiUrl(emoji: string): string {
  const code = [...emoji]
    .map((char) => char.codePointAt(0)!.toString(16))
    .filter((code) => code !== 'fe0f')
    .join('-');

  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${code}.png`;
}
