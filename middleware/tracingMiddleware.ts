/**
 * Phase 0: Foundation Lock - Tracing Middleware
 * 
 * Express middleware for adding request_id and trace_id to all requests
 * Provides distributed tracing capabilities
 */

import { Request, Response, NextFunction } from 'express';
import { createRequestContext, RequestContext, setCurrentContext, clearCurrentContext } from '../utils/tracing';

/**
 * Extend Express Request to include context
 */
declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Tracing Middleware
 * Adds request_id and trace_id to all incoming requests
 * 
 * Usage:
 * ```typescript
 * import { tracingMiddleware } from './middleware/tracingMiddleware';
 * app.use(tracingMiddleware());
 * ```
 */
export function tracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract trace_id from header (if provided by client)
    const existingTraceId = req.headers['x-trace-id'] as string | undefined;
    
    // Determine source
    const userAgent = req.headers['user-agent'] || '';
    let source: 'web' | 'mobile' | 'admin' | 'api' = 'web';
    
    if (req.path.startsWith('/admin')) {
      source = 'admin';
    } else if (req.path.startsWith('/api')) {
      source = 'api';
    } else if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      source = 'mobile';
    }
    
    // Create request context
    const context = createRequestContext(source, existingTraceId);
    
    // Add IP address and user agent
    context.ip_address = req.ip || req.socket.remoteAddress;
    context.user_agent = userAgent;
    
    // Attach context to request
    req.context = context;
    
    // Set current context (for async context storage)
    setCurrentContext(context);
    
    // Add trace headers to response
    res.setHeader('X-Request-ID', context.request_id);
    res.setHeader('X-Trace-ID', context.trace_id);
    
    // Log incoming request
    console.log(`📥 [${context.request_id}] ${req.method} ${req.path} (trace: ${context.trace_id})`);
    
    // Log response when finished
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(
        `📤 [${context.request_id}] ${res.statusCode} ${req.method} ${req.path} (${duration}ms)`
      );
      
      // Clear context after response
      clearCurrentContext();
    });
    
    next();
  };
}

/**
 * User Context Middleware
 * Adds user information to request context (must run after authentication middleware)
 * 
 * Usage:
 * ```typescript
 * app.use(authMiddleware);  // First authenticate
 * app.use(userContextMiddleware());  // Then add user to context
 * ```
 */
export function userContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.context && (req as any).user) {
      const user = (req as any).user;
      
      // Add user info to context
      req.context.user_id = user.id || user.uid;
      req.context.user_role = user.role;
      
      // Update current context
      setCurrentContext(req.context);
      
      console.log(`👤 [${req.context.request_id}] User: ${req.context.user_id} (${req.context.user_role})`);
    }
    
    next();
  };
}

/**
 * Error Tracing Middleware
 * Adds trace information to error responses
 * 
 * Usage:
 * ```typescript
 * // Add at the end of middleware chain
 * app.use(errorTracingMiddleware());
 * ```
 */
export function errorTracingMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const context = req.context;
    
    if (context) {
      console.error(
        `❌ [${context.request_id}] Error in ${req.method} ${req.path}:`,
        err.message
      );
      
      // Add trace info to error response
      res.status(500).json({
        error: err.message,
        request_id: context.request_id,
        trace_id: context.trace_id,
        timestamp: new Date().toISOString()
      });
    } else {
      // Fallback if context not available
      console.error(`❌ Error in ${req.method} ${req.path}:`, err.message);
      res.status(500).json({
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Performance Monitoring Middleware
 * Logs slow requests
 * 
 * @param threshold - Time threshold in milliseconds (default: 1000ms)
 */
export function performanceMiddleware(threshold: number = 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      if (duration > threshold && req.context) {
        console.warn(
          `⚠️ [${req.context.request_id}] Slow request detected: ${req.method} ${req.path} took ${duration}ms`
        );
      }
    });
    
    next();
  };
}
