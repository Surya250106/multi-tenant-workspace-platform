import { describe, it, expect, beforeEach } from 'vitest';
import { useBoardStore } from '../store/boardStore';

describe('Optimistic Drag-and-Drop & Rollback Tests', () => {
  const mockTask = {
    id: 'task-123',
    board_id: 'col-todo',
    title: 'Autosave optimization',
    status: 'todo',
    priority: 'high',
    creator: { id: 'usr-1', username: 'alice', email: 'alice@example.com' }
  };

  beforeEach(() => {
    // Setup initial Zustand boards
    useBoardStore.setState({
      tasks: {
        'col-todo': [mockTask],
        'col-progress': []
      }
    });
  });

  it('should immediately relocate cards optimistically (Optimistic Update check)', async () => {
    const apiCallMock = async () => {
      // Simulate successful background update
      return { success: true };
    };

    // Trigger move
    await useBoardStore.getState().moveTaskOptimistically(
      'task-123',
      'col-todo',
      'col-progress',
      apiCallMock
    );

    const state = useBoardStore.getState().tasks;
    expect(state['col-todo']).toHaveLength(0);
    expect(state['col-progress']).toHaveLength(1);
    expect(state['col-progress'][0].id).toBe('task-123');
  });

  it('should automatically revert cards back to original columns on API failure (Rollback check)', async () => {
    const apiCallFailureMock = async () => {
      // Simulate connection dropout or RBAC failure
      throw new Error('Forbidden action or connection down');
    };

    // Trigger move expecting rollback throw
    await expect(
      useBoardStore.getState().moveTaskOptimistically(
        'task-123',
        'col-todo',
        'col-progress',
        apiCallFailureMock
      )
    ).rejects.toThrow('Forbidden action or connection down');

    // Confirm cards reverted back to original column
    const state = useBoardStore.getState().tasks;
    expect(state['col-todo']).toHaveLength(1);
    expect(state['col-todo'][0].id).toBe('task-123');
    expect(state['col-progress']).toHaveLength(0);
  });
});
