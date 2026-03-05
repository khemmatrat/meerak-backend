import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// สร้างโฟลเดอร์ logs ถ้ายังไม่มี
const logsDir = path.join(__dirname, '../../logs');

// Winston Logger Configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'akonda-backend' },
  transports: [
    // Error logs - สำหรับ Error ระดับ error ขึ้นไป
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined logs - ทุก level
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
    // Payment logs - สำหรับ transaction ทางการเงินเท่านั้น
    new winston.transports.File({
      filename: path.join(logsDir, 'payments.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// ถ้าไม่ใช่ Production ให้ log ออก console ด้วย
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, ...meta }) =>
            `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`
        )
      ),
    })
  );
}

// Helper functions สำหรับ log เฉพาะทาง
export const logPayment = (action, data) => {
  logger.info(`[PAYMENT] ${action}`, {
    category: 'payment',
    action,
    ...data,
  });
};

export const logSecurity = (action, data) => {
  logger.warn(`[SECURITY] ${action}`, {
    category: 'security',
    action,
    ...data,
  });
};

export const logError = (error, context = {}) => {
  logger.error(`[ERROR] ${error.message}`, {
    category: 'error',
    error: error.stack,
    ...context,
  });
};

export default logger;
