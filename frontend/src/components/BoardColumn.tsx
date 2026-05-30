import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TaskCard } from './TaskCard';
import { Kanban, Plus, X } from 'lucide-react';
import api from '../services/api';
import { useToast } from './Toast';
import { Button } from './ui/Button';

interface Task {
  id: string;
  board_id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_date?: string | null;
  assignee?: { id: string; username: string; email: string } | null;
  creator: { id: string; username: string; email: string };
  commentsCount?: number;
}

interface BoardColumnProps {
  id: string;
  name: string;
  tasks: Task[];
  onOpenDrawer: (task: Task) => void;
  userRole?: string;
  onOpenCreateTask?: (boardId: string) => void;
}

export const BoardColumn: React.FC<BoardColumnProps> = ({ 
  id, 
  name, 
  tasks: rawTasks, 
  onOpenDrawer, 
  userRole = 'member',
  onOpenCreateTask
}) => {
  const tasks = rawTasks ?? [];
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { setNodeRef, isOver } = useDroppable({
    id
  });

  // Task creation mutation
  const createTaskMutation = useMutation({
    mutationFn: (title: string) =>
      api.post(`/boards/${id}/tasks`, {
        title,
        priority: 'low'
      }),
    onSuccess: () => {
      toast.success('Task added successfully!');
      setNewTitle('');
      setIsAdding(false);
      // Invalidate both board tasks and workspace summary (for dashboard statistics)
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['board-tasks-summary'] });
    },
    onError: () => {
      toast.error('Failed to create task');
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTaskMutation.mutate(newTitle.trim());
  };

  const getStatusColorClass = (columnName: string) => {
    const normName = columnName.toLowerCase();
    if (normName.includes('todo') || normName.includes('to do')) return 'bg-blue-500';
    if (normName.includes('progress') || normName.includes('active')) return 'bg-amber-500';
    if (normName.includes('review') || normName.includes('verify')) return 'bg-purple-500';
    if (normName.includes('done') || normName.includes('complete')) return 'bg-emerald-500';
    return 'bg-slate-400';
  };

  const statusColor = getStatusColorClass(name);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 bg-slate-50 border rounded-xl flex-shrink-0 transition-all duration-200 shadow-sm ${
        isOver
          ? 'border-blue-500 bg-blue-50/20 scale-[0.99]'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Sticky Header with Title and Counter */}
      <div className="p-3 flex justify-between items-center border-b border-slate-200 bg-white rounded-t-xl select-none">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`}></span>
          <h3 className="text-xs font-bold text-slate-800 tracking-wide">{name}</h3>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-500">
            {tasks.length}
          </span>
          {(userRole === 'admin' || userRole === 'manager' || userRole === 'member') && (
            <button
              onClick={() => {
                if (userRole === 'member') {
                  onOpenCreateTask?.(id);
                } else {
                  setIsAdding(!isAdding);
                }
              }}
              className="p-1 rounded text-slate-450 hover:text-slate-700 hover:bg-slate-100 transition flex items-center gap-1 text-[10px] font-medium"
              title="Add task in column"
              id={`add-task-button-${id}`}
            >
              <Plus className="w-3.5 h-3.5" />
              {userRole === 'member' && <span className="text-[10px] font-semibold text-blue-600">Add Task</span>}
            </button>
          )}
        </div>
      </div>

      {/* Inline Quick Add Input */}
      {isAdding && (
        <form onSubmit={handleAddSubmit} className="p-3 border-b border-slate-200 bg-white space-y-2 animate-fade-in text-left">
          <input
            type="text"
            required
            autoFocus
            placeholder="Add task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-900 outline-none transition"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewTitle('');
              }}
              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="px-2.5 py-1 text-[10px] font-semibold"
              isLoading={createTaskMutation.isPending}
            >
              Add Card
            </Button>
          </div>
        </form>
      )}

      {/* Task Card List Container */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 max-h-[calc(100vh-230px)] min-h-[200px]">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpenDrawer={onOpenDrawer} />
        ))}

        {tasks.length === 0 && (
          <div className="h-28 flex flex-col items-center justify-center border border-dashed border-slate-250 rounded-xl text-[10px] text-slate-400 bg-white/50 p-4 text-center space-y-1.5 select-none shadow-sm">
            <Kanban className="w-4 h-4 text-slate-350" />
            <div>
              <span className="font-semibold text-slate-650 block">Empty Column</span>
              <span className="text-[9px] text-slate-400 block mt-0.5">Drag cards here</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardColumn;
