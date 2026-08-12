import { commands } from '../app/index';
import type { ApplicationCommand, ChatInputOptions } from '../types/types';

export default function createApplicationCommand<const Options extends ChatInputOptions = ChatInputOptions>(
  command: ApplicationCommand<Options>,
): void {
  commands.set(command.name, command as ApplicationCommand);
}
