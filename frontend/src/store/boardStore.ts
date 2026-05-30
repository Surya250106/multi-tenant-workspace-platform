import { create } from 'zustand';

interface Task {
  id: string;
  board_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
  assignee_id?: string | null;
  assignee?: { id: string; username: string; email: string } | null;
  creator: { id: string; username: string; email: string };
  commentsCount?: number;
}

interface BoardStoreState {
  tasks: Record<string, Task[]>; // maps boardId -> Task list
  editingUsers: Record<string, string>; // maps taskId -> email currently editing
  
  setTasksForBoard: (boardId: string, tasksList: Task[]) => void;
  setAllTasks: (allTasks: Record<string, Task[]>) => void;
  setEditingUser: (taskId: string, email: string) => void;
  clearEditingUser: (taskId: string) => void;
  
  // Optimistic Move with rollback capability
  moveTaskOptimistically: (
    taskId: string,
    sourceBoardId: string,
    targetBoardId: string,
    apiUpdateFn: () => Promise<any>
  ) => Promise<void>;
}

export const useBoardStore = create<BoardStoreState>((set, get) => ({
  tasks: {},
  editingUsers: {},

  setTasksForBoard: (boardId, tasksList) =>
    set((state) => ({
      tasks: { ...state.tasks, [boardId]: tasksList }
    })),

  setAllTasks: (allTasks) =>
    set((state) => ({
      tasks: { ...state.tasks, ...allTasks }
    })),

  setEditingUser: (taskId, email) =>
    set((state) => ({
      editingUsers: { ...state.editingUsers, [taskId]: email }
    })),

  clearEditingUser: (taskId) =>
    set((state) => {
      const updated = { ...state.editingUsers };
      delete updated[taskId];
      return { editingUsers: updated };
    }),

  moveTaskOptimistically: async (taskId, sourceBoardId, targetBoardId, apiUpdateFn) => {
    const originalState = { ...get().tasks };
    
    const sourceTasks = originalState[sourceBoardId] || [];
    const targetTasks = originalState[targetBoardId] || [];
    
    const taskToMove = sourceTasks.find((t) => t.id === taskId);
    if (!taskToMove) return;

    // 1. Apply Optimistic Update
    const updatedSource = sourceTasks.filter((t) => t.id !== taskId);
    const updatedTarget = [...targetTasks, { ...taskToMove, board_id: targetBoardId }];

    set((state) => ({
      tasks: {
        ...state.tasks,
        [sourceBoardId]: updatedSource,
        [targetBoardId]: updatedTarget
      }
    }));

    try {
      // 2. Perform background API persistence
      await apiUpdateFn();
    } catch (err) {
      console.warn('Optimistic drag failed. Reverting changes...', err);
      // 3. Rollback on failure!
      set({ tasks: originalState });
      throw err;
    }
  }
}));
