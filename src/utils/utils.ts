import { join } from 'path';
import { pathToFileURL } from 'url';
import { readdir } from 'fs/promises';
import { Emoji } from '../types/emojis';
import type { ApplicationCommand, ChatInputOption, Component, Localization } from '../types/types';
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionType,
  type APIApplicationCommandInteractionDataOption,
  type APIChatInputApplicationCommandInteraction,
  type APIEmoji,
  type APIMessageComponentEmoji,
  type Snowflake,
} from '@discordjs/core/http-only';

export async function readDirectory(folder: string): Promise<void> {
  const files = await readdir(folder, { recursive: true });

  for (const filename of files) {
    if (!filename.endsWith('.ts')) continue;

    const fullPath = join(folder, filename);

    await import(pathToFileURL(fullPath).href).catch((error) => console.log(`Cannot import file (${fullPath}) for reason:`, error));
  }
}

const DISCORD_EPOCH = 1420070400000;

export function getTimestampFromSnowflake(snowflake: Snowflake): number {
  return Number(BigInt(snowflake) >> 22n) + DISCORD_EPOCH;
}

const TIME_UNITS = {
  y: 1000 * 60 * 60 * 24 * 365,
  d: 1000 * 60 * 60 * 24,
  h: 1000 * 60 * 60,
  m: 1000 * 60,
  s: 1000,
};

export function msToApproxTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < TIME_UNITS.m) return `~${(ms / 1000).toFixed(1)}s`;
  if (ms < TIME_UNITS.h) return `~${Math.round(ms / TIME_UNITS.m)}m`;
  if (ms < TIME_UNITS.d) return `~${(ms / TIME_UNITS.h).toFixed(1)}h`;
  if (ms < TIME_UNITS.y) return `~${(ms / TIME_UNITS.d).toFixed(1)}d`;
  return `~${(ms / TIME_UNITS.y).toFixed(1)}y`;
}

export function msToReadableTime(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / TIME_UNITS.m) % 60;
  const hours = Math.floor(ms / TIME_UNITS.h) % 24;
  const days = Math.floor(ms / TIME_UNITS.d) % 365;
  const years = Math.floor(ms / TIME_UNITS.y);

  const parts: string[] = [];
  if (years) parts.push(`${years}y`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

export function readableTimeToMs(time: string): number | null {
  const matches = time.matchAll(/(\d+)(y|d|h|m|s)/g);

  let ms = 0;

  let matched = false;

  for (const [, value, unit] of matches) {
    if (!value || !unit) continue;

    ms += parseInt(value, 10) * TIME_UNITS[unit as keyof typeof TIME_UNITS];
    matched = true;
  }

  return matched ? ms : null;
}

export function toComponentEmoji(name: keyof typeof Emoji): APIMessageComponentEmoji {
  const emoji = Emoji[name];

  if (!emoji) throw new Error(`Emoji "${name}" not found`);

  return {
    id: emoji.replace(/<a?:[a-z0-9_]*:([0-9]*)>/g, '$1'),
    name: 'e',
    animated: emoji.startsWith('<a:'),
  };
}

export function toReactionEmoji(name: keyof typeof Emoji): string {
  const emoji = Emoji[name];

  if (!emoji) throw new Error(`Emoji "${name}" not found`);

  return emoji.replace(/<a?:(.+):(\d+)>/, '$1:$2');
}

function resolveLocalization(loc: Localization) {
  if (typeof loc === 'string') return { value: loc, localizations: undefined };

  const { global, ...rest } = loc;

  return {
    value: global,
    localizations: Object.keys(rest).length ? rest : undefined,
  };
}

function resolveOption(option: ChatInputOption): any {
  const name = resolveLocalization(option.name);
  const description = resolveLocalization(option.description);

  return {
    ...option,
    name: name.value,
    description: description.value,
    name_localizations: name.localizations,
    description_localizations: description.localizations,
    ...('options' in option && option.options ? { options: option.options.map(resolveOption) } : {}),
  };
}

export function localizeCommand(command: ApplicationCommand): any {
  if (command.type === ApplicationCommandType.ChatInput) {
    const description = resolveLocalization(command.description);

    return {
      ...command,
      ...resolveLocalization(command.name),
      description: description.value,
      description_localizations: description.localizations,
      options: command.options?.map(resolveOption),
    };
  }

  return {
    ...command,
    ...resolveLocalization(command.name),
  };
}

export function parseCommandOptions(
  interaction: APIChatInputApplicationCommandInteraction,
  options?: APIApplicationCommandInteractionDataOption<InteractionType.ApplicationCommand>[],
): Record<string, unknown> {
  if (!interaction.data) return {};

  if (!options) {
    options = interaction.data.options ?? [];
  }

  const args: Record<string, unknown> = {};

  for (const option of options) {
    switch (option.type) {
      case ApplicationCommandOptionType.SubcommandGroup:
      case ApplicationCommandOptionType.Subcommand:
        args[option.name] = parseCommandOptions(interaction, option.options);
        break;
      case ApplicationCommandOptionType.Channel:
        args[option.name] = interaction.data.resolved?.channels?.[option.value];
        break;
      case ApplicationCommandOptionType.Role:
        args[option.name] = interaction.data.resolved?.roles?.[option.value];
        break;
      case ApplicationCommandOptionType.User:
        args[option.name] = {
          user: interaction.data.resolved?.users?.[option.value],
          member: interaction.data.resolved?.members?.[option.value],
        };
        break;
      case ApplicationCommandOptionType.Attachment:
        args[option.name] = interaction.data.resolved?.attachments?.[option.value];
        break;
      case ApplicationCommandOptionType.Mentionable:
        args[option.name] = interaction.data.resolved?.roles?.[option.value] ?? {
          user: interaction.data.resolved?.users?.[option.value],
          member: interaction.data.resolved?.members?.[option.value],
        };
        break;
      default:
        args[option.name] = option.value;
    }
  }

  return args;
}

export function parseComponentArgs<Args extends readonly string[]>(component: Component<any>, args: string[]): Record<Args[number], string> {
  const result = {} as Record<Args[number], string>;

  const keys = component.args;
  if (!keys) return result;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = args[i];

    if (!key || value === undefined) {
      continue;
    }

    result[key as Args[number]] = value;
  }

  return result;
}

export function getChatInputOption(
  options: APIApplicationCommandInteractionDataOption[],
  name: string,
): APIApplicationCommandInteractionDataOption | undefined {
  if (!options.length) return undefined;

  for (const option of options) {
    if (option.name === name) return option;

    if (option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup) {
      const found = getChatInputOption(option.options ?? [], name);

      if (found) return found;
    }
  }
}

export function getChatInputFocusedOption(
  options: APIApplicationCommandInteractionDataOption[],
): (APIApplicationCommandInteractionDataOption & { value: any }) | undefined {
  for (const option of options) {
    if (option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup) {
      const found = getChatInputFocusedOption(option.options ?? []);

      if (found) return found;
    }

    if ('focused' in option && option.focused) return option;
  }
}
