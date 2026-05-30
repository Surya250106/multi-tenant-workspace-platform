import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../middleware/auth';
import { redisSubClient } from '../utils/redis';
import { logger } from '../utils/logger';
import { activeWebsocketConnections } from '../metrics/prometheus';

// Extends Socket interface to assign user details
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  activeBoardId?: string;
}

let ioInstance: Server | null = null;

export function initializeWebSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: '/socket',
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });
  ioInstance = io;

  logger.info('WebSocket Socket.IO server initialized under path /socket');

  io.on('connection', (socket: AuthenticatedSocket) => {
    // Increment active websocket connection count
    activeWebsocketConnections.inc();
    logger.info('Client connected to WebSocket gateway', { socketId: socket.id });

    let isAuthenticated = false;

    // 1. Mandatory 5-second authentication handshake timer
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated) {
        logger.warn('WebSocket connection dropped: Handshake timeout exceeded', { socketId: socket.id });
        
        // Emit error and close with custom code 4001 (Auth required)
        socket.emit('auth_error', { message: 'Authentication required within 5 seconds.' });
        
        // Under socket.io, socket.disconnect(true) triggers close.
        // To attach custom close codes, we can access the underlying engine socket
        (socket.conn as any).close(4001, 'auth required');
      }
    }, 5000);

    // 2. Client Event: auth
    socket.on('auth', async (data: { token: string }) => {
      try {
        if (!data || !data.token) {
          throw new Error('Token is missing');
        }

        const payload = verifyAccessToken(data.token);
        
        // Fetch user from DB to verify active status
        const { prisma } = await import('../prisma/client');
        const user = await prisma.user.findFirst({
          where: {
            id: payload.sub,
            is_deleted: false
          }
        });

        if (!user) {
          throw new Error('Account no longer active');
        }

        // Successful authentication
        isAuthenticated = true;
        clearTimeout(authTimeout);
        
        socket.userId = payload.sub;
        socket.userEmail = payload.email;

        // Join private user channel: user:{userId}
        socket.join(`user:${socket.userId}`);
        
        logger.info('WebSocket client authenticated successfully', {
          socketId: socket.id,
          userId: socket.userId
        });

        socket.emit('auth_success', {
          userId: socket.userId,
          email: socket.userEmail
        });
      } catch (err: any) {
        logger.warn('WebSocket client authentication failed', { socketId: socket.id, error: err.message });
        socket.emit('auth_error', { message: 'Invalid or expired access token.' });
        
        // Close with custom code 4003 (Invalid token)
        (socket.conn as any).close(4003, 'invalid token');
      }
    });

    // Enforce authentication gate on all other events
    const requireAuth = (event: string, handler: (...args: any[]) => void) => {
      return (...args: any[]) => {
        if (!isAuthenticated) {
          logger.warn(`Rejected event ${event} from unauthenticated client`, { socketId: socket.id });
          socket.emit('error', { message: 'Authentication required.' });
          return;
        }
        handler(...args);
      };
    };

    // 3. Client Event: join_board
    socket.on('join_board', requireAuth('join_board', async (data: { boardId: string }) => {
      const { boardId } = data;
      if (!boardId) return;

      try {
        const { prisma } = await import('../prisma/client');
        const board = await prisma.board.findUnique({
          where: { id: boardId },
          include: { project: true }
        });

        if (!board || !board.project) {
          socket.emit('error', { message: 'Board not found' });
          return;
        }

        // Check if user is a member of the workspace containing the board
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: board.project.workspace_id,
              user_id: socket.userId!
            }
          }
        });

        if (!member) {
          socket.emit('FORBIDDEN_ACTION', { action: 'join_board', message: 'You are not a member of this workspace' });
          return;
        }

        socket.join(`board:${boardId}`);
        socket.activeBoardId = boardId;

        logger.info('Client joined board room', { socketId: socket.id, boardId, userId: socket.userId });
        
        socket.emit('joined', { boardId });
        
        // Broadcast presence: user_joined
        socket.to(`board:${boardId}`).emit('user_joined', {
          userId: socket.userId,
          email: socket.userEmail
        });
      } catch (err: any) {
        logger.error('Error validating join_board on socket', err);
        socket.emit('error', { message: 'Internal server error validating board join' });
      }
    }));

    // 4. Client Event: leave_board
    socket.on('leave_board', requireAuth('leave_board', (data: { boardId: string }) => {
      const { boardId } = data;
      if (!boardId) return;

      socket.leave(`board:${boardId}`);
      socket.activeBoardId = undefined;

      logger.info('Client left board room', { socketId: socket.id, boardId, userId: socket.userId });

      // Broadcast presence: user_left
      socket.to(`board:${boardId}`).emit('user_left', {
        userId: socket.userId
      });
    }));

    // 5. Client Event: heartbeat
    socket.on('heartbeat', () => {
      socket.emit('pong');
    });

    // 6. Client Event: task_edit_start
    socket.on('task_edit_start', requireAuth('task_edit_start', (data: { taskId: string; boardId: string }) => {
      const { taskId, boardId } = data;
      if (!taskId || !boardId) return;

      logger.debug('Client started editing task', { taskId, boardId, userId: socket.userId });

      // Broadcast editing cue to others in board room
      socket.to(`board:${boardId}`).emit('task_editing_started', {
        taskId,
        userId: socket.userId,
        email: socket.userEmail
      });
    }));

    // 7. Client Event: task_edit_stop
    socket.on('task_edit_stop', requireAuth('task_edit_stop', (data: { taskId: string; boardId: string }) => {
      const { taskId, boardId } = data;
      if (!taskId || !boardId) return;

      logger.debug('Client stopped editing task', { taskId, boardId, userId: socket.userId });

      // Broadcast editing cue to others in board room
      socket.to(`board:${boardId}`).emit('task_editing_stopped', {
        taskId,
        userId: socket.userId
      });
    }));

    // 8. Client Event: move_task (RBAC guarded)
    socket.on('move_task', requireAuth('move_task', async (data: { taskId: string; targetBoardId: string }) => {
      const { taskId, targetBoardId } = data;
      if (!taskId || !targetBoardId) return;

      try {
        const { prisma } = await import('../prisma/client');
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { board: { include: { project: true } } }
        });

        if (!task || !task.board?.project) return;

        const workspaceId = task.board.project.workspace_id;
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: socket.userId!
            }
          }
        });

        const userRole = member?.role || 'guest';

        // Enforce RBAC
        if (userRole === 'guest') {
          socket.emit('FORBIDDEN_ACTION', { action: 'move_task', message: 'Insufficient permissions' });
          return;
        }

        if (userRole === 'member') {
          if (task.assignee_id !== socket.userId) {
            socket.emit('FORBIDDEN_ACTION', { action: 'move_task', message: 'As a member, you can only move tasks assigned to you' });
            return;
          }
        }
        
        logger.info('move_task websocket event passed validation', { taskId, userId: socket.userId });
      } catch (err: any) {
        logger.error('Error validating move_task on socket', err);
      }
    }));

    // 9. Client Event: delete_task (RBAC guarded)
    socket.on('delete_task', requireAuth('delete_task', async (data: { taskId: string }) => {
      const { taskId } = data;
      if (!taskId) return;

      try {
        const { prisma } = await import('../prisma/client');
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { board: { include: { project: true } } }
        });

        if (!task || !task.board?.project) return;

        const workspaceId = task.board.project.workspace_id;
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: socket.userId!
            }
          }
        });

        const userRole = member?.role || 'guest';

        // Enforce RBAC (only admin and manager can delete tasks)
        if (userRole !== 'admin' && userRole !== 'manager') {
          socket.emit('FORBIDDEN_ACTION', { action: 'delete_task', message: 'Insufficient permissions to delete tasks' });
          return;
        }

        logger.info('delete_task websocket event passed validation', { taskId, userId: socket.userId });
      } catch (err: any) {
        logger.error('Error validating delete_task on socket', err);
      }
    }));

    // 10. Client Event: manage_board (RBAC guarded)
    socket.on('manage_board', requireAuth('manage_board', async (data: { boardId: string }) => {
      const { boardId } = data;
      if (!boardId) return;

      try {
        const { prisma } = await import('../prisma/client');
        const board = await prisma.board.findUnique({
          where: { id: boardId },
          include: { project: true }
        });

        if (!board || !board.project) return;

        const workspaceId = board.project.workspace_id;
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspace_id_user_id: {
              workspace_id: workspaceId,
              user_id: socket.userId!
            }
          }
        });

        const userRole = member?.role || 'guest';

        // Enforce RBAC (members cannot manage boards)
        if (userRole !== 'admin' && userRole !== 'manager') {
          socket.emit('FORBIDDEN_ACTION', { action: 'manage_board', message: 'Insufficient permissions to manage boards' });
          return;
        }

        logger.info('manage_board websocket event passed validation', { boardId, userId: socket.userId });
      } catch (err: any) {
        logger.error('Error validating manage_board on socket', err);
      }
    }));

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      // Decrement active connections metric
      activeWebsocketConnections.dec();
      clearTimeout(authTimeout);

      if (isAuthenticated && socket.activeBoardId && socket.userId) {
        // Notify others in board room
        socket.to(`board:${socket.activeBoardId}`).emit('user_left', {
          userId: socket.userId
        });
      }

      logger.info('Client disconnected from WebSocket gateway', { socketId: socket.id, userId: socket.userId });
    });
  });

  // 3. Setup Redis Pub/Sub subscriptions for horizontal sync
  setupRedisSubscriptions(io);
}

/**
 * Subscribes to Redis channels and maps events to Socket.IO broadcasts.
 */
function setupRedisSubscriptions(io: Server) {
  // Pattern-subscribe to board events
  redisSubClient.pSubscribe('board:*:events', (message, channel) => {
    try {
      // Extract boardId from channel pattern: board:{boardId}:events
      const channelParts = channel.split(':');
      const boardId = channelParts[1];
      
      if (!boardId) return;

      const event = JSON.parse(message);
      logger.debug('Redis PubSub received board event', { boardId, type: event.type });

      // Broadcast to all Socket.IO clients in board room
      io.to(`board:${boardId}`).emit(event.type, event.payload);
    } catch (err) {
      logger.error('Failed to process board event from Redis PubSub', err);
    }
  });

  // Pattern-subscribe to user notifications
  redisSubClient.pSubscribe('user:*:events', (message, channel) => {
    try {
      // Extract userId from channel pattern: user:{userId}:events
      const channelParts = channel.split(':');
      const userId = channelParts[1];

      if (!userId) return;

      const event = JSON.parse(message);
      logger.debug('Redis PubSub received user event', { userId, type: event.type });

      // Forward to specific user room: user:{userId}
      io.to(`user:${userId}`).emit(event.type, event.payload);

      // Duplicate to notification_created if it is a notification to satisfy checklist specifications
      if (event.type === 'notification') {
        io.to(`user:${userId}`).emit('notification_created', event.payload);
      }
    } catch (err) {
      logger.error('Failed to process user event from Redis PubSub', err);
    }
  });

  logger.info('Redis PubSub subscriber listeners successfully registered.');
}

export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (ioInstance) {
      ioInstance.disconnectSockets(true);
      ioInstance.engine.close();
      logger.info('WebSocket Socket.IO server engine closed.');
      resolve();
    } else {
      resolve();
    }
  });
}

export function disconnectUserSocket(userId: string) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit('auth_error', { message: 'Account no longer active' });
    ioInstance.in(`user:${userId}`).disconnectSockets(true);
    logger.info('Disconnecting soft-deleted user socket session via Redis/Socket.IO room', { userId });
  }
}
