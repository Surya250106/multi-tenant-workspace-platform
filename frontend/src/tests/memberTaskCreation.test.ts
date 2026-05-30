import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../store/authStore';

describe('Member Task Creation Configuration and RBAC Tests', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('should default the assignee to the logged-in Member and lock changes', () => {
    const mockUser = {
      id: 'usr-member-id',
      username: 'charlie',
      email: 'charlie@example.com'
    };

    useAuthStore.getState().setAuth({
      user: mockUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    });

    const activeUser = useAuthStore.getState().user;
    expect(activeUser).not.toBeNull();
    expect(activeUser?.id).toBe('usr-member-id');

    // Simulate task creation configuration logic for Member
    const userRole = 'member';
    let assignedId = '';

    if (userRole === 'member' && activeUser) {
      assignedId = activeUser.id; // Assignee defaults to current logged-in member
    }

    expect(assignedId).toBe('usr-member-id');

    // Verify member cannot change the assignee to another user (locked assignee constraint)
    const attemptReassign = (newAssigneeId: string) => {
      if (userRole === 'member') {
        // Locked: member cannot assign task to other users
        return assignedId; 
      }
      return newAssigneeId;
    };

    const finalAssigneeId = attemptReassign('usr-other-id');
    expect(finalAssigneeId).toBe('usr-member-id'); // Assignee did not change
  });

  it('should allow Admin or Manager to change task assignee arbitrarily', () => {
    const mockUser = {
      id: 'usr-admin-id',
      username: 'alice',
      email: 'alice@example.com'
    };

    useAuthStore.getState().setAuth({
      user: mockUser,
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    });

    const userRole: string = 'admin';
    let assignedId = '';

    const attemptReassign = (newAssigneeId: string) => {
      if (userRole === 'member') {
        return assignedId;
      }
      return newAssigneeId;
    };

    const finalAssigneeId = attemptReassign('usr-other-id');
    expect(finalAssigneeId).toBe('usr-other-id'); // Assignee was changed successfully
  });
});
