import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { highlight } from '../../../utils/markdown';
import { HighlightStyle } from '../../../types/types';
import { toComponentEmoji } from '../../../utils/utils';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'help',
  description: 'Learn more about me and what I can do',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  cooldown: 3,
  acknowledge: true,
  async run(interaction, options, api) {
    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.Container,
          components: [
            {
              type: ComponentType.TextDisplay,
              content: `## Welcome to Pocket Tool!\nYou can view all the available slash commands by typing ${highlight('/', HighlightStyle.Bold)}\n-# additionally, you can view context menu commands by right-clicking or long-pressing a message or user`,
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.TextDisplay,
              content:
                '### How to report bugs?\nTo report bugs, join our __support server__ and create a post at https://discord.com/channels/1533439024637939792/1533485684961054781',
            },
            {
              type: ComponentType.Separator,
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: 'Add to Your Apps!',
                  emoji: toComponentEmoji('Link'),
                  url: `https://discord.com/oauth2/authorize?client_id=${interaction.application_id}`,
                  style: ButtonStyle.Link,
                },
                {
                  type: ComponentType.Button,
                  label: 'Support Server',
                  emoji: toComponentEmoji('Discord'),
                  url: 'https://discord.gg/Y67yNmsPuf',
                  style: ButtonStyle.Link,
                },
              ],
            },
          ],
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
