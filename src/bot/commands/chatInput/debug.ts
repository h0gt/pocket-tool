import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core';
import createApplicationCommand from '../../../builders/command';
import { toComponentEmoji } from '../../../utils/utils';
import { highlight, hyperlink } from '../../../utils/markdown';
import { HighlightStyle } from '../../../types/types';
import { INVITE, SUPPORT, WEBSITE } from '../../constants';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'debug',
  description: 'View stats and information about me!',
  integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
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
              content: `### ${hyperlink(WEBSITE, 'Welcome to Pocket Tool!')}\nYou can view all the available slash commands by typing ${highlight('/', HighlightStyle.Bold)}\n-# additionally, you can view context menu commands by right-clicking or long-pressing a message or user`,
            },
            {
              type: ComponentType.TextDisplay,
              content: `-# **Quickstart:**\n> </help:1504215560865448037> - View and search through all the available commands\n> </debug:1533585400138961059> - View stats and information about me!`,
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
                  type: ComponentType.StringSelect,
                  custom_id: `debug-pages_${interaction.user?.id ?? interaction.member?.user.id}`,
                  options: [
                    {
                      label: 'About',
                      value: 'about',
                      default: true,
                    },
                    {
                      label: 'Stats',
                      value: 'stats',
                    },
                    {
                      label: 'Usage',
                      value: 'usage',
                    },
                    {
                      label: 'Credits',
                      value: 'credits',
                    },
                  ],
                },
              ],
            },
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.Button,
                  label: 'Authorize',
                  emoji: toComponentEmoji('Link'),
                  url: INVITE,
                  style: ButtonStyle.Link,
                },
                {
                  type: ComponentType.Button,
                  label: 'Support Server',
                  emoji: toComponentEmoji('Discord'),
                  url: SUPPORT,
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
