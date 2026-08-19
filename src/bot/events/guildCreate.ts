import { GatewayDispatchEvents } from '@discordjs/core';
import createGatewayEvent from '../../builders/event';

createGatewayEvent({
  type: GatewayDispatchEvents.GuildCreate,
  async run(guild, api) {
    await api.rest.patch(`/guilds/${guild.id}/members/@me`, {
      body: {
        display_name_font_style: 3,
        display_name_effect_id: 2,
        display_name_colors: [6662399, 16777215],
      },
    });
  },
});
