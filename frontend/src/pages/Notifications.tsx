import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '../components/DashboardLayout';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Bell, Trash2, Check, Clock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { Card, CardBody } from '../components/ui/Card';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export const Notifications: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  // 1. Fetch user notifications
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data.data.notifications)
  });

  // 2. Mark all as read mutation
  const readAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
    onError: () => {
      toast.error('Failed to update notifications');
    }
  });

  // 3. Delete notification mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Notification removed');
    },
    onError: () => {
      toast.error('Failed to delete notification');
    }
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in text-left max-w-4xl mx-auto pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6 select-none">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 mb-1 flex items-center gap-2.5">
              <Bell className="text-blue-600 w-6 h-6" />
              Workspace Notifications
            </h2>
            <p className="text-slate-500 text-xs">
              Review personal workspace alerts, comments, mentions, and collaborative milestones.
            </p>
          </div>

          {unreadCount > 0 && (
            <Button
              onClick={() => readAllMutation.mutate()}
              disabled={readAllMutation.isPending}
              variant="outline"
              size="sm"
              leftIcon={<Check className="w-4 h-4" />}
              className="font-semibold bg-white hover:bg-slate-50 border-slate-200 text-slate-700 self-start sm:self-auto"
            >
              Mark All as Read
            </Button>
          )}
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Clock className="w-8 h-8 animate-spin-custom text-blue-600" />
            <span className="text-xs font-semibold uppercase tracking-wider select-none">Synchronizing alerts...</span>
          </div>
        ) : notifications.length === 0 ? (
          /* Empty State */
          <EmptyState
            icon="Bell"
            title="Inbox is Empty"
            description="You are completely caught up! Collaboration alerts, activity updates, and mentions will appear here in real-time."
            className="my-8"
          />
        ) : (
          /* Notifications list */
          <div className="space-y-4">
            {notifications.map((n) => (
              <Card
                key={n.id}
                className={`transition duration-150 border ${
                  n.is_read
                    ? 'border-slate-200 bg-white/70 shadow-sm'
                    : 'border-blue-200 bg-blue-50/[0.05] shadow-sm'
                }`}
              >
                <CardBody className="p-5 flex items-start justify-between gap-6">
                  <div className="flex items-start gap-4">
                    {/* Indicator Dot */}
                    <div className="pt-1.5 select-none">
                      <span
                        className={`block w-2 h-2 rounded-full ${
                          n.is_read ? 'bg-slate-300' : 'bg-blue-600 shadow-sm'
                        }`}
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-800">{n.title}</h4>
                        {!n.is_read && <Badge variant="info">New</Badge>}
                      </div>
                      
                      <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{n.message}</p>
                      
                      <span className="text-[10px] text-slate-400 block pt-1 font-semibold select-none">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => deleteMutation.mutate(n.id)}
                    disabled={deleteMutation.isPending}
                    variant="ghost"
                    size="sm"
                    className="p-1.5 rounded-full text-slate-400 hover:text-red-650 hover:bg-red-50"
                    title="Delete Notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
