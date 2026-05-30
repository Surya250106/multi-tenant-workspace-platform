import { io as ClientIO, Socket } from 'socket.io-client';
import { server } from '../../src/index';
import { generateAccessToken } from '../../src/middleware/auth';
import { AddressInfo } from 'net';

describe('WebSocket Collaboration Integration Tests', () => {
  let port: number = 0;
  let validToken: string = '';
  let clientSocket: Socket | null = null;
  let otherClientSocket: Socket | null = null;

  beforeAll(async () => {
    // Resolve port number of running Jest server
    const address = server.address() as AddressInfo;
    port = address.port;

    validToken = generateAccessToken({ sub: 'ws-test-user-id', email: 'ws-test@example.com' });

    // Populate database for socket checks
    const { prisma } = await import('../../src/prisma/client');

    // Clean up
    await prisma.board.deleteMany({ where: { id: 'board-uuid-123' } });
    await prisma.workspaceMember.deleteMany({ where: { user_id: { in: ['ws-test-user-id', 'other-user-id'] } } });
    await prisma.user.deleteMany({ where: { id: { in: ['ws-test-user-id', 'other-user-id'] } } });
    await prisma.workspace.deleteMany({ where: { slug: 'ws-test-workspace' } });

    // Create
    await prisma.user.create({
      data: { id: 'ws-test-user-id', email: 'ws-test@example.com', username: 'wstestuser', password_hash: 'hash' }
    });
    await prisma.user.create({
      data: { id: 'other-user-id', email: 'other@example.com', username: 'otheruser', password_hash: 'hash' }
    });

    const ws = await prisma.workspace.create({
      data: { name: 'WS Test Workspace', slug: 'ws-test-workspace' }
    });

    await prisma.workspaceMember.createMany({
      data: [
        { workspace_id: ws.id, user_id: 'ws-test-user-id', role: 'member' },
        { workspace_id: ws.id, user_id: 'other-user-id', role: 'member' }
      ]
    });

    const project = await prisma.project.create({
      data: { workspace_id: ws.id, name: 'WS Test Project' }
    });

    await prisma.board.create({
      data: { id: 'board-uuid-123', project_id: project.id, name: 'To Do' }
    });
  });

  afterAll(async () => {
    const { prisma } = await import('../../src/prisma/client');
    await prisma.board.deleteMany({ where: { id: 'board-uuid-123' } });
    await prisma.workspaceMember.deleteMany({ where: { user_id: { in: ['ws-test-user-id', 'other-user-id'] } } });
    await prisma.user.deleteMany({ where: { id: { in: ['ws-test-user-id', 'other-user-id'] } } });
    await prisma.workspace.deleteMany({ where: { slug: 'ws-test-workspace' } });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  afterEach((done) => {
    if (clientSocket) {
      clientSocket.close();
    }
    if (otherClientSocket) {
      otherClientSocket.close();
    }
    clientSocket = null;
    otherClientSocket = null;
    done();
  });

  it('should drop connections after 5 seconds if authentication is not completed', (done) => {
    // Set up a shorter timeout/test for connection drop
    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      // Do NOT send 'auth' event.
      // Wait for server connection drop.
      clientSocket!.on('disconnect', (reason) => {
        // Disconnected due to handshake auth timeout
        expect(reason).toBeDefined();
        done();
      });
    });
  }, 10000); // 10s Jest test timeout to cover the 5s auth grace period

  it('should successfully authenticate when sending a valid JWT token', (done) => {
    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      clientSocket!.emit('auth', { token: validToken });
      
      clientSocket!.on('auth_success', (data) => {
        expect(data).toHaveProperty('userId', 'ws-test-user-id');
        expect(data).toHaveProperty('email', 'ws-test@example.com');
        done();
      });
    });
  });

  it('should reject authentication and disconnect when sending an invalid JWT token', (done) => {
    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      clientSocket!.emit('auth', { token: 'invalid-access-token-key' });
      
      clientSocket!.on('auth_error', (data) => {
        expect(data).toHaveProperty('message');
        
        clientSocket!.on('disconnect', () => {
          done();
        });
      });
    });
  });

  it('should respond to client heartbeat pings with a pong server event', (done) => {
    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      clientSocket!.emit('auth', { token: validToken });
      
      clientSocket!.on('auth_success', () => {
        clientSocket!.emit('heartbeat');
        
        clientSocket!.on('pong', () => {
          done();
        });
      });
    });
  });

  it('should synchronize client board presence and broadcast user_joined cues', (done) => {
    const boardId = 'board-uuid-123';
    const otherToken = generateAccessToken({ sub: 'other-user-id', email: 'other@example.com' });

    // Client 1 connects and joins board room
    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      clientSocket!.emit('auth', { token: validToken });
      
      clientSocket!.on('auth_success', () => {
        clientSocket!.emit('join_board', { boardId });

        clientSocket!.on('joined', () => {
          
          // Client 2 connects and joins same room
          otherClientSocket = ClientIO(`http://localhost:${port}`, {
            path: '/socket',
            transports: ['websocket'],
            forceNew: true
          });

          otherClientSocket.on('connect', () => {
            otherClientSocket!.emit('auth', { token: otherToken });
            
            otherClientSocket!.on('auth_success', () => {
              otherClientSocket!.emit('join_board', { boardId });
            });
          });

          // Client 1 should receive presence event: user_joined
          clientSocket!.on('user_joined', (user) => {
            expect(user).toHaveProperty('userId', 'other-user-id');
            expect(user).toHaveProperty('email', 'other@example.com');
            done();
          });
        });
      });
    });
  });

  it('should synchronize client collaborative editing awareness events', (done) => {
    const boardId = 'board-uuid-123';
    const taskId = 'task-uuid-999';
    const otherToken = generateAccessToken({ sub: 'other-user-id', email: 'other@example.com' });

    clientSocket = ClientIO(`http://localhost:${port}`, {
      path: '/socket',
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      clientSocket!.emit('auth', { token: validToken });
      
      clientSocket!.on('auth_success', () => {
        clientSocket!.emit('join_board', { boardId });

        clientSocket!.on('joined', () => {
          
          otherClientSocket = ClientIO(`http://localhost:${port}`, {
            path: '/socket',
            transports: ['websocket'],
            forceNew: true
          });

          otherClientSocket.on('connect', () => {
            otherClientSocket!.emit('auth', { token: otherToken });
            
            otherClientSocket!.on('auth_success', () => {
              otherClientSocket!.emit('join_board', { boardId });
              
              otherClientSocket!.on('joined', () => {
                // Client 2 starts editing a task
                otherClientSocket!.emit('task_edit_start', { taskId, boardId });
              });
            });
          });

          // Client 1 should receive cooperative editing event: task_editing_started
          clientSocket!.on('task_editing_started', (data) => {
            expect(data).toHaveProperty('taskId', taskId);
            expect(data).toHaveProperty('userId', 'other-user-id');
            done();
          });
        });
      });
    });
  });
});
