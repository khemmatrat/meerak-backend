/**
 * Phase 0: Foundation Lock - Audit Logging System
 * 
 * This module provides comprehensive audit logging for all data changes
 * Tracks: WHO changed WHAT, WHEN, WHY, and HOW
 */

import { db } from '../services/firebase';
import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { RequestContext } from './tracing';

/**
 * Deep clean object - remove all undefined values recursively
 */
function deepClean(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClean(item)).filter(item => item !== null);
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = deepClean(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Audit Log Entry Interface
 */
export interface AuditLogEntry {
  id?: string;                     // Auto-generated
  
  // What changed
  table_name: string;              // Collection/Table name
  record_id: string;               // Document/Record ID
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
  
  // Changes
  old_values?: Record<string, any>;  // Before state
  new_values?: Record<string, any>;  // After state
  diff?: Record<string, {           // Calculated diff
    old: any;
    new: any;
  }>;
  
  // Who changed it
  user_id?: string;                // User who made the change
  user_role?: string;              // User role
  user_name?: string;              // User display name
  user_email?: string;             // User email
  
  // When and where
  timestamp: string;               // ISO 8601 timestamp
  ip_address?: string;             // Client IP
  user_agent?: string;             // Browser/Client info
  device_id?: string;              // Device identifier
  
  // Tracing
  request_id?: string;             // Request ID
  trace_id?: string;               // Trace ID
  
  // Why (optional)
  reason?: string;                 // Admin reason for change
  notes?: string;                  // Additional notes
  
  // Metadata
  source: 'web' | 'mobile' | 'admin' | 'api' | 'system';
  action_type?: string;            // Specific action (e.g., 'approve_kyc', 'refund_payment')
}

/**
 * Log an audit entry
 * 
 * @param entry - Audit log entry
 * @param context - Optional request context
 */
export async function logAudit(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  context?: RequestContext
): Promise<string> {
  try {
    // Calculate diff if both old and new values provided
    let diff: Record<string, { old: any; new: any }> | undefined;
    
    if (entry.old_values && entry.new_values) {
      diff = {};
      const allKeys = new Set([
        ...Object.keys(entry.old_values),
        ...Object.keys(entry.new_values)
      ]);
      
      for (const key of allKeys) {
        const oldVal = entry.old_values[key];
        const newVal = entry.new_values[key];
        
        // Only include if values are different
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          diff[key] = {
            old: oldVal,
            new: newVal
          };
        }
      }
      
      // If no differences, set to undefined
      if (Object.keys(diff).length === 0) {
        diff = undefined;
      }
    }
    
    // Complete audit entry
    const completeEntry: AuditLogEntry = {
      ...entry,
      diff,
      timestamp: new Date().toISOString(),
      request_id: context?.request_id,
      trace_id: context?.trace_id,
      user_id: context?.user_id,
      ip_address: context?.ip_address,
      user_agent: context?.user_agent,
      source: context?.source || entry.source
    };
    
    // Deep clean to remove all undefined values (Firestore doesn't allow undefined)
    const cleanedEntry = deepClean(completeEntry);
    
    // Store in Firestore
    const docRef = await addDoc(collection(db, 'audit_logs'), cleanedEntry);
    
    console.log(`✅ Audit log created: ${entry.operation} on ${entry.table_name}/${entry.record_id} by ${entry.user_id || 'system'}`);
    
    return docRef.id;
    
  } catch (error) {
    console.error('❌ Error creating audit log:', error);
    // Don't throw - audit logs shouldn't break the main flow
    return '';
  }
}

/**
 * Log CREATE operation
 */
export async function logCreate(
  tableName: string,
  recordId: string,
  newValues: Record<string, any>,
  context?: RequestContext,
  options?: {
    user_id?: string;
    user_role?: string;
    reason?: string;
    action_type?: string;
  }
): Promise<string> {
  return logAudit({
    table_name: tableName,
    record_id: recordId,
    operation: 'CREATE',
    new_values: newValues,
    source: context?.source || 'web',
    ...options
  }, context);
}

/**
 * Log UPDATE operation
 */
export async function logUpdate(
  tableName: string,
  recordId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  context?: RequestContext,
  options?: {
    user_id?: string;
    user_role?: string;
    reason?: string;
    action_type?: string;
  }
): Promise<string> {
  return logAudit({
    table_name: tableName,
    record_id: recordId,
    operation: 'UPDATE',
    old_values: oldValues,
    new_values: newValues,
    source: context?.source || 'web',
    ...options
  }, context);
}

/**
 * Log DELETE operation
 */
export async function logDelete(
  tableName: string,
  recordId: string,
  oldValues: Record<string, any>,
  context?: RequestContext,
  options?: {
    user_id?: string;
    user_role?: string;
    reason?: string;
    action_type?: string;
  }
): Promise<string> {
  return logAudit({
    table_name: tableName,
    record_id: recordId,
    operation: 'DELETE',
    old_values: oldValues,
    source: context?.source || 'web',
    ...options
  }, context);
}

/**
 * Query audit logs for a specific record
 * 
 * @param tableName - Table/Collection name
 * @param recordId - Record ID
 * @param limitCount - Max number of logs to return
 * @returns Array of audit log entries
 */
export async function getAuditHistory(
  tableName: string,
  recordId: string,
  limitCount: number = 50
): Promise<AuditLogEntry[]> {
  try {
    const q = query(
      collection(db, 'audit_logs'),
      where('table_name', '==', tableName),
      where('record_id', '==', recordId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const logs: AuditLogEntry[] = [];
    
    snapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      } as AuditLogEntry);
    });
    
    return logs;
    
  } catch (error) {
    console.error(`Error fetching audit history for ${tableName}/${recordId}:`, error);
    return [];
  }
}

/**
 * Query audit logs by user
 * 
 * @param userId - User ID
 * @param limitCount - Max number of logs to return
 * @returns Array of audit log entries
 */
export async function getUserAuditHistory(
  userId: string,
  limitCount: number = 100
): Promise<AuditLogEntry[]> {
  try {
    const q = query(
      collection(db, 'audit_logs'),
      where('user_id', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    const logs: AuditLogEntry[] = [];
    
    snapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      } as AuditLogEntry);
    });
    
    return logs;
    
  } catch (error) {
    console.error(`Error fetching audit history for user ${userId}:`, error);
    return [];
  }
}

/**
 * Query audit logs by trace ID
 * Shows all operations in a transaction chain
 * 
 * @param traceId - Trace ID
 * @returns Array of audit log entries
 */
export async function getTraceAuditHistory(
  traceId: string
): Promise<AuditLogEntry[]> {
  try {
    const q = query(
      collection(db, 'audit_logs'),
      where('trace_id', '==', traceId),
      orderBy('timestamp', 'asc')
    );
    
    const snapshot = await getDocs(q);
    const logs: AuditLogEntry[] = [];
    
    snapshot.forEach((doc) => {
      logs.push({
        id: doc.id,
        ...doc.data()
      } as AuditLogEntry);
    });
    
    return logs;
    
  } catch (error) {
    console.error(`Error fetching audit history for trace ${traceId}:`, error);
    return [];
  }
}

/**
 * Format audit log for display
 */
export function formatAuditLog(log: AuditLogEntry): string {
  const date = new Date(log.timestamp).toLocaleString('th-TH');
  const user = log.user_name || log.user_email || log.user_id || 'System';
  const action = log.action_type || log.operation;
  
  let changes = '';
  if (log.diff) {
    const changedFields = Object.keys(log.diff);
    changes = ` (${changedFields.join(', ')})`;
  }
  
  return `[${date}] ${user} ${action} ${log.table_name}/${log.record_id}${changes}`;
}

/**
 * Export audit logs to CSV (for reporting)
 */
export function exportAuditLogsToCSV(logs: AuditLogEntry[]): string {
  const headers = [
    'Timestamp',
    'User ID',
    'User Name',
    'Operation',
    'Table',
    'Record ID',
    'Action Type',
    'Changes',
    'Reason',
    'IP Address',
    'Trace ID'
  ];
  
  const rows = logs.map(log => [
    log.timestamp,
    log.user_id || '',
    log.user_name || '',
    log.operation,
    log.table_name,
    log.record_id,
    log.action_type || '',
    log.diff ? JSON.stringify(log.diff) : '',
    log.reason || '',
    log.ip_address || '',
    log.trace_id || ''
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  return csvContent;
}
