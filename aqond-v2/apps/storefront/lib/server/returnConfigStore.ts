import fs from 'node:fs';
import path from 'node:path';
import { loadReturnConfigWithOptions } from '@aqond/return-core';

const localDevPath = path.join(process.cwd(), '.data', 'dev', 'return-config.json');

export function loadServerReturnConfig() {
  return loadReturnConfigWithOptions({
    envJson: process.env.RETURN_CONFIG_JSON,
    envPath: process.env.RETURN_CONFIG_PATH,
    localDev: process.env.AQOND_LOCAL_DEV === '1' || process.env.NODE_ENV === 'development',
    localDevPath,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    exists: (p) => fs.existsSync(p),
  });
}
