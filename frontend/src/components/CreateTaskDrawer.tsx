import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { 
  X, User, Calendar, AlertCircle, Info
} from 'lucide-react';
import { useToast } from './Toast';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Card, CardBody } from './ui/Card';
import { useAuthStore } from '../store/authStore';

interface CreateTaskDrawerProps {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

export const CreateTaskDrawer: React.FC<CreateTaskDrawerProps> = ({ 
  boardId, 
  isOpen, 
  onClose, 
  userRole 
}) => {
  const { workspaceId = 'default' } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const currentUser = useAuthStore((state) => state.user);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('low');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');

  // Reset form states when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setPriority('low');
      setDueDate('');
      
      // Assignee defaults to current user if member, otherwise unassigned
      if (userRole === 'member' && currentUser) {
        setAssigneeId(currentUser.id);
      } else {
        setAssigneeId('');
      }
    }
  }, [isOpen, userRole, currentUser]);

  // Fetch workspace members to populate Assignee dropdown (if Admin/Manager)
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`).then((r) => r.data?.data?.members ?? []),
    enabled: isOpen && !!workspaceId
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority: 'low' | 'medium' | 'high';
      assigneeId?: string | null;
      dueDate?: string | null;
    }) => api.post(`/boards/${boardId}/tasks`, data),
    onSuccess: () => {
      toast.success('Task created successfully!');
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['board-tasks-summary'] });
      onClose();
    },
    onError: () => {
      toast.error('Failed to create task');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Task title is required');
      return;
    }

    createTaskMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assigneeId: assigneeId || null,
      dueDate: dueDate || null
    });
  };

  // Keyboard Shortcuts (Escape to close drawer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex justify-end animate-overlay">
      <div className="absolute inset-0 z-0" onClick={onClose}></div>

      <form 
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white border-l border-slate-200 h-full relative z-10 shadow-2xl flex flex-col animate-slide-in-right select-none"
      >
        {/* Header */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <Badge variant="info">
              Create New Task
            </Badge>
          </div>
          
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-450 hover:text-slate-700 hover:bg-slate-100"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-700 tracking-wide uppercase">Title *</label>
            <input
              type="text"
              required
              placeholder="Enter task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition"
              id="create-task-title-input"
            />
          </div>

          {/* Metadata Card */}
          <Card className="border border-slate-200 bg-slate-50/50 shadow-sm">
            <CardBody className="p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-2.5 border-b border-slate-200">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                Task Configuration
              </h4>

              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Assignee Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase">
                    <User className="w-3 h-3 text-slate-455" />
                    Assignee
                  </label>
                  
                  <select
                    value={assigneeId}
                    disabled={userRole === 'member'}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition disabled:opacity-75 disabled:cursor-not-allowed"
                    id="create-task-assignee-select"
                  >
                    {userRole === 'member' ? (
                      currentUser && (
                        <option value={currentUser.id}>
                          {currentUser.username || currentUser.email} (You)
                        </option>
                      )
                    ) : (
                      <>
                        <option value="">Unassigned</option>
                        {members.map((m: any) => (
                          <option key={m.id} value={m.user.id}>
                            {m.user.username || m.user.email}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {/* Priority Selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase">
                    <AlertCircle className="w-3 h-3 text-slate-455" />
                    Priority
                  </label>
                  
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition"
                    id="create-task-priority-select"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                {/* Due Date Picker */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase">
                    <Calendar className="w-3 h-3 text-slate-455" />
                    Due Date
                  </label>
                  
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition"
                    id="create-task-duedate-input"
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-700 tracking-wide uppercase">Detailed Description</label>
            <textarea
              placeholder="Provide a description of the task..."
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-2 text-xs text-slate-800 outline-none transition resize-none leading-relaxed"
              id="create-task-description-textarea"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-16 border-t border-slate-200 px-6 flex items-center justify-end gap-3 bg-slate-50/50">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={createTaskMutation.isPending}
            id="create-task-submit-button"
          >
            Create Task
          </Button>
        </div>
      </form>
    </div>
  );
};
