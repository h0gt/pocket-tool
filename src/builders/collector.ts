import { Collection } from '@discordjs/collection';
import type { Collector, CollectorData, CollectorEvents, CollectorOptions } from '../types/types';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

const collectors = new Collection<string, CollectorData<any>>();

export default function createCollector<Type>(options: CollectorOptions<Type>) {
  const { key, duration, max, filter } = options;

  const id = `${key}_${randomUUID()}`;
  const collected: Type[] = [];
  let stopped = false;
  let timeout: NodeJS.Timeout | undefined;

  const emitter = new EventEmitter<CollectorEvents<Type>>() as Collector<Type>;

  if (duration) timeout = setTimeout(() => emitter.end('expired'), duration);

  emitter.collect = async (item: Type) => {
    if (stopped) return;

    const pass = filter ? filter(item) : true;
    if (!pass) return;

    collected.push(item);

    emitter.emit('collect', item);

    if (max && collected.length >= max) return emitter.end('max reached');

    if (duration && timeout) clearTimeout(timeout);
    timeout = setTimeout(() => emitter.end('expired'), duration);
  };

  emitter.end = (reason?: string) => {
    if (stopped) return;
    stopped = true;

    if (timeout) clearTimeout(timeout);
    timeout = undefined;

    emitter.emit('end', reason ?? '');
    emitter.removeAllListeners();

    collectors.delete(id);
  };

  collectors.set(id, { id, key, max, filter, emitter });

  return emitter;
}
