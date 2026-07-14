import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, '..', '..', 'debug-990e30.log');
const SESSION_ID = '990e30';

/** Debug-mode NDJSON log — ไม่ log password/token */
export function agentDebugLog(hypothesisId, location, message, data = {}) {
  try {
    const line =
      JSON.stringify({
        sessionId: SESSION_ID,
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      }) + '\n';
    fs.appendFileSync(LOG_PATH, line, 'utf8');
  } catch (_) {
    /* fail-open */
  }
}
