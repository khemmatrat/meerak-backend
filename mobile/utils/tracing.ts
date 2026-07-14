/**
 * Phase 0: Foundation Lock - Request Tracing System
 * 
 * This module provides request_id and trace_id generation and management
 * for distributed tracing across the entire application.
 * 
 * Key Concepts:
 * - request_id: Unique identifier for each HTTP request (UUID)
 * - trace_id: Identifier for a chain of related operations (UUID)
 * - Trace context: Carries trace information across async boundaries
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Request Context Interface
 * Contains all tracing and audit information for a request
 */
export interface RequestContext {
  request_id: string;          // UUID per request
  trace_id: string;            // UUID per transaction chain
  user_id?: string;            // Current user ID (if authenticated)
  user_role?: string;          // User role (for RBAC)
  timestamp: string;           // ISO 8601 timestamp
  source: 'web' | 'mobile' | 'admin' | 'api';
  ip_address?: string;         // Client IP address
  user_agent?: string;         // Client user agent
  session_id?: string;         // Session identifier
}

/**
 * Generate a new request context
 */
export function createRequestContext(
  source: 'web' | 'mobile' | 'admin' | 'api' = 'web',
  existingTraceId?: string
): RequestContext {
  return {
    request_id: uuidv4(),
    trace_id: existingTraceId || uuidv4(),
    timestamp: new Date().toISOString(),
    source
  };
}

/**
 * Generate UUID for IDs
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generate short ID (for display purposes)
 * Format: XXXXXX (6 characters)
 */
export function generateShortId(): string {
  return uuidv4().substring(0, 6).toUpperCase();
}

/**
 * Parse trace ID from header or generate new one
 */
export function parseTraceId(headerValue?: string): string {
  if (headerValue && isValidUUID(headerValue)) {
    return headerValue;
  }
  return uuidv4();
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Tracing Logger
 * Logs with trace context for debugging
 */
export class TracingLogger {
  constructor(private context: RequestContext) {}

  log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    const logEntry = {
      level,
      message,
      data,
      request_id: this.context.request_id,
      trace_id: this.context.trace_id,
      user_id: this.context.user_id,
      timestamp: new Date().toISOString()
    };

    switch (level) {
      case 'info':
        console.log(JSON.stringify(logEntry));
        break;
      case 'warn':
        console.warn(JSON.stringify(logEntry));
        break;
      case 'error':
        console.error(JSON.stringify(logEntry));
        break;
    }
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | any) {
    this.log('error', message, {
      error: error?.message || error,
      stack: error?.stack
    });
  }
}

/**
 * Create logger with trace context
 */
export function createLogger(context: RequestContext): TracingLogger {
  return new TracingLogger(context);
}

/**
 * Async context storage (for Node.js environments)
 * Allows accessing trace context from anywhere in the call stack
 */
let currentContext: RequestContext | null = null;

export function setCurrentContext(context: RequestContext) {
  currentContext = context;
}

export function getCurrentContext(): RequestContext | null {
  return currentContext;
}

export function clearCurrentContext() {
  currentContext = null;
}
