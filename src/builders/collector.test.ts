import { afterEach, describe, expect, test } from 'bun:test';
import createCollector, { activeCollectors } from './collector';

afterEach(() => {
  for (const collector of activeCollectors) {
    collector.end();
  }
});

describe('createCollector', () => {
  test('removes ended collectors from the active registry', () => {
    const collector = createCollector<string>({ key: 'test' });

    expect(activeCollectors.has(collector)).toBe(true);

    collector.end('done');

    expect(activeCollectors.has(collector)).toBe(false);
  });

  test('ends after collecting the configured maximum', async () => {
    const collector = createCollector<object>({ key: 'test', max: 2 });
    const reasons: string[] = [];

    collector.on('end', (reason) => reasons.push(reason));

    await collector.collect({ value: 1 });
    await collector.collect({ value: 2 });

    expect(reasons).toEqual(['max reached']);
    expect(activeCollectors.has(collector)).toBe(false);
  });

  test('keeps collectors without a duration active after collection', async () => {
    const collector = createCollector<string>({ key: 'test' });

    await collector.collect('value');
    await Bun.sleep(10);

    expect(activeCollectors.has(collector)).toBe(true);
  });
});
