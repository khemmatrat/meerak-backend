// ✅ Nexus Admin Core Wrapper for Main Meerak App
import React from 'react';

// Import Nexus Admin Core App
// Note: This requires adjusting the import path
const NexusAdminApp = React.lazy(() => import('../../nexus-admin-core/App'));

export const NexusAdminDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50">
      <React.Suspense fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-slate-600 font-medium">Loading Nexus Admin Core...</p>
          </div>
        </div>
      }>
        <NexusAdminApp />
      </React.Suspense>
    </div>
  );
};
