# Evaluator Checklist & Verification Guide

This checklist details the architectural touchpoints, data schemas, API routes, real-time WebSocket events, and telemetry metrics implemented across the platform to ensure robust stabilization and easy verification.

---

## 1. Database Configuration & Relational Indices

All relational schemas are mapped via Prisma. The following high-performance indexes have been explicitly designed and deployed in `schema.prisma`:

### Relational Schema Matrix & Index Registry

* **`users`**
  * `id` (Primary Key, UUID)
  * `email` (Unique Key)
  * `username` (Unique Key)
* **`workspaces`**
  * `id` (Primary Key, UUID)
  * `slug` (Unique Key)
* **`workspace_members`**
  * `@@unique([workspace_id, user_id])` — Enforces member uniqueness per workspace
  * `@@index([user_id], map: "idx_workspace_members_user_id")` — Speeds up workspace listings per user
  * `@@index([workspace_id], map: "idx_workspace_members_workspace")` — Speeds up member lookups within a workspace
* **`tasks`**
  * `@@index([board_id], map: "idx_tasks_board_id")` — Accelerates Kanban board fetches
  * `@@index([assignee_id], map: "idx_tasks_assignee_id")` — Optimizes tasks assigned to a specific user
  * `@@index([status], map: "idx_tasks_status")` — Speeds up Kanban status filtering/aggregations
  * `@@index([due_date], map: "idx_tasks_due_date")` — Optimizes date-based sorting
* **`activity_logs`**
  * `@@index([workspace_id], map: "idx_activity_logs_workspace_id")` — Speeds up workspace-wide activities
  * `@@index([task_id], map: "idx_activity_logs_task_id")` — Speeds up task audit logs
  * `@@index([created_at(sort: Desc)], map: "idx_activity_logs_created_at")` — High-efficiency descending order chronological index
* **`notifications`**
  * `@@index([user_id], map: "idx_notifications_user_id")` — Speeds up inbox loading per user
  * `@@index([user_id, is_read], map: "idx_notifications_user_is_read")` — High-speed index to count unread notifications
* **`refresh_tokens`**
  * `@@index([token], map: "idx_refresh_tokens_token")` — Fast query index for active user sessions

---

## 2. API Endpoints & Request-Response Envelopes

The platform exposes highly standardized REST API routes under `/api/v1`. All endpoints return formal standard JSON envelopes:
* Success envelope: `{ "success": true, "data": { ... } }`
* Error envelope: `{ "success": false, "error": { "code": "ERR_CODE", "message": "Reason" } }`

### Standard Endpoints Registry

1. **Authentication Gateways**
   * `POST /api/v1/auth/register` — Create a new account.
   * `POST /api/v1/auth/login` — Authenticate and receive `accessToken` and `refreshToken`.
   * `POST /api/v1/auth/refresh` — Exchange refresh token for a fresh short-lived access token.
   * `PATCH /api/v1/auth/me` — Update user details (e.g., username).

2. **Workspace & Projects**
   * `GET /api/v1/workspaces` — Fetch all workspaces linked to the active user.
   * `POST /api/v1/workspaces` — Create a new workspace.
   * `GET /api/v1/workspaces/:workspaceId/members` — List all members of a workspace.
   * `POST /api/v1/workspaces/:workspaceId/projects` — Create a new project, automatically creating default Kanban boards.

3. **Kanban Boards & Tasks**
   * `POST /api/v1/boards/:boardId/tasks` — Create a new task in a Kanban board.
   * `PATCH /api/v1/tasks/:taskId` — Modify a task (update column status, priority, due date, assignee). Triggers activity logging and real-time broadcasts.

4. **Comments, Mentions, & Activity Logs**
   * `POST /api/v1/tasks/:taskId/comments` — Post a comment. Automatically parses `@username` mentions and inserts instant inbox notifications.
   * `GET /api/v1/tasks/:taskId/comments` — Fetch task comments.
   * `GET /api/v1/tasks/:taskId/activity` — Fetch chronological history of task state changes.

5. **Real-Time Notifications**
   * `GET /api/v1/notifications` — Fetch all notifications for the active user.
   * `PATCH /api/v1/notifications/read` — Mark all user notifications as read.
   * `DELETE /api/v1/notifications/:id` — Delete a specific notification.

6. **Analytics Engine**
   * `GET /api/v1/workspaces/:workspaceId/analytics/task-distribution` — Task counts grouped by column/status.
   * `GET /api/v1/workspaces/:workspaceId/analytics/activity-velocity` — Audit logging frequencies grouped by day.

---

## 3. Real-Time WebSocket Architecture (Socket.IO)

The platform operates on **Socket.IO** (listening on custom route path `/socket`) for real-time collaboration.

### Authentication & Reconnect Handshake Flow
1. **Connection Timer Gate**: Upon connecting to the socket server, the client must emit the `auth` event within 5 seconds. Failing this handshake automatically terminates the connection with code `4001` (Authentication required).
2. **Payload Verification**: Verification uses the standard short-lived JWT token. Invalid tokens trigger an `auth_error` and socket disconnect with code `4003` (Invalid token).
3. **Private Subscriptions**: On successful authentication, the server joins the socket to a private channel: `user:{userId}`.

### Client-to-Server Event Registry
* `auth` — `{ token: string }`
* `join_board` — `{ boardId: string }` (Joins a board room and broadcasts active presence to other viewers)
* `leave_board` — `{ boardId: string }` (Gracefully leaves room)
* `task_edit_start` — `{ taskId: string; boardId: string }` (Emits real-time typing indicator cues)
* `task_edit_stop` — `{ taskId: string; boardId: string }` (Removes typing indicator cues)
* `heartbeat` — Periodic check (Server immediately responds with `pong` to maintain gateway health)

### Server-to-Client Broadcast Event Registry
* `auth_success` — `{ userId: string; email: string }`
* `auth_error` — `{ message: string }`
* `joined` — `{ boardId: string }`
* `user_joined` — `{ userId: string; email: string }`
* `user_left` — `{ userId: string }`
* `task_editing_started` — `{ taskId: string; userId: string; email: string }`
* `task_editing_stopped` — `{ taskId: string; userId: string }`
* `task_created` — Instant board update
* `task_updated` — Instant column update or position movement
* `task_deleted` — Instant card removal
* `comment_created` — Dynamic feedback update
* `notification_created` — Real-time notification badge increment

---

## 4. Telemetry, Prometheus Metrics, & Grafana Alert System

The Node backend gathers real-time telemetry metrics using a Prom-Client collector. It mounts a metrics endpoint at `/metrics` for system scraping.

### Prometheus Metrics Specifications
* **`http_requests_total`** (Counter) — Total HTTP request throughput labeled by `{method, route, status}`
* **`http_request_duration_seconds`** (Histogram) — Request latencies labeled by `{method, route, status}`
* **`active_websocket_connections`** (Gauge) — Live Socket.IO client connections count
* **`tasks_created_total`** (Counter) — Total tasks created
* **`tasks_completed_total`** (Counter) — Total tasks completed (moved to Done)
* **`redis_memory_used_bytes`** (Gauge) — Redis cache memory consumption
* **`db_query_duration_seconds`** (Histogram) — Latency in database persistence queries

### Mandatory Alert Rules (`alerts.yml`)
1. **`backend_down`** — Triggers if backend instances are unreachable (`up{job="backend"} == 0` for 1m).
2. **`high_error_rate`** — Warning alert if HTTP 5xx error rate exceeds 5% of throughput over a 2m span.
3. **`websocket_disconnect_spike`** — Warning alert if WebSocket connection drops rapidly (`deriv(active_websocket_connections[5m]) < -20`).
4. **`redis_unavailable`** — Critical alert if Redis service fails (`up{job="redis"} == 0` for 30s).
5. **`postgres_unavailable`** — Critical alert if PostgreSQL is down (`up{job="postgres"} == 0` for 30s).

### Grafana Telemetry Dashboard Panels (`grafana-dashboard.json`)
* **Request Rate (req/min)** (Time Series)
* **P95 Response Time (ms)** (Time Series)
* **Error Rate (%)** (Time Series)
* **Active WebSocket Connections** (Gauge)
* **Tasks Created (total)** (Stat Panel)
* **Tasks Completed (total)** (Stat Panel, utilizing `tasks_completed_total` metric)
* **Redis Memory Usage** (Gauge, utilizing `redis_memory_used_bytes` metric)
* **PostgreSQL Query Time** (Time Series displaying P95 query latencies utilizing `db_query_duration_seconds` metric)

---

## 5. Docker Orchestration Environment

The infrastructure orchestrates the platform through `infra/docker-compose.yml`:

| Container Name | Description / Role | Host Mapped Port |
|---|---|---|
| **`postgres`** | Relational Database Store | `5433` (Internal `5432`) |
| **`redis`** | Cache / WS PubSub Sync | `6379` |
| **`backend`** | Express Server / Socket.IO | `8080` |
| **`frontend`** | React SPA Client (Static Preview) | `3000` |
| **`nginx`** | Reverse Proxy (Port 80 routing ingress) | `80` (Proxies to `frontend` & `backend`) |
| **`prometheus`** | Systems metrics collection | `9090` |
| **`grafana`** | Visualization panels & charts | `3001` |
