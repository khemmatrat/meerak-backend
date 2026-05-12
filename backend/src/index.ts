// backend/src/index.ts - Main Server
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import compression from "compression";
import { createClient } from "redis";
import { Pool } from "pg";
import { Server } from "socket.io";
import http from "http";
import winston from "winston";
import "express-async-errors";
import { setRedis, setPool } from "./store";

// Initialize Firebase Admin SDK (optional)
try {
  await import("./services/firebase.service");
} catch {
  // Firebase optional - skip if not configured
}

// Load environment variables
dotenv.config();

// Logger configuration
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// CORS: allow multiple origins (comma-separated) or single; include Nexus Admin on LAN
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const corsOrigins = corsOrigin.includes(",")
  ? corsOrigin.split(",").map((o) => o.trim())
  : corsOrigin;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: "10mb" })); // สำหรับรูปภาพ base64
app.use(express.urlencoded({ extended: true }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100, // 100 requests ต่อ user
  message: "Too many requests from this IP",
});
app.use("/api/", limiter);

// Redis Client (Cache + Queue)
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// Database Pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

redisClient.on("error", (err) => logger.error("Redis Client Error", err));
setRedis(redisClient as any);
setPool(pool);

// WebSocket connection
io.on("connection", (socket) => {
  logger.info("New WebSocket connection:", socket.id);

  socket.on("join", (userId) => {
    socket.join(`user:${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  socket.on("disconnect", () => {
    logger.info("Client disconnected:", socket.id);
  });
});

// Global error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  },
);
// Health Check
app.get("/health", async (req, res) => {
  try {
    // Check database connection
    await pool.query("SELECT 1");

    // Check Redis connection
    await redisClient.ping();

    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      redis: "connected",
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
// Import Routes
import paymentGatewayRoutes from "./routes/payment.gateway.routes";
import ledgerRoutes from "./routes/ledger.routes";
import walletRoutes from "./routes/wallet.routes";
import reconciliationRoutes from "./routes/reconciliation.routes";
import adminReconciliationRoutes from "./routes/admin.reconciliation.routes";
import auditRoutes from "./routes/audit.routes";
import authRoutes from "./routes/auth.routes";
import adminUserRoutes from "./routes/admin.user.routes";
import adminKycRoutes from "./routes/admin.kyc.routes";
import adminFinancialRoutes from "./routes/admin.financial.routes";
import userRoutes from "./routes/user.routes";
import paymentRoutes from "./routes/payment.routes";
import kycRoutes from "./routes/kyc.routes";
import reportRoutes from "./routes/report.routes";
import integrationRoutes from "./routes/integration.routes";
import jobRoutes from "./routes/job.routes";
import jobCategoriesRoutes from "./routes/job-categories.routes";

// API Routes
app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to the API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      jobs: "/api/jobs",
      admin: "/api/admin",
      payment_gateway: "/api/payment-gateway",
      wallet: "/api/wallet",
      ledger: "/api/ledger",
      reconciliation: "/api/reconciliation",
      audit: "/api/audit",
    },
  });
});

// Phase 3: Payment Gateway Routes
app.use("/api/payment-gateway", paymentGatewayRoutes);
// Append-only ledger for audit & reconciliation (PromptPay, TrueMoney, Bank Transfer top-up)
app.use("/api/ledger", ledgerRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/admin/reconciliation", adminReconciliationRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/kyc", adminKycRoutes);
app.use("/api/admin/financial", adminFinancialRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/integration", integrationRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/jobs/categories", jobCategoriesRoutes);
// Connect to databases
async function initialize() {
  try {
    await redisClient.connect();
    logger.info("✅ Redis connected successfully");

    // Test database connection
    await pool.query("SELECT 1");
    logger.info("✅ PostgreSQL connected successfully");

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API Base: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received. Starting graceful shutdown...");

  await redisClient.quit();
  await pool.end();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

// Export for testing
export { app, pool, redisClient, io };

// Start the server
initialize();
