import { api } from './api';
import { AuthResponse, User } from '../types/auth';

export class AuthService {
  static async register(credentials: { email: string; username: string; password: string }): Promise<AuthResponse> {
    const res = await api.post('/auth/register', credentials);
    return res.data.data;
  }

  static async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    const res = await api.post('/auth/login', credentials);
    return res.data.data;
  }

  static async logout(refreshToken: string | null): Promise<void> {
    await api.post('/auth/logout', { refreshToken });
  }

  static async getMe(): Promise<{ user: User }> {
    const res = await api.get('/auth/me');
    return res.data.data;
  }

  static async patchMe(profile: { username?: string; email?: string }): Promise<{ user: User }> {
    const res = await api.patch('/auth/me', profile);
    return res.data.data;
  }
}
