import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { 
  X, User, Calendar, AlertCircle, Info, Send, 
  Activity, MessageSquare, Save, CheckSquare, Trash2
} from 'lucide-react';
import { useToast } from './Toast';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Card, CardBody } from './ui/Card';
import { useAuthStore } from '../store/authStore';

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
  created_at?: string;
  updated_at?: string;
}

interface TaskDrawerProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  socket: any; // Socket.IO client instance
}

export const TaskDrawer: React.FC<TaskDrawerProps> = ({ task, isOpen, onClose, socket }) => {
  const { workspaceId = 'default' } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const currentUser = useAuthStore((state) => state.user);

  // Fetch workspaces list to resolve roles
  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces').then((r) => r.data.data.workspaces)
  });

  const activeWorkspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
  const userRole = activeWorkspace?.role || 'member';

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => api.delete(`/comments/${commentId}`),
    onSuccess: () => {
      toast.success('Comment deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['comments', task.id] });
      queryClient.invalidateQueries({ queryKey: ['activity', task.id] });
    },
    onError: () => {
      toast.error('Failed to delete comment');
    }
  });
  
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [commentContent, setCommentContent] = useState('');
  
  const autosaveTimeoutRef = useRef<any>(null);

  // Sync state if task props change
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
  }, [task]);

  // Emit presence indicators to WebSocket room
  useEffect(() => {
    if (isOpen && socket && socket.connected) {
      socket.emit('task_edit_start', { taskId: task.id, boardId: task.board_id });
    }

    return () => {
      if (socket && socket.connected) {
        socket.emit('task_edit_stop', { taskId: task.id, boardId: task.board_id });
      }
    };
  }, [isOpen, socket, task.id, task.board_id]);

  // Fetch workspace members to populate Assignee selector dropdown
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`).then((r) => r.data?.data?.members ?? []),
    enabled: isOpen && !!workspaceId
  });

  // Central Autosave Mutation for task edits
  const autosaveMutation = useMutation({
    mutationFn: (updatedFields: { 
      title?: string; 
      description?: string | null;
      priority?: 'low' | 'medium' | 'high';
      assigneeId?: string | null;
      dueDate?: string | null;
      status?: 'todo' | 'in_progress' | 'in_review' | 'done';
    }) => api.patch(`/tasks/${task.id}`, updatedFields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity', task.id] });
    },
    onError: () => {
      toast.error('Failed to save changes');
    }
  });

  const handleDescChange = (val: string) => {
    setDescription(val);
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveMutation.mutate({ description: val });
    }, 1000);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      if (val.trim()) {
        autosaveMutation.mutate({ title: val });
      }
    }, 1000);
  };

  // Comments Fetching & Submission
  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ['comments', task.id],
    queryFn: () => api.get(`/tasks/${task.id}/comments`).then((r) => r.data?.data?.comments ?? []),
    enabled: isOpen
  });

  const commentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/tasks/${task.id}/comments`, { content }),
    onSuccess: () => {
      setCommentContent('');
      toast.success('Comment added!');
      queryClient.invalidateQueries({ queryKey: ['comments', task.id] });
      queryClient.invalidateQueries({ queryKey: ['activity', task.id] });
    }
  });

  const submitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;
    commentMutation.mutate(commentContent);
  };

  // Chronological Activity Logs Fetching
  const { data: activities = [] } = useQuery<any[]>({
    queryKey: ['activity', task.id],
    queryFn: () => api.get(`/tasks/${task.id}/activity`).then((r) => r.data?.data?.activity ?? []),
    enabled: isOpen
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex justify-end animate-overlay">
      {/* Click outside backdrop overlay */}
      <div className="absolute inset-0 z-0" onClick={onClose}></div>

      {/* Slide-over Panel Content */}
      <div className="w-full max-w-2xl bg-white border-l border-slate-200 h-full relative z-10 shadow-2xl flex flex-col animate-slide-in-right select-none">
        
        {/* Header Controls */}
        <div className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-slate-50/50 select-none">
          <div className="flex items-center space-x-2">
            <Badge variant="info">
              Task Details
            </Badge>
            <span className="text-[10px] text-slate-400 font-mono select-all">
              {task.id}
            </span>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-450 hover:text-slate-700 hover:bg-slate-100"
            title="Close Drawer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content Body Layout */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          
          {/* Editable title input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-700 tracking-wide uppercase select-none">Title</label>
            <input
              type="text"
              value={title}
              disabled={userRole === 'member' && task.assignee_id !== currentUser?.id}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          {/* Metadata Parameters section */}
          <Card className="border border-slate-200 bg-slate-50/50 shadow-sm">
            <CardBody className="p-4 space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-2.5 border-b border-slate-200 select-none">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                Task Metadata
              </h4>

              <div className="grid grid-cols-2 gap-4 text-xs">
                {/* Assignee Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase select-none">
                    <User className="w-3 h-3 text-slate-455" />
                    Assignee
                  </label>
                  
                  <select
                    value={task.assignee_id || ''}
                    disabled={userRole === 'member'}
                    onChange={(e) => autosaveMutation.mutate({ assigneeId: e.target.value || null })}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.user.id}>
                        {m.user.username}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase select-none">
                    <CheckSquare className="w-3 h-3 text-slate-455" />
                    Column Status
                  </label>
                  
                  <select
                    value={task.status || 'todo'}
                    disabled={userRole === 'member' && task.assignee_id !== currentUser?.id}
                    onChange={(e) => autosaveMutation.mutate({ status: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                {/* Priority Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase select-none">
                    <AlertCircle className="w-3 h-3 text-slate-455" />
                    Priority
                  </label>
                  
                  <select
                    value={task.priority || 'low'}
                    disabled={userRole === 'member' && task.assignee_id !== currentUser?.id}
                    onChange={(e) => autosaveMutation.mutate({ priority: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                {/* Due Date Picker */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1 uppercase select-none">
                    <Calendar className="w-3 h-3 text-slate-455" />
                    Due Date
                  </label>
                  
                  <input
                    type="date"
                    value={task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''}
                    disabled={userRole === 'member' && task.assignee_id !== currentUser?.id}
                    onChange={(e) => autosaveMutation.mutate({ dueDate: e.target.value || null })}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1 text-xs text-slate-700 outline-none cursor-pointer hover:bg-slate-50 transition disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              
              <div className="pt-2.5 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between font-medium select-none">
                <span>Created By: {task.creator?.username}</span>
                {task.created_at && (
                  <span>{new Date(task.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Description area */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center select-none">
              <label className="text-[10px] font-semibold text-slate-700 tracking-wide uppercase">Detailed Description</label>
              {autosaveMutation.isPending && (
                <span className="text-[9px] text-blue-600 font-semibold uppercase flex items-center gap-1 animate-pulse">
                  <Save className="w-3 h-3" />
                  Autosaving...
                </span>
              )}
            </div>
            
            <textarea
              rows={4}
              value={description}
              disabled={userRole === 'member' && task.assignee_id !== currentUser?.id}
              onChange={(e) => handleDescChange(e.target.value)}
              placeholder="Log requirements and outlines. Edits save dynamically..."
              className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-3 py-2 text-slate-800 leading-relaxed outline-none resize-none transition disabled:opacity-75 disabled:cursor-not-allowed"
            />
          </div>

          {/* Grid for Comments Feed and Activity Logs side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-200">
            
            {/* Discussions Thread */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 select-none">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                Comments & Mentions
              </h4>

              <form onSubmit={submitComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Comment or @username..."
                  className="flex-1 text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-md px-2.5 py-1.5 transition outline-none text-slate-900"
                />
                
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="px-3"
                  isLoading={commentMutation.isPending}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </form>

              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2 select-none">No comments posted.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-md space-y-1 text-xs shadow-sm">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold select-none">
                        <span className="text-slate-650">{c.user?.username || c.user?.email}</span>
                        <div className="flex items-center gap-1.5">
                          <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          
                          {(userRole === 'admin' || (userRole === 'member' && c.user_id === currentUser?.id)) && (
                            <button
                              onClick={() => deleteCommentMutation.mutate(c.id)}
                              disabled={deleteCommentMutation.isPending}
                              className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                              title="Delete Comment"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-700 text-[10px] leading-relaxed">{c.content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Audit Logs vertical timeline */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 select-none">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                Activity Timeline
              </h4>

              <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                {activities.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic py-2 select-none">No changes logged.</p>
                ) : (
                  activities.map((act) => (
                    <div key={act.id} className="flex gap-2.5 text-[10px]">
                      <div className="flex flex-col items-center select-none">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shadow-sm"></div>
                        <div className="w-[1px] flex-1 bg-slate-200 my-1"></div>
                      </div>
                      <div className="flex-1 space-y-0.5 pb-2 text-left">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wide select-none">
                          <span>{act.action}</span>
                          <span>{new Date(act.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-slate-600 leading-normal">{act.details}</p>
                        <p className="text-[9px] text-slate-400 italic select-none">By {act.user?.username || 'System'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDrawer;
