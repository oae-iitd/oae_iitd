import { useState, useCallback, createContext } from 'react';
import type { ReactNode } from 'react';
import authService from '../../services/auth/auth.service';
import type { AuthUser, LoginCredentials, LoginResponse } from '../../services/auth/auth.service';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read user from localStorage (e.g. after Settings updates profile). */
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

function readStoredUser(): AuthUser | null {
  const storedUser = authService.getUser();
  const token = authService.getToken();
  return storedUser && token ? storedUser : null;
}

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);

  const login = async (credentials: LoginCredentials) => {
    const response: LoginResponse = await authService.login(credentials);
    const next: AuthUser = {
      id: response.session.user_id.toString(),
      username: response.session.username,
      email: response.session.email,
      role: response.session.role,
    };
    setUser(next);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const refreshUser = useCallback(() => {
    setUser(readStoredUser());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading: false,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
