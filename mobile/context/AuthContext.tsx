import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { UserProfile } from "../types";
import { MockApi, clearBankAccountsStorage } from "../services/mockApi";
import { registerMobileFcmPush } from "../services/fcmRegistration";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  refreshUser: (hintPhone?: string) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Operation No-Mock: ล้างเฉพาะ token แบบเก่า (Firebase fallback) ไม่ลบ mock_ จาก OTP flow
    const storedToken = localStorage.getItem("meerak_token");
    if (storedToken && (storedToken.startsWith("mock-jwt-token-") || storedToken.startsWith("mock-jwt-"))) {
      localStorage.removeItem("meerak_token");
      localStorage.removeItem("meerak_user_id");
      setLoading(false);
      return;
    }

    // Check local storage for persistent session (Real JWT from Backend only)
    const storedUserId = localStorage.getItem("meerak_user_id");

    if (storedToken && storedUserId) {
      MockApi.getProfile(storedUserId)
        .then((profile) => {
          setUser(profile);
          setToken(storedToken);
          void registerMobileFcmPush(storedUserId);
        })
        .catch((e) => {
          console.error("Session restore failed", e);
          localStorage.removeItem("meerak_token");
          localStorage.removeItem("meerak_user_id");
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (newUser: UserProfile, newToken: string) => {
    if (!newToken) return;
    // ปฏิเสธเฉพาะ token แบบเก่า (Firebase fallback). รับ OTP flow (mock_ จาก jwtService.browser) และ JWT จริง (eyJ)
    if (newToken.startsWith("mock-jwt-token-") || newToken.startsWith("mock-jwt-")) {
      console.error("Rejected legacy mock token: use Backend login for API/VIP.");
      return;
    }
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem("meerak_token", newToken);
    localStorage.setItem("meerak_user_id", newUser.id);
    void registerMobileFcmPush(newUser.id);
  };
  // กำหนด role ตามข้อมูลผู้ใช้

  const logout = async () => {
    const userId = localStorage.getItem("meerak_user_id");
    clearBankAccountsStorage(userId || undefined);
    setUser(null);
    setToken(null);
    localStorage.removeItem("meerak_token");
    localStorage.removeItem("meerak_user_id");
    // Clean Slate: clear theme so next user doesn't see previous VIP theme
    document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.removeItem("aqond_data_theme");
    } catch (_) {}
  };

  const refreshUser = useCallback(async (hintPhone?: string) => {
    const storedUserId = localStorage.getItem("meerak_user_id");
    if (!storedUserId) return;
    try {
      const opts = hintPhone ? { phone: hintPhone, refresh: true } : { refresh: true };
      const profile = await MockApi.getProfile(storedUserId, opts);
      setUser(profile);
    } catch (e) {
      console.error("Refresh user failed", e);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, refreshUser, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};