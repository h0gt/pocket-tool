import type { API } from '@discordjs/core';
import type { WebSocketManager } from '@discordjs/ws';
import cron from 'node-cron';

export function checkForReshard(gateway: WebSocketManager, recommended: number, current: number): void {
  if (recommended !== current) {
    console.log(`resharding ${current} -> ${recommended}`);

    void gateway.updateShardCount(null);
  }
}

export function scheduleReshardCheck(gateway: WebSocketManager, api: API): void {
  cron.schedule('0 */12 * * *', async () => {
    console.log('running reshard check...');

    const recommended = (await api.gateway.getBot()).shards;
    const current = await gateway.getShardCount();

    checkForReshard(gateway, recommended, current);
  });
}
