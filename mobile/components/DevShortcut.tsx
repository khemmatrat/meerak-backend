/**
 * ⚠️ DEV SHORTCUT ONLY - DELETE BEFORE PRODUCTION! ⚠️
 * 
 * This component provides quick login for development testing.
 * DO NOT include in production build!
 * 
 * TO REMOVE:
 * 1. Delete this file (components/DevShortcut.tsx)
 * 2. Remove import from Login.tsx
 * 3. Remove <DevShortcut /> from Login.tsx
 * 4. Delete dev-test-accounts/ folder (Provider Platinum test user)
 */

import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

interface DevShortcutProps {
  onQuickLogin: (phone: string, password: string) => void;
}

interface TestAccount {
  phone: string;
  password: string;
  name: string;
}

export const DevShortcut: React.FC<DevShortcutProps> = ({ onQuickLogin }) => {
  const [platinumAccount, setPlatinumAccount] = useState<TestAccount | null>(null);

  useEffect(() => {
    import('../dev-test-accounts/config.json')
      .then((m) => {
        const c = (m as { default?: { platinumProvider?: TestAccount } }).default?.platinumProvider;
        if (c?.phone && c?.password) setPlatinumAccount({ phone: c.phone, password: c.password, name: c.name || 'Platinum Provider (Test)' });
      })
      .catch(() => {});
  }, []);

  // ตรวจสอบว่าเป็น development mode
  if (import.meta.env.PROD) {
    return null; // ซ่อนใน production build
  }

  // Platinum Provider — ใช้จาก config ถ้าโหลดได้ ไม่ก็ใช้ค่า default (จาก dev-test-accounts/config.json)
  const platinumDefault: TestAccount = { phone: '0899999999', password: 'platinum1', name: 'Platinum Provider (Test)' };
  const platinum = platinumAccount ?? platinumDefault;

  const testAccounts: TestAccount[] = [
    { phone: '0800000001', password: 'test1234', name: 'Anna (Employer)' },
    { phone: '0800000002', password: 'test1234', name: 'Bob (Provider)' },
    { phone: '0812345678', password: 'test1234', name: 'Test User' },
    platinum,
  ];

  return (
    <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={18} className="text-yellow-600" />
        <h4 className="font-bold text-yellow-800 text-sm">🛠️ DEV MODE - Quick Login</h4>
      </div>
      <p className="text-xs text-yellow-700 mb-3">
        ⚠️ This shortcut will be removed before App Store submission
      </p>
      <div className="grid grid-cols-1 gap-2">
        {testAccounts.map((acc) => (
          <button
            key={acc.phone}
            onClick={() => onQuickLogin(acc.phone, acc.password)}
            className="px-3 py-2 bg-yellow-200 hover:bg-yellow-300 text-yellow-900 rounded-lg text-xs font-medium transition text-left"
          >
            <span className="font-bold">{acc.name}</span>
            <br />
            <span className="text-yellow-700">{acc.phone}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Verification function - แสดงเมื่อ dev หรือบังคับด้วย VITE_FORCE_DEV_SHORTCUT=1
export const isDevShortcutEnabled = (): boolean => {
  if (import.meta.env.VITE_FORCE_DEV_SHORTCUT === '1') return true;
  return !import.meta.env.PROD && import.meta.env.DEV;
};
