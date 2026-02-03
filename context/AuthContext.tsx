import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { UserProfile } from "../types";
import { MockApi } from "../services/mockApi";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for persistent session instead of Firebase Auth
    const storedToken = localStorage.getItem("meerak_token");
    const storedUserId = localStorage.getItem("meerak_user_id");

    if (storedToken && storedUserId) {
      MockApi.getProfile(storedUserId)
        .then((profile) => {
          setUser(profile);
          setToken(storedToken);
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
    setUser(newUser);
    setToken(newToken);
    // Persist to local storage
    localStorage.setItem("meerak_token", newToken);
    localStorage.setItem("meerak_user_id", newUser.id);
  };
  // กำหนด role ตามข้อมูลผู้ใช้

  const logout = async () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("meerak_token");
    localStorage.removeItem("meerak_user_id");
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, isAuthenticated: !!user }}
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