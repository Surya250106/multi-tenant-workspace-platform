export interface User {
  id: string;
  email: string;
  username: string;
  created_at?: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export type WorkspaceRole = 'admin' | 'manager' | 'member' | 'guest';
