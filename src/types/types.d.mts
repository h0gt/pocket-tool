import type { Collection } from '@discordjs/collection';
import type { Collector, CollectorOptions, GatewayShard } from './types';

declare module '@discordjs/core' {
  interface Gateway {
    shards: Collection<number, GatewayShard>;
  }

  interface InteractionsAPI {
    createCollector<Type>(options: CollectorOptions<Type>): Collector<Type>;
  }
}
