import { GatewayDispatchEvents } from '@discordjs/core';
import createGatewayEvent from '../../builders/event';

createGatewayEvent({
  type: GatewayDispatchEvents.EntitlementUpdate,
  async run(entitlement, api) {
    if (entitlement.sku_id === '1538163894256930917') {
      const member = await api.guilds.getMember('1533439024637939792', entitlement.user_id!).catch(() => null);

      if (member) {
        await api.guilds.removeRoleFromMember('1533439024637939792', entitlement.user_id!, '1538175871985127495');
      }
    }
  },
});
