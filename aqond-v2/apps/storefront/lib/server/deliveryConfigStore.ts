import fs from 'node:fs';
import path from 'node:path';
import { createHotReloadDeliveryConfig } from '@aqond/delivery-core';

const localDevPath = path.join(process.cwd(), '.data', 'dev', 'delivery-config.json');

const fsApi = {
  readFile: (p: string) => fs.readFileSync(p, 'utf8'),
  exists: (p: string) => fs.existsSync(p),
  statMtimeMs: (p: string) => fs.statSync(p).mtimeMs,
};

const deliveryConfigStore = createHotReloadDeliveryConfig(
  () => ({
    envJson: process.env.DELIVERY_CONFIG_JSON,
    envPath: process.env.DELIVERY_CONFIG_PATH,
    localDev: process.env.AQOND_LOCAL_DEV === '1' || process.env.NODE_ENV === 'development',
    localDevPath,
    readFile: fsApi.readFile,
    exists: fsApi.exists,
  }),
  fsApi,
);

export function loadServerDeliveryConfig() {
  return deliveryConfigStore.get();
}

export function deliveryConfigHotReloadMeta() {
  return deliveryConfigStore.meta();
}

export function invalidateDeliveryConfigCache() {
  deliveryConfigStore.invalidate();
}
