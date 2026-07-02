'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthState } from './bff';
import { recordCartMergeTelemetry } from '@/lib/experience/scenarioTelemetry';
import { mergeGuestCartOnLogin } from '@/lib/shopCart';
import {
  clearStoredAuth,
  loginWithPhone,
  readStoredAuth,
  registerAccount,
  type MeerakUser,
  type RegisterInput,
} from './meerakAuth';
import { loginWithOtp, V2_AUTH_ENABLED } from './v2Auth';

type AuthCtx = {
  auth: AuthState | null;
  user: MeerakUser | null;
  login: (phone: string, password: string) => Promise<void>;
  loginOtp: (phone: string, code: string) => Promise<void>;
  loginWithLine: (session: { token: string; user: MeerakUser; sessionId: string }) => void;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  syncFromStorage: () => void;
  v2AuthEnabled: boolean;
};

const Ctx = createContext<AuthCtx>({
  auth: null,
  user: null,
  login: async () => {},
  loginOtp: async () => {},
  loginWithLine: () => {},
  register: async () => {},
  logout: () => {},
  syncFromStorage: () => {},
  v2AuthEnabled: true,
});

function toAuthState(stored: { token: string; userId: string; sessionId: string }): AuthState {
  return { token: stored.token, userId: stored.userId, sessionId: stored.sessionId };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [user, setUser] = useState<MeerakUser | null>(null);

  useEffect(() => {
    const stored = readStoredAuth();
    if (stored) setAuth(toAuthState(stored));
  }, []);

  const syncFromStorage = () => {
    const stored = readStoredAuth();
    if (stored) setAuth(toAuthState(stored));
  };

  const applySession = async (payload: { token: string; user: MeerakUser; sessionId?: string }) => {
    const sessionId = payload.sessionId || payload.user.id;
    const state = toAuthState({ token: payload.token, userId: payload.user.id, sessionId });
    setAuth(state);
    setUser(payload.user);
    const t0 = performance.now();
    const merged = await mergeGuestCartOnLogin(payload.user.id);
    if (merged) {
      recordCartMergeTelemetry({
        loadMs: Math.round(performance.now() - t0),
        cartCount: merged.cart.count,
        mergedLines: merged.mergedLines,
      });
    }
  };

  const login = async (phone: string, password: string) => {
    const res = await loginWithPhone(phone, password);
    await applySession({ ...res, sessionId: res.user.id });
  };

  const loginOtp = async (phone: string, code: string) => {
    const res = await loginWithOtp(phone, code);
    await applySession(res);
  };

  const loginWithLine = (session: { token: string; user: MeerakUser; sessionId: string }) => {
    void applySession(session);
  };

  const register = async (input: RegisterInput) => {
    const res = await registerAccount(input, {
      idempotencyKey: `web-${input.phone}-${input.firebase_uid}`.slice(0, 160),
      attempt: 1,
    });
    await applySession({ ...res, sessionId: res.user.id });
  };

  const logout = () => {
    clearStoredAuth();
    setAuth(null);
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{
        auth,
        user,
        login,
        loginOtp,
        loginWithLine,
        register,
        logout,
        syncFromStorage,
        v2AuthEnabled: V2_AUTH_ENABLED,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
