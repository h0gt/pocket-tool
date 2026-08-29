import type { API } from '@discordjs/core';
import type { WebSocketManager } from '@discordjs/ws';

export function checkForReshard(gateway: WebSocketManager, recommended: number, current: number): void {
  if (recommended !== current) {
    console.log(`resharding ${current} -> ${recommended}`);

    void gateway.updateShardCount(null);
  }
}

export function scheduleReshardCheck(gateway: WebSocketManager, api: API): void {
  const check = async () => {
    console.log('running reshard check...');

    const recommended = (await api.gateway.getBot()).shards;
    const current = await gateway.getShardCount();

    checkForReshard(gateway, recommended, current);
  };

  void check();

  setInterval(check, 12 * 60 * 60 * 1000);
}
