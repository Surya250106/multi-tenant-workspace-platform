# Technology Stack & Architecture Specification

This document details the production-ready engineering decisions, library versions, database schema indices, and horizontal real-time communications framework of the Collaborative Task Management & Analytics Platform.

---

## 🗺️ High-Level System Topology

The platform operates as a secure, containerized multi-tier microservice architecture. Client requests ingress through Nginx, which routes them dynamically to either static assets (React) or the stateful REST/WebSocket server (Express).

```
                 [ Client Browser ]
                         │
                 ( Port 80 Ingress )
                         ▼
             ┌─────────────────────────┐
             │   Nginx Ingress Proxy   │
             └───────────┬─────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌────────────────┐             ┌───────────────────┐
│  React Client  │             │  Express Backend  │
│  (Port 3000)   │             │   (Port 8080)     │
└────────────────┘             └──────┬───┬───┬────┘
                                      │   │   │
        ┌─────────────────────────────┘   │   └──────────────────────────────┐
        ▼                                 ▼                                  ▼
┌──────────────┐                 ┌─────────────────┐               ┌───────────────────┐
│  PostgreSQL  │                 │   Redis Cache   │               │ Prometheus Scraper│
│ (Port 5433)  │                 │   (Port 6379)   │               │    (Port 9090)    │
└──────────────┘                 └─────────────────┘               └─────────┬─────────┘
                                                                             │
                                                                             ▼
                                                                   ┌───────────────────┐
                                                                   │ Grafana Dashboard │
                                                                   │    (Port 3001)    │
                                                                   └───────────────────┘
```

---

## ⚡ Core Technical Stack Matrix

| Service / Layer | Technology Selected | Rationale & Specifications |
| :--- | :--- | :--- |
| **Ingress Gate** | Nginx:alpine | Reverse proxy routing, unified CORS domain gateway, and socket polling upgrades. |
| **Web UI SPA** | React 18 + Vite | Modern high-velocity build pipelining, reactive UI state hydration. |
| **REST/WS Server**| Express.js + TS | TypeScript-strict compilation, structured log middleware context. |
| **Database ORM** | Prisma Client v5.14 | Auto-generated TS types, schema migration control, index registrations. |
| **Relational Store**| PostgreSQL 15 | High-reliability transaction safety, native composite constraint indices. |
| **Caching Engine** | Redis 7 | Sub-millisecond key-value storage, session locks, and rate limiters. |
| **Pub/Sub Broker** | Redis Pub/Sub | Cross-instance WebSocket state sync, distributed room presence. |
| **Telemetry Suite**| Prometheus + Grafana| prom-client scrapes, alert manager warning thresholds. |
| **DevOps Engine** | Docker Compose v2 | Sandbox execution, non-root system users (`node` / `postgres`). |

---

## 🐘 Data Registry & Schema Index Design

All schemas are declared inside [schema.prisma](file:///c:/New%20folder/backend/src/prisma/schema.prisma) and mapped to strict PostgreSQL types. We register high-performance composite primary keys and relational index bounds:

1. **`users`**
   - High-security password storage using **bcrypt (12 rounds)**.
   - Soft-delete enabled via `is_deleted` and `deleted_at` keys to block active auth.
2. **`workspace_members`**
   - Unique composite index: `@@unique([workspace_id, user_id])`.
   - Workspace-level index: `idx_workspace_members_workspace` for member retrieval.
   - User-level index: `idx_workspace_members_user_id` for listing user memberships.
3. **`tasks`**
   - Board index: `idx_tasks_board_id` to speed up Kanban boards loading.
   - Assignee index: `idx_tasks_assignee_id` for quick dashboard assignment lists.
   - Status index: `idx_tasks_status` to optimize status aggregations.
   - Due date index: `idx_tasks_due_date` for real-time task overdue alerts.
4. **`activity_logs`**
   - Strict append-only design. No `UPDATE` or `DELETE` API handlers are registered.
   - Descending order chronological index: `@@index([created_at(sort: Desc)], map: "idx_activity_logs_created_at")`.
5. **`notifications`**
   - Count unread index: `@@index([user_id, is_read], map: "idx_notifications_user_is_read")`.

---

## 📡 WebSockets & Collaborative Presence

The real-time layer runs on **Socket.IO** under `/socket` with a distributed memory broker:
- **Authentication Handshake**: Clients must authenticate via JWT using `auth` event within a **5-second window**, or receive disconnect code `4001` (Auth required).
- **WS Event Broadcasts**:
  - `join_board` / `leave_board`: Dynamic room joins to scope updates.
  - `task_edit_start` / `task_edit_stop`: Emits collaborative typing indicator locks.
  - `heartbeat`: Periodic check returning `pong` to verify persistent TCP socket streams.
- **Horizontal Scaling**: Uses Redis Pub/Sub backplane to synchronize socket rooms across multiple Node cluster instances seamlessly.

---

## 📊 Telemetry, Telemetry, and Diagnostics

System observability is established via `/metrics` exposing:
- **`http_requests_total`** (Counter)
- **`http_request_duration_seconds`** (Histogram)
- **`active_websocket_connections`** (Gauge)
- **`tasks_created_total`** & **`tasks_completed_total`** (Counter)
- **`db_query_duration_seconds`** (Histogram)
- **`notifications_sent_total`** (Counter)

Alerting thresholds (`alerts.yml`) are configured to trigger warning notifications if Nginx, Backend, Postgres, or Redis instances report unhealthy states.
