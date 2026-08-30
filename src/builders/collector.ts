import type { Collector, CollectorEvents, CollectorOptions } from '../types/types';
import { EventEmitter } from 'events';

export const collectors = new Set<Collector<unknown>>();

export default function createCollector<Type>(options: CollectorOptions<Type>): Collector<Type> {
  const { duration, max, filter } = options;

  let collectedCount = 0;
  let stopped = false;
  let timeout: NodeJS.Timeout | undefined;

  const emitter = new EventEmitter<CollectorEvents<Type>>() as Collector<Type>;

  const resetTimeout = () => {
    if (!duration) {
      return;
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => emitter.end('expired'), duration);
  };

  collectors.add(emitter);
  resetTimeout();

  emitter.collect = (item: Type) => {
    if (stopped) {
      return;
    }

    if (max && collectedCount >= max) {
      emitter.end('max reached');
      return;
    }

    const pass = filter ? filter(item) : true;

    if (!pass) {
      return;
    }

    collectedCount++;

    emitter.emit('collect', item);

    resetTimeout();
  };

  emitter.end = (reason?: string) => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (timeout) clearTimeout(timeout);
    timeout = undefined;

    try {
      emitter.emit('end', reason ?? '');
    } finally {
      collectors.delete(emitter);
      emitter.removeAllListeners();
    }
  };

  return emitter;
}
