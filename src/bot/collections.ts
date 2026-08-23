import { Collection } from '@discordjs/collection';
import type { ApplicationCommand, Collector, Component, GatewayEvent } from '../types/types';
import type { GatewayDispatchEvents, Snowflake } from '@discordjs/core';

export const commands = new Collection<string, ApplicationCommand>();
export const components = new Collection<string, Component>();
export const events = new Collection<GatewayDispatchEvents, GatewayEvent>();

export const collectors = new Set<Collector<any>>();

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();

export const uptimes = new Collection<number, number>();
export const latencies = new Collection<number, number>();
