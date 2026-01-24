// backend/src/index.ts - Main Server
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import compression from 'compression';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import http from 'http';
import winston from 'winston';
import 'express-async-errors';


// Load environment variables
dotenv.config();

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }
});

// Security Middleware
app.use(helmet());
app.use(cors({  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' })); // สำหรับรูปภาพ base64
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100, // 100 requests ต่อ user
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Redis Client (Cache + Queue)
const redisClient = createClient({
  url: process.env.REDIS_URL
});
await redisClient.connect();

// Database Pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});



redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// WebSocket connection
io.on('connection', (socket) => {
  logger.info('New WebSocket connection:', socket.id);
  
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    logger.info(`User ${userId} joined their room`);
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
// Health Check
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await pool.query('SELECT 1');
    
    // Check Redis connection
    await redisClient.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
      uptime: process.uptime()
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// API Routes (จะเพิ่มภายหลัง)
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to the API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      jobs: '/api/jobs',
      admin: '/api/admin'
    }
  });
});
// Connect to databases
async function initialize() {
  try {
    await redisClient.connect();
    logger.info('✅ Redis connected successfully');
    
    // Test database connection
    await pool.query('SELECT 1');
    logger.info('✅ PostgreSQL connected successfully');
    
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API Base: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  
  await redisClient.quit();
  await pool.end();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Export for testing
export { app, pool, redisClient, io };

// Start the server
if (require.main === module) {
  initialize();
}

// เริ่มต้น server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});