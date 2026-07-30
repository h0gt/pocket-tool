import { commands } from '../bot/index';
import type { ApplicationCommand, ChatInputOption } from '../types/types';

export default function createApplicationCommand<const Options extends ChatInputOption[] = ChatInputOption[]>(command: ApplicationCommand<Options>): void {
  commands.set(typeof command.name === 'string' ? command.name : command.name.global, command as ApplicationCommand);
}
