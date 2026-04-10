import httpClient from '../api/http';
import { API_ENDPOINTS } from '../api/endpoints';

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  session: {
    user_id: number;
    username: string;
    email: string;
    role: string;
  };
  access_token?: string;
  request_id: string;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  name?: string;
  phone?: string;
  profilePicture?: string;
}

export interface VerifyResponse {
  session: {
    user_id: number;
    username: string;
    email: string;
    role: string;
  };
  /** Present when /api/me returns full user row */
  user?: Record<string, unknown>;
  request_id?: string;
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await httpClient.post<LoginResponse>(
      API_ENDPOINTS.AUTH.LOGIN,
      {
        identifier: credentials.identifier,
        password: credentials.password,
      }
    );

    const user: AuthUser = {
      id: response.data.session.user_id.toString(),
      username: response.data.session.username,
      email: response.data.session.email,
      role: response.data.session.role,
    };
    localStorage.setItem('user', JSON.stringify(user));
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
    }

    return response.data;
  }

  async verify(): Promise<VerifyResponse> {
    const response = await httpClient.get<VerifyResponse>(API_ENDPOINTS.AUTH.ME);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await httpClient.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch {
      void 0;
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
  }

  getToken(): string | null {
    return (
      localStorage.getItem('access_token') ||
      (localStorage.getItem('user') ? 'session' : null)
    );
  }

  getUser(): AuthUser | null {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      return JSON.parse(userStr) as AuthUser;
    } catch {
      return null;
    }
  }

  setAuth(token: string, user: AuthUser): void {
    if (token && token !== 'cookie-based' && token !== 'session') {
      localStorage.setItem('access_token', token);
    }
    localStorage.setItem('user', JSON.stringify(user));
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('user');
  }
}

export const authService = new AuthService();
export default authService;
