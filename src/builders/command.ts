import type { ApplicationCommand, ChatInputOptions } from '../types/types';
import { commands } from '../bot/collections';

export default function createApplicationCommand<const Options extends ChatInputOptions = ChatInputOptions>(
  command: ApplicationCommand<Options>,
): void {
  commands.set(typeof command.name === 'string' ? command.name : command.name.global, command as ApplicationCommand);
}
