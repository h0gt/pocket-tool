import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonStyle,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../builders/command';
import { toComponentEmoji } from '../../../utils/utils';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'debug',
  description: 'Views some information about me!',
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
              content: `### Welcome to Pocket Tool!\nYou can view all the available commands by running </help:1504215560865448037>`,
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
                  label: 'Add to Your Apps!',
                  emoji: toComponentEmoji('Link'),
                  url: `https://pocket-tool.vercel.app/api/invite`,
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
