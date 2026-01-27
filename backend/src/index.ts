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

// Initialize Firebase Admin SDK (must be first)
import './services/firebase.service';

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
app.use(cors({  
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true 
}));
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

// Database Pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || process.env.DB_DATABASE,
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
    try {
      await redisClient.ping();
    } catch (redisError) {
      logger.warn('Redis not connected:', redisError);
    }
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisClient.isOpen ? 'connected' : 'disconnected',
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

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to the MEERAK API',
    version: '1.0.0',
      endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      payments: '/api/payments',
      kyc: '/api/kyc',
      jobs: '/api/jobs',
      jobs_recommended: '/api/jobs/recommended',
      jobs_all: '/api/jobs/all',
      jobs_categories: '/api/jobs/categories',
      jobs_forms: '/api/jobs/forms/:category',
      billing: '/api/jobs/:jobId/billing',
      admin: '/api/admin',
      reports: '/api/reports',
      integration: '/api/integration'
    }
  });
});

// Import and register routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import paymentRoutes from './routes/payment.routes';
import kycRoutes from './routes/kyc.routes';
import adminRoutes from './routes/admin.routes';
import reportRoutes from './routes/report.routes';
import integrationRoutes from './routes/integration.routes';
import jobRoutes from './routes/job.routes';
import jobCategoriesRoutes from './routes/job-categories.routes';

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/jobs/categories', jobCategoriesRoutes);

// Request logging middleware
app.use((req, _res, next) => {
  console.log('➡️ HIT:', req.method, req.url);
  next();
});

// Connect to databases
async function initialize() {
  try {
    // Connect Redis
    if (process.env.REDIS_URL) {
      await redisClient.connect();
      logger.info('✅ Redis connected successfully');
    } else {
      logger.warn('⚠️ Redis URL not set, skipping Redis connection');
    }
    
    // Test database connection
    await pool.query('SELECT 1');
    logger.info('✅ PostgreSQL connected successfully');
    
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API Base: http://localhost:${PORT}/api`);
      logger.info(`🔐 Auth endpoints: http://localhost:${PORT}/api/auth`);
      logger.info(`👤 User endpoints: http://localhost:${PORT}/api/users`);
    });
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
  await pool.end();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Initialize server
initialize();

// Export for testing and other modules
export { app, pool, redisClient, io };
