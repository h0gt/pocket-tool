import { GatewayDispatchEvents } from '@discordjs/core';
import type { GatewayEvent } from '../types/types.js';
import { events } from '../bot';

export default function createGatewayEvent<const Event extends GatewayDispatchEvents = GatewayDispatchEvents>(
  event: GatewayEvent<Event>,
): void {
  events.set(event.event, event as unknown as GatewayEvent);
}
