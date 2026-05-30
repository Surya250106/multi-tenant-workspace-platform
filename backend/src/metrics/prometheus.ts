import { Counter, Gauge, Histogram } from 'prom-client';

// 1. http_requests_total
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status']
});

// 2. http_request_duration_seconds
export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 10]
});

// 3. active_websocket_connections
export const activeWebsocketConnections = new Gauge({
  name: 'active_websocket_connections',
  help: 'Number of currently active WebSocket connections'
});

// 4. tasks_created_total
export const tasksCreatedTotal = new Counter({
  name: 'tasks_created_total',
  help: 'Total number of tasks created'
});

// 5. tasks_completed_total
export const tasksCompletedTotal = new Counter({
  name: 'tasks_completed_total',
  help: 'Total number of tasks completed'
});

// 6. db_query_duration_seconds
export const dbQueryDurationSeconds = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query execution duration in seconds',
  labelNames: ['model', 'operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 2.0]
});

// 7. notifications_sent_total
export const notificationsSentTotal = new Counter({
  name: 'notifications_sent_total',
  help: 'Total number of notifications sent'
});

// 8. redis_memory_used_bytes
export const redisMemoryUsedBytes = new Gauge({
  name: 'redis_memory_used_bytes',
  help: 'Redis cache memory consumption in bytes'
});
