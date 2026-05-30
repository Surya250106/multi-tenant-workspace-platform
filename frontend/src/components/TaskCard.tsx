import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Calendar, GripVertical, Trash2, Check, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useBoardStore } from '../store/boardStore';
import { useToast } from './Toast';
import api from '../services/api';
import { Badge } from './ui/Badge';
import { Avatar } from './ui/Avatar';

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

interface TaskCardProps {
  task: Task;
  onOpenDrawer: (task: Task) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onOpenDrawer }) => {
  if (!task || !task.id) return null;

  const user = useAuthStore((state) => state.user);
  const editingUser = useBoardStore((state) => state.editingUsers[task.id]);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  // Fetch workspaces to verify user's role
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces),
    enabled: !!user
  });

  const activeWorkspace = workspaces[0]; // Fallback check
  const userRole = activeWorkspace?.role || 'member';

  const canDrag = userRole === 'admin' || userRole === 'manager' || task.assignee_id === user?.id;
  const canDelete = userRole === 'admin' || userRole === 'manager';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !canDrag
  });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 50 : 1
  };

  // Title update mutation
  const updateTitleMutation = useMutation({
    mutationFn: (newTitle: string) =>
      api.patch(`/tasks/${task.id}`, { title: newTitle }),
    onSuccess: () => {
      toast.success('Task title updated!');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    },
    onError: () => {
      toast.error('Failed to update title');
    }
  });

  // Task delete mutation
  const deleteTaskMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${task.id}`),
    onSuccess: () => {
      toast.success('Task card deleted');
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-all-tasks'] });
    },
    onError: () => {
      toast.error('Failed to delete task');
    }
  });

  const handleTitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editTitle.trim() && editTitle.trim() !== task.title) {
      updateTitleMutation.mutate(editTitle.trim());
    } else {
      setIsEditing(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this task permanent?')) {
      deleteTaskMutation.mutate();
    }
  };

  const priorityConfig: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
    high: 'danger',
    medium: 'warning',
    low: 'success'
  };

  const pVariant = priorityConfig[task.priority?.toLowerCase()] || 'neutral';

  // Try to load custom local avatar base64
  const localAvatar = task.assignee?.id ? localStorage.getItem(`avatar_${task.assignee.id}`) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-350 hover:shadow-md transition duration-150 relative group select-none shadow-sm ${
        isDragging ? 'shadow-lg border-blue-400 scale-[1.01]' : ''
      }`}
    >
      {/* Drawer Open Trigger Overlay (excluding options line at bottom and editing state) */}
      {!isEditing && (
        <div 
          className="absolute inset-0 z-0 cursor-pointer" 
          onClick={() => onOpenDrawer(task)}
        ></div>
      )}

      <div className="relative z-10 space-y-3 text-left">
        {/* Card Header: Priority indicator */}
        <div className="flex justify-between items-center">
          <Badge variant={pVariant}>
            {task.priority || 'Low'}
          </Badge>

          {editingUser && (
            <div className="flex items-center space-x-1 bg-blue-50 border border-blue-100 text-blue-600 text-[9px] px-1.5 py-0.5 rounded-full animate-pulse font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>Typing: {editingUser.split('@')[0]}</span>
            </div>
          )}
        </div>

        {/* Task Title / Inline Editor */}
        {isEditing ? (
          <form onSubmit={handleTitleSubmit} className="flex items-center gap-1.5 z-20 relative">
            <input
              type="text"
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-2 py-1 text-xs text-slate-900 outline-none flex-1 transition"
            />
            <button type="submit" className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="p-1 rounded bg-slate-100 text-slate-500 hover:bg-slate-250 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <h4
            data-testid="task-title"
            onDoubleClick={() => {
              if (canDrag) {
                setIsEditing(true);
                setEditTitle(task.title);
              }
            }}
            className="text-xs font-semibold text-slate-800 leading-relaxed cursor-text hover:text-slate-950 transition"
            title={canDrag ? "Double-click to edit title" : undefined}
          >
            {task.title}
          </h4>
        )}

        {/* Footer options */}
        <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 relative z-10 select-none">
          <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-medium">
            {task.due_date && (
              <span className="flex items-center gap-1 text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200" title="Due Date">
                <Calendar className="w-3 h-3 text-slate-400" />
                {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
            
            <span data-testid="comment-count" className="flex items-center gap-1 hover:text-slate-650 transition" title="Comments">
              <MessageSquare className="w-3 h-3 text-slate-400" />
              {task.commentsCount || 0}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Quick delete button */}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-650 opacity-0 group-hover:opacity-100 transition"
                title="Delete task card"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}

            {/* Assignee Avatar */}
            <Avatar 
              username={task.assignee?.username || undefined}
              imageUrl={localAvatar || undefined}
              size="xs"
              className={task.assignee?.username ? '' : 'opacity-30'}
            />

            {/* DnD vertical grip */}
            {canDrag && (
              <div
                {...attributes}
                {...listeners}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 cursor-grab active:cursor-grabbing transition"
                title="Drag task to sort or move columns"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
