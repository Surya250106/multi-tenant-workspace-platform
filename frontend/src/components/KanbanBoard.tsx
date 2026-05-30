import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import api from '../services/api';
import { useBoardStore } from '../store/boardStore';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { BoardColumn } from './BoardColumn';
import { TaskDrawer } from './TaskDrawer';
import { CreateTaskDrawer } from './CreateTaskDrawer';
import { useToast } from './Toast';
import { Search, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Card, CardBody } from './ui/Card';
import { EmptyState } from './ui/EmptyState';

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

export const KanbanBoard: React.FC = () => {
  const { workspaceId = 'default', projectId, boardId } = useParams<{ workspaceId: string; projectId: string; boardId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);

  const { tasks, setAllTasks, moveTaskOptimistically } = useBoardStore();

  // Local Filter, Sort, and Pagination states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Debounce search query changes (300ms delay)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [priority, assigneeId, sortBy, sortOrder]);

  // Fetch Workspaces to verify RBAC
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces)
  });
  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
  const userRole = activeWorkspace?.role || 'member';

  // Fetch Board Columns & details
  const { data: boardsList = [], isLoading: isBoardsLoading } = useQuery({
    queryKey: ['project-boards', projectId],
    queryFn: () => api.get(`/projects/${projectId}/boards`).then((r) => r.data?.data?.boards ?? []),
    enabled: !!projectId
  });

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const selectedColumn = searchParams.get('column');

  const filteredBoards = useMemo(() => {
    if (!selectedColumn) return boardsList ?? [];
    return (boardsList ?? []).filter((board: any) => {
      const slugName = board.name.toLowerCase().replace(/[\s_]+/g, '-');
      const slugNameNoDashes = slugName.replace(/-/g, '');
      const paramLower = selectedColumn.toLowerCase();
      
      return (
        board.id === selectedColumn ||
        slugName === paramLower ||
        slugNameNoDashes === paramLower ||
        board.name.toLowerCase() === paramLower
      );
    });
  }, [boardsList, selectedColumn]);

  // Fetch Workspace Members to populate Assignee filter dropdown
  const { data: membersList = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`).then((r) => r.data?.data?.members ?? []),
    enabled: !!workspaceId
  });

  // Get all active board IDs for this project to join websocket rooms
  const allBoardIds = useMemo(() => {
    return (boardsList || []).map((b: any) => b?.id).filter(Boolean);
  }, [boardsList]);

  // Establish Real-Time WebSocket Connection
  const { socket, isConnected } = useWebSocket(allBoardIds);

  // Query tasks for ALL board columns in parallel
  const taskQueries = useQueries({
    queries: (boardsList || []).map((col: any) => ({
      queryKey: ['board-tasks', col.id, debouncedSearch, priority, assigneeId, sortBy, sortOrder, page],
      queryFn: () => {
        const params: any = {
          page,
          limit: 30, // Larger page size to show all tasks on board
          sortBy,
          sortOrder
        };
        if (debouncedSearch) params.q = debouncedSearch;
        if (priority) params.priority = priority;
        if (assigneeId) params.assigneeId = assigneeId;

        return api.get(`/boards/${col.id}/tasks`, { params }).then((r) => ({
          boardId: col.id,
          tasks: r.data?.data?.tasks ?? [],
          pagination: r.data?.data?.pagination ?? { total: 0, totalPages: 1 }
        }));
      },
      enabled: !!col.id
    }))
  });

  const isTasksLoading = taskQueries.some((q) => q.isLoading);
  const isTasksError = taskQueries.some((q) => q.isError);
  const showSkeletons = (isBoardsLoading || isTasksLoading) && !isTasksError;

  // Sync parallel query tasks cache with Zustand store
  useEffect(() => {
    if ((boardsList ?? []).length > 0) {
      const grouped: Record<string, Task[]> = {};
      
      // Init columns
      boardsList.forEach((b: any) => {
        if (b && b.id) {
          grouped[b.id] = [];
        }
      });

      // Populate grouped
      taskQueries.forEach((q) => {
        if (q.data) {
          const { boardId, tasks: colTasks } = q.data as any;
          if (grouped[boardId]) {
            grouped[boardId] = colTasks;
          }
        }
      });

      // Invalidate if local store doesn't match query data
      const currentStoreTasks = useBoardStore.getState().tasks;
      let hasChanges = false;
      Object.keys(grouped).forEach((colId) => {
        const currentColTasks = currentStoreTasks[colId] || [];
        if (JSON.stringify(currentColTasks) !== JSON.stringify(grouped[colId])) {
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setAllTasks(grouped);
      }
    }
  }, [taskQueries, boardsList, setAllTasks]);

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetBoardId = over.id as string;

    let sourceBoardId = '';
    Object.keys(tasks).forEach((colId) => {
      if ((tasks[colId] || []).some((t) => t.id === taskId)) {
        sourceBoardId = colId;
      }
    });

    if (!sourceBoardId || sourceBoardId === targetBoardId) return;

    // RBAC check: Members can only move their own tasks!
    const taskToMove = (tasks[sourceBoardId] || []).find((t) => t.id === taskId);
    if (userRole === 'member' && taskToMove?.assignee_id !== user?.id) {
      toast.error('As a Member, you can only drag tasks assigned to you.');
      return;
    }

    try {
      await moveTaskOptimistically(taskId, sourceBoardId, targetBoardId, () =>
        api.patch(`/tasks/${taskId}/move`, { boardId: targetBoardId })
      );
      toast.success('Task moved!');
      // Invalidate all board-tasks queries to sync up
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity', taskId] });
    } catch (err) {
      toast.error('Failed to move task. Reverting...');
    }
  };

  // Drawer Administration
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [createTaskBoardId, setCreateTaskBoardId] = useState<string>('');

  // Find selectedTask in the current tasks store to ensure it gets real-time updates!
  const currentSelectedTask = selectedTask
    ? Object.values(tasks)
        .flat()
        .find((t) => t?.id === selectedTask.id) || selectedTask
    : null;

  const openDrawer = (task: Task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setSelectedTask(null);
    setIsDrawerOpen(false);
  };

  // Keyboard Shortcuts (Escape to close drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="space-y-6 text-left relative z-15 select-none">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-800 leading-none">Board Tasks</h2>
            <Sparkles className="w-4 h-4 text-blue-500 animate-pulse" />
          </div>
          <p className="text-xs text-slate-500 mt-1 select-none">Collaborative kanban columns. Double-click card titles to inline-edit.</p>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="success">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
              Live Sync Active
            </Badge>
          ) : (
            <Badge variant="warning">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
              Reconnecting
            </Badge>
          )}
        </div>
      </div>

      {/* Filter and controls */}
      <Card className="shadow-sm border border-slate-200">
        <CardBody className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search box */}
            <div className="relative min-w-[200px] flex-1 sm:flex-none">
              <input
                type="text"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 border border-slate-200 focus:border-blue-500 rounded-md pl-8 pr-3 py-1.5 transition-colors outline-none"
              />
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            </div>

            {/* Filter priority */}
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-100/50 transition-colors"
            >
              <option value="">All Priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            {/* Filter Assignee */}
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-100/50 transition-colors"
            >
              <option value="">All Assignees</option>
              {membersList.map((m: any) => (
                <option key={m.id} value={m.user_id}>
                  {m.user?.username || m.user?.email}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting controls */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-100/50 transition-colors"
            >
              <option value="created_at">Date Created</option>
              <option value="title">Task Title</option>
              <option value="priority">Priority</option>
              <option value="due_date">Due Date</option>
            </select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-2.5 py-1.5 font-bold border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            >
              {sortOrder === 'asc' ? '▲' : '▼'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {selectedColumn && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50/50 border border-blue-150 rounded-lg p-3.5 animate-fade-in select-none">
          <span>Viewing only <strong>{filteredBoards[0]?.name || selectedColumn}</strong> column tasks.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/workspaces/${workspaceId}/projects/${projectId}/boards/${boardId || boardsList[0]?.id}`)}
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-100/20 p-1 font-semibold underline underline-offset-2 ml-auto"
          >
            View All Columns
          </Button>
        </div>
      )}

      {/* Sync Error */}
      {isTasksError && (
        <Card className="max-w-sm mx-auto border-red-200 bg-red-50/20 mt-8">
          <CardBody className="p-6 text-center space-y-3">
            <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
            <h4 className="text-xs font-bold text-slate-800">Database Out of Sync</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed">Failed to refresh board tasks. Verify connectivity and try again.</p>
          </CardBody>
        </Card>
      )}

      {/* Kanban Board Layout */}
      <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-thin">
        {showSkeletons ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col w-72 bg-slate-100 rounded-lg border border-slate-250 p-3 space-y-3 animate-pulse flex-shrink-0">
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
              <div className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="p-4 rounded-lg bg-white border border-slate-200 space-y-3">
                    <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (filteredBoards ?? []).length === 0 ? (
          <EmptyState
            icon="FolderKanban"
            title="No Columns Configured"
            description="This project does not have any board columns. Contact your workspace admin or manager to initialize boards."
            className="my-8"
          />
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {(filteredBoards ?? []).map((board: any) => (
              <BoardColumn
                key={board.id}
                id={board.id}
                name={board.name}
                tasks={tasks[board.id] ?? []}
                onOpenDrawer={openDrawer}
                userRole={userRole}
                onOpenCreateTask={(colId) => {
                  setCreateTaskBoardId(colId);
                  setIsCreateTaskOpen(true);
                }}
              />
            ))}
          </DndContext>
        )}
      </div>

      {/* Detail Slide-over Drawer */}
      {currentSelectedTask && (
        <TaskDrawer
          task={currentSelectedTask}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          socket={socket}
        />
      )}

      {/* Create Task Slide-over Drawer */}
      {isCreateTaskOpen && (
        <CreateTaskDrawer
          boardId={createTaskBoardId}
          isOpen={isCreateTaskOpen}
          onClose={() => {
            setIsCreateTaskOpen(false);
            setCreateTaskBoardId('');
          }}
          userRole={userRole}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
