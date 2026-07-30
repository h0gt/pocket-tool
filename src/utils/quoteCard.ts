import { createCanvas, loadImage, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

const WIDTH = 850;
const HEIGHT = 450;

export const CARD_FONTS = {
  modern: {
    label: 'Modern Sans',
    description: 'Clean, light sans-serif',
    family: 'Arial',
    fallback: 'sans-serif',
    weight: 300,
    style: 'normal',
  },
  editorial: {
    label: 'Editorial Serif',
    description: 'Elegant italic serif',
    family: 'Georgia',
    fallback: 'serif',
    weight: 400,
    style: 'italic',
  },
  rounded: {
    label: 'Soft Rounded',
    description: 'Friendly rounded lettering',
    family: 'Trebuchet MS',
    fallback: 'sans-serif',
    weight: 500,
    style: 'normal',
  },
  mono: {
    label: 'Typewriter Mono',
    description: 'Understated monospaced type',
    family: 'Courier New',
    fallback: 'monospace',
    weight: 400,
    style: 'normal',
  },
  display: {
    label: 'Bold Display',
    description: 'Heavy poster lettering',
    family: 'Impact',
    fallback: 'sans-serif',
    weight: 700,
    style: 'normal',
  },
} as const;

export const CARD_SIZES = {
  auto: {
    label: 'Smart fit',
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

export const CARD_LOOKS = {
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
  lyric: {
    label: 'Lyric Style',
    description: 'Switch to lyric quote layout',
    layout: 'lyric',
    effect: 'original',
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
} as const;

type FontKey = keyof typeof CARD_FONTS;
type SizeKey = keyof typeof CARD_SIZES;
type ColorKey = keyof typeof CARD_COLORS;
type LookKey = keyof typeof CARD_LOOKS;
type Layout = (typeof CARD_LOOKS)[LookKey]['layout'];
type Effect = (typeof CARD_LOOKS)[LookKey]['effect'];

export type CardOptions = {
  quote: string;
  credit: string;
  handle: string;
  font: FontKey;
  size: SizeKey;
  color: ColorKey;
  look: LookKey | 'cinematic';
  effects?: LookKey[];
  customSize?: number;
  customColor?: string;
};

export type RenderQuoteCardOptions = CardOptions & {
  avatarImage?: Buffer;
  emojiImages?: Record<string, Buffer>;
};

type LoadedImage = Awaited<ReturnType<typeof loadImage>>;
type RichSpan = { type: 'text'; value: string } | { type: 'emoji'; id: string; name: string };
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
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const selectedLooks = resolveSelectedLooks(options);
  const selectedEffects = new Set(selectedLooks.map((look) => CARD_LOOKS[look].effect));
  const layout: Layout = selectedLooks.includes('lyric') ? 'lyric' : selectedLooks.includes('full-bleed') ? 'full-bleed' : 'split';
  const [avatar, emojiEntries] = await Promise.all([
    options.avatarImage ? safeLoadImage(options.avatarImage) : undefined,
    Promise.all(Object.entries(options.emojiImages ?? {}).map(async ([id, data]) => [id, await safeLoadImage(data)] as const)),
  ]);
  const emojiImages = Object.fromEntries(emojiEntries.filter((entry): entry is readonly [string, LoadedImage] => Boolean(entry[1])));

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const area = drawLayout(ctx, layout, selectedEffects, avatar);
  if (layout === 'lyric') drawLyricQuote(ctx, options, emojiImages);
  else drawQuote(ctx, options, area, resolveTextColor(options.color, options.customColor), emojiImages);
  if (!selectedEffects.has('remove-watermark')) drawBrandMark(ctx);
  const losslessFrame = await canvas.encode('png');
  return sharp(losslessFrame).gif({ colours: 256, dither: 1, effort: 10 }).toBuffer();
}

async function safeLoadImage(data: Buffer): Promise<LoadedImage | undefined> {
  try {
    return await loadImage(data);
  } catch {
    return undefined;
  }
}

function resolveSelectedLooks(options: RenderQuoteCardOptions): LookKey[] {
  if (options.effects) return options.effects.filter((look): look is LookKey => look in CARD_LOOKS);
  return options.look !== 'cinematic' && options.look in CARD_LOOKS ? [options.look] : [];
}

function drawLayout(ctx: SKRSContext2D, layout: Layout, effects: ReadonlySet<Effect>, avatar?: LoadedImage): TextArea {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (layout === 'full-bleed') {
    if (avatar) drawImageCover(ctx, avatar, 0, 0, WIDTH, HEIGHT, effects);
    else drawFallbackAvatar(ctx, 0, 0, WIDTH, HEIGHT);

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

  if (layout === 'lyric') {
    if (avatar) drawImageCover(ctx, avatar, 0, 0, WIDTH, HEIGHT, effects);
    else drawFallbackAvatar(ctx, 0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = 'rgba(48,48,48,.58)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return { x: 72, y: 278, width: 693, height: 120, align: 'left', vertical: 'bottom' };
  }

  drawSplitAvatar(ctx, avatar, effects);
  return { x: 445, y: 55, width: 330, height: 340, align: 'center', vertical: 'middle' };
}

function drawSplitAvatar(ctx: SKRSContext2D, avatar: LoadedImage | undefined, effects: ReadonlySet<Effect>): void {
  const panelWidth = 420;

  if (avatar) drawImageCover(ctx, avatar, 0, 0, panelWidth, HEIGHT, effects);
  else drawFallbackAvatar(ctx, 0, 0, panelWidth, HEIGHT);
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

function drawImageCover(ctx: SKRSContext2D, image: LoadedImage, x: number, y: number, width: number, height: number, effects: ReadonlySet<Effect>): void {
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
  if (effects.has('pixelate')) ctx.imageSmoothingEnabled = false;
  const filters: string[] = [];
  if (effects.has('grayscale')) filters.push('grayscale(1)', 'contrast(1.08)');
  if (effects.has('blur')) filters.push('blur(12px)', 'saturate(.82)');
  if (effects.has('brightness')) filters.push('brightness(1.55)', 'contrast(1.04)');
  if (filters.length) ctx.filter = filters.join(' ');

  const overscan = effects.has('blur') ? 20 : 0;
  if (effects.has('flip')) {
    ctx.translate(x * 2 + width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, drawSourceX, drawSourceY, drawSourceWidth, drawSourceHeight, x - overscan, y - overscan, width + overscan * 2, height + overscan * 2);
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

function drawQuote(ctx: SKRSContext2D, options: RenderQuoteCardOptions, area: TextArea, color: string, emojiImages: Record<string, LoadedImage>): void {
  const selectedFont = CARD_FONTS[options.font];
  let fontSize = options.customSize ?? (options.size === 'auto' ? smartFontSize(options.quote) : CARD_SIZES[options.size].pixels);
  const minFontSize = 20;
  const maxLines = 7;
  let lines: RichLine[] = [];

  while (fontSize >= minFontSize) {
    ctx.font = fontString(selectedFont, fontSize);
    lines = wrapRichText(ctx, options.quote, area.width, fontSize);
    if (lines.length <= maxLines && lines.length * fontSize * 1.16 <= area.height - 62) break;
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
  if (area.vertical === 'middle') startY += (area.height - contentHeight) / 2;
  if (area.vertical === 'bottom') startY += area.height - contentHeight;

  const drawX = area.align === 'center' ? area.x + area.width / 2 : area.x;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.font = fontString(selectedFont, fontSize);

  for (const [index, line] of lines.entries()) {
    drawRichLine(ctx, line, drawX, startY + index * lineHeight, area.align, fontSize, emojiImages);
  }

  if (!options.credit) return;
  const creditY = startY + lines.length * lineHeight + 14;
  ctx.textAlign = area.align;
  ctx.globalAlpha = 0.9;
  ctx.font = `italic 500 ${creditSize}px Arial, sans-serif`;
  ctx.fillText(`– ${options.credit}`, drawX, creditY);

  if (options.handle) {
    ctx.globalAlpha = 0.58;
    ctx.font = `400 ${handleSize}px Arial, sans-serif`;
    ctx.fillText(options.handle, drawX, creditY + creditSize + 4);
  }
  ctx.globalAlpha = 1;
}

function drawLyricQuote(ctx: SKRSContext2D, options: RenderQuoteCardOptions, emojiImages: Record<string, LoadedImage>): void {
  const fontSize = options.customSize ? Math.max(28, Math.min(58, options.customSize)) : smartLyricFontSize(options.quote);
  const lineHeight = fontSize + 12;
  ctx.font = `700 ${fontSize}px Arial, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  const lines = wrapRichText(ctx, options.quote, 700, fontSize).slice(0, 3);
  const blockHeight = lines.length * lineHeight;
  const usernameY = HEIGHT - 82;
  const blockY = usernameY - blockHeight - 17;
  const textX = 72;

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `700 76px Georgia, serif`;
  ctx.fillText('”', 15, blockY - 25);

  ctx.font = `700 ${fontSize}px Arial, "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  for (const [index, line] of lines.entries()) {
    const lineY = blockY + index * lineHeight;
    const lineWidth = measureRichLine(ctx, line, fontSize);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(textX, lineY, lineWidth + 16, fontSize + 10);
    ctx.fillStyle = '#090909';
    drawRichLine(ctx, line, textX + 8, lineY + 4, 'left', fontSize, emojiImages);
  }

  const username = options.handle.replace(/^@/, '').toUpperCase() || options.credit.toUpperCase();
  ctx.font = '400 29px Impact, "Arial Black", sans-serif';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#171717';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(username, textX, usernameY);
  ctx.fillText(username, textX, usernameY);
}

function fontString(font: (typeof CARD_FONTS)[FontKey], size: number): string {
  return `${font.style} ${font.weight} ${size}px "${font.family}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", ${font.fallback}`;
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
    if (current.length) lines.push(current);
  }
  return lines.length ? lines : [[]];
}

function parseRichWord(word: string): RichLine {
  const spans: RichLine = [];
  const customEmoji = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;
  let cursor = 0;
  for (const match of word.matchAll(customEmoji)) {
    if (match.index > cursor) appendText(spans, word.slice(cursor, match.index));
    spans.push({ type: 'emoji', name: match[1]!, id: match[2]! });
    cursor = match.index + match[0].length;
  }
  if (cursor < word.length) appendText(spans, word.slice(cursor));
  return spans;
}

function breakLongRichWord(ctx: SKRSContext2D, spans: RichLine, maxWidth: number, fontSize: number): RichLine[] {
  const chunks: RichLine[] = [];
  let current: RichLine = [];
  const atoms = spans.flatMap((span): RichSpan[] => (span.type === 'emoji' ? [span] : [...span.value].map((value) => ({ type: 'text', value }))));

  for (const atom of atoms) {
    const candidate = [...current, atom];
    if (current.length && measureRichLine(ctx, candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = [atom];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function measureRichLine(ctx: SKRSContext2D, line: RichLine, fontSize: number): number {
  return line.reduce((width, span) => width + (span.type === 'emoji' ? fontSize : ctx.measureText(span.value).width), 0);
}

function drawRichLine(
  ctx: SKRSContext2D,
  line: RichLine,
  anchorX: number,
  y: number,
  align: TextArea['align'],
  fontSize: number,
  emojiImages: Record<string, LoadedImage>,
): void {
  const width = measureRichLine(ctx, line, fontSize);
  let x = align === 'center' ? anchorX - width / 2 : anchorX;
  ctx.textAlign = 'left';

  for (const span of line) {
    if (span.type === 'text') {
      ctx.fillText(span.value, x, y);
      x += ctx.measureText(span.value).width;
      continue;
    }

    const emojiImage = emojiImages[span.id];
    if (emojiImage) {
      const emojiSize = fontSize * 0.92;
      ctx.drawImage(emojiImage, x + fontSize * 0.04, y + fontSize * 0.04, emojiSize, emojiSize);
      x += fontSize;
    } else {
      const fallback = `:${span.name}:`;
      ctx.fillText(fallback, x, y);
      x += ctx.measureText(fallback).width;
    }
  }
}

function appendText(line: RichLine, value: string): void {
  const last = line.at(-1);
  if (last?.type === 'text') last.value += value;
  else line.push({ type: 'text', value });
}

function smartFontSize(quote: string): number {
  const length = [...quote].length;
  if (length <= 35) return 42;
  if (length <= 75) return 36;
  if (length <= 140) return 31;
  if (length <= 240) return 26;
  return 22;
}

function smartLyricFontSize(quote: string): number {
  const length = [...quote].length;
  if (length <= 24) return 42;
  if (length <= 60) return 36;
  if (length <= 120) return 31;
  return 28;
}

function drawBrandMark(ctx: SKRSContext2D): void {
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#d8d8d8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 14px "Courier New", monospace';
  ctx.fillText('Pocket Tool', WIDTH - 17, HEIGHT - 14);
  ctx.restore();
}

function resolveTextColor(color: ColorKey, customColor?: string): string {
  if (customColor) return customColor;
  return color === 'auto' ? '#f5f5f5' : CARD_COLORS[color].value;
}
