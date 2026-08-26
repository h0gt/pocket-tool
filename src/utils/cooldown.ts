import type { Snowflake } from '@discordjs/core';
import { Collection } from '@discordjs/collection';

export const cooldowns = new Collection<string, Collection<Snowflake, number>>();

export function checkCooldown(commandName: string, userId: Snowflake, cooldown?: number): number | null {
  if (!cooldown || cooldown <= 0) {
    return null;
  }

  const cooldownMs = cooldown * 1000;

  if (!cooldowns.has(commandName)) {
    cooldowns.set(commandName, new Collection<Snowflake, number>());
  }

  const timestamps = cooldowns.get(commandName)!;
  const now = Temporal.Now.instant().epochMilliseconds;
  const lastUsed = timestamps.get(userId);

  if (lastUsed !== undefined) {
    const expiration = lastUsed + cooldownMs;

    if (now < expiration) {
      return expiration;
    }
  }

  timestamps.set(userId, now);

  setTimeout(() => {
    timestamps.delete(userId);
  }, cooldownMs);

  return null;
}
