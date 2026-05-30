import { useEffect, useRef, useState, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useBoardStore } from '../store/boardStore';
import { useQueryClient } from '@tanstack/react-query';

const getWsUrl = () => {
  const envUrl = (import.meta as any).env.VITE_WS_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000') {
      return 'http://localhost:8080';
    }
    return `${window.location.protocol}//${window.location.host}`;
  }
  return 'http://localhost';
};

const VITE_WS_URL = getWsUrl();

export function useWebSocket(boardIdOrIds?: string | string[]) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  const queryClient = useQueryClient();
  const { setEditingUser, clearEditingUser } = useBoardStore();

  const boardIds = useMemo(() => {
    if (!boardIdOrIds) return [];
    return Array.isArray(boardIdOrIds) ? boardIdOrIds : [boardIdOrIds];
  }, [boardIdOrIds]);

  const boardIdsKey = boardIds.join(',');

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      return;
    }

    // 1. Establish Socket.IO connection
    const socket = io(VITE_WS_URL, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WS: Socket.IO connected. Sending authentication handshake...');
      setIsConnected(true);
      
      // Emit auth token within 5 seconds
      socket.emit('auth', { token: accessToken });
    });

    socket.on('auth_success', () => {
      console.log('WS: Authentication handshake cleared!');
      
      // Join board rooms if active
      boardIds.forEach((id) => {
        if (id) {
          socket.emit('join_board', { boardId: id });
        }
      });
    });

    // 2. Bind collaborative sync events
    socket.on('task_created', () => {
      // Invalidate React Query boards cache to reload list
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    });

    socket.on('task_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    });

    socket.on('task_moved', () => {
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    });

    socket.on('task_deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['board-tasks'] });
    });

    socket.on('comment_added', () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    });

    socket.on('comment_created', () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    });

    socket.on('comment_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    });

    socket.on('comment_deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
    });

    // 3. Presence & Editing cue events
    socket.on('task_editing_started', (data?: { taskId?: string; email?: string }) => {
      if (data?.taskId && data?.email) {
        setEditingUser(data.taskId, data.email);
      }
    });

    socket.on('task_editing_stopped', (data?: { taskId?: string }) => {
      if (data?.taskId) {
        clearEditingUser(data.taskId);
      }
    });

    const handleNotification = (data?: any) => {
      const notification = data?.notification || (data?.id && data?.title ? data : null);
      if (notification) {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        console.log('Real-Time Alert Received:', notification.title || 'New notification');
      }
    };

    socket.on('notification', handleNotification);
    socket.on('notification_created', handleNotification);

    socket.on('auth_error', (data) => {
      console.error('WS Authentication Error:', data.message);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Cleanup on unmount or boardId swap
    return () => {
      boardIds.forEach((id) => {
        if (id) {
          socket.emit('leave_board', { boardId: id });
        }
      });
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [boardIdsKey, accessToken, isAuthenticated, queryClient, setEditingUser, clearEditingUser]);

  return { socket: socketRef.current, isConnected };
}
