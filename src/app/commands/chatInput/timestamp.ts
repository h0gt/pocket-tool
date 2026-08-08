import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ComponentType,
  InteractionContextType,
  MessageFlags,
} from '@discordjs/core/http-only';
import createApplicationCommand from '../../../helpers/command';
import { parse } from 'chrono-node';
import { emoji, timestamp } from '../../../utils/markdown';
import type { TimestampStyle } from '../../../types/types';
import { getAutocompleteFocusedOption } from '../../../utils/utils';
import { Temporal } from '@js-temporal/polyfill';

createApplicationCommand({
  type: ApplicationCommandType.ChatInput,
  name: 'timestamp',
  description: 'Generates a Discord style timestamp for the given time',
  integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
  contexts: [InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'time',
      description: 'The time to convert to a timestamp',
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'timezone',
      description: 'The timezone to use for the timestamp',
      required: false,
      autocomplete: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: 'style',
      description: 'The timestamp style to use',
      required: false,
      choices: [
        {
          name: 'Short Time',
          value: 't',
        },
        {
          name: 'Medium Time',
          value: 'T',
        },
        {
          name: 'Short Date',
          value: 'd',
        },
        {
          name: 'Long Date',
          value: 'D',
        },
        {
          name: 'Long Date and Short Time',
          value: 'f',
        },
        {
          name: 'Full Date and Short Time',
          value: 'F',
        },
        {
          name: 'Short Date and Short Time',
          value: 's',
        },
        {
          name: 'Short Date and Medium Time',
          value: 'S',
        },
        {
          name: 'Relative Time',
          value: 'R',
        },
      ],
    },
  ],
  cooldown: 3,
  acknowledge: true,
  async autocomplete(interaction, api) {
    const focused = getAutocompleteFocusedOption(interaction.data.options);
    const value = String(focused?.value ?? '').toLowerCase();

    const now = new Date();

    const choices = Intl.supportedValuesOf('timeZone')
      .map((z) => ({
        name: `${z} (${new Intl.DateTimeFormat('en-US', {
          timeZone: z,
          timeZoneName: 'short',
        })
          .format(now)
          .split(', ')
          .pop()})`,
        value: z,
      }))
      .filter((c) => c.name.toLowerCase().includes(value))
      .slice(0, 25);

    await api.interactions.createAutocompleteResponse(interaction.id, interaction.token, { choices });
  },
  async run(interaction, options, api) {
    const { time, timezone, style } = options;

    const date = parseDate(time, timezone ?? 'UTC');

    if (!date) {
      await api.interactions.editReply(interaction.application_id, interaction.token, {
        components: [
          {
            type: ComponentType.Container,
            components: [
              {
                type: ComponentType.TextDisplay,
                content: `${emoji('Exclamation')} Please provide a valid time to convert`,
              },
            ],
          },
        ],
        flags: MessageFlags.IsComponentsV2,
      });

      return;
    }

    await api.interactions.editReply(interaction.application_id, interaction.token, {
      components: [
        {
          type: ComponentType.TextDisplay,
          content: timestamp(date, (style ?? 'f') as TimestampStyle),
        },
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});

function parseDate(time: string, timezone: string): number {
  const reference = Temporal.Now.zonedDateTimeISO(timezone);

  const referenceDate = new Date(
    Date.UTC(
      reference.year,
      reference.month - 1,
      reference.day,
      reference.hour,
      reference.minute,
      reference.second,
      reference.millisecond,
    ),
  );

  const parsed = parse(time, referenceDate)[0];

  if (!parsed) {
    throw new Error('Invalid date provided');
  }

  const year = parsed.start.get('year')!;
  const month = parsed.start.get('month')!;
  const day = parsed.start.get('day')!;

  const hour = parsed.start.get('hour') ?? 0;
  const minute = parsed.start.get('minute') ?? 0;
  const second = parsed.start.get('second') ?? 0;

  const millisecond = parsed.start.get('millisecond') ?? 0;

  const date = Temporal.ZonedDateTime.from({
    timeZone: timezone,
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    microsecond: 0,
    nanosecond: 0,
  });

  return date.epochMilliseconds;
}
