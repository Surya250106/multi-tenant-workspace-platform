import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/authStore';

describe('Zundand Global Auth Store Tests', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test
    useAuthStore.getState().clearAuth();
  });

  it('should initialize with default empty/logged-out parameters', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should successfully update auth state on setAuth() call', () => {
    const mockUser = {
      id: 'usr-abc-123',
      username: 'tester',
      email: 'tester@example.com'
    };
    const accessToken = 'access-sig';
    const refreshToken = 'refresh-opaque';

    useAuthStore.getState().setAuth({
      user: mockUser,
      accessToken,
      refreshToken
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe(accessToken);
    expect(state.refreshToken).toBe(refreshToken);
    expect(state.user).toEqual(mockUser);
  });

  it('should successfully merge fields on updateUser() call', () => {
    const mockUser = {
      id: 'usr-abc-123',
      username: 'tester',
      email: 'tester@example.com'
    };
    useAuthStore.getState().setAuth({
      user: mockUser,
      accessToken: 'acc',
      refreshToken: 'ref'
    });

    useAuthStore.getState().updateUser({
      username: 'tester_modified'
    });

    const state = useAuthStore.getState();
    expect(state.user?.username).toBe('tester_modified');
    expect(state.user?.email).toBe('tester@example.com'); // unchanged
  });

  it('should purge all states back to default on clearAuth() call', () => {
    useAuthStore.getState().setAuth({
      user: { id: '1', username: 'a', email: 'e' },
      accessToken: 'a',
      refreshToken: 'r'
    });

    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });
});
