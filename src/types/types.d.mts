import type { Collection } from '@discordjs/collection';
import type { GatewayShard } from './types';

declare module '@discordjs/core' {
  interface Gateway {
    shards: Collection<number, GatewayShard>;
  }
}
