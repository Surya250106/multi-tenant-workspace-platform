# Real-Time Collaborative Task Management Platform

A production-ready multi-tenant collaborative workspace platform that enables teams to manage projects, boards, tasks, comments, notifications, analytics, and real-time collaboration.

Built using React, TypeScript, Express, PostgreSQL, Redis, Socket.IO, Docker, Prometheus, and Grafana.

---

# Features

## Authentication & Security

* JWT Authentication
* Refresh Token Rotation
* Secure Logout
* Password Hashing (bcrypt)
* Session Revocation
* Rate Limiting
* Role-Based Access Control (RBAC)

## Workspace Management

* Create Workspace
* Delete Workspace
* Workspace Settings
* Workspace Membership Management
* Multi-Tenant Architecture

## Project Management

* Create Projects
* Delete Projects
* Project Organization

## Kanban Boards

* Multiple Boards per Project
* Drag-and-Drop Workflow
* Task Status Management
* Column Organization

## Task Management

* Create Tasks
* Edit Tasks
* Move Tasks Between Columns
* Assign Tasks
* Due Dates
* Priorities
* Activity Tracking

## Collaboration

* Real-Time Updates
* Comments
* User Mentions
* Notifications
* Activity Logs

## Analytics

* Completion Rate
* Task Velocity
* Overdue Tasks
* Personal Performance Metrics
* Workspace Performance Metrics

## Monitoring

* Prometheus Metrics
* Grafana Dashboards
* Health Checks
* Request Monitoring

---

# System Architecture

```text
                         +------------------+
                         |  Client Browser  |
                         |      React       |
                         +--------+---------+
                                  |
                                  v
                         +------------------+
                         |      Nginx       |
                         | Reverse Proxy    |
                         +--------+---------+
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
       +------------------+            +------------------+
       |     Frontend     |            |     Backend      |
       | React + Vite     |            | Express + TS     |
       +------------------+            +--------+---------+
                                                |
                      +-------------------------+-------------------------+
                      |                         |                         |
                      v                         v                         v
             +----------------+      +----------------+      +----------------+
             | PostgreSQL DB  |      | Redis Cache   |      | Socket.IO      |
             | Persistent Data|      | Sessions      |      | Realtime Layer |
             +----------------+      +----------------+      +----------------+

                                                |
                                                v

                                   +-----------------------+
                                   |      Prometheus       |
                                   | Metrics Collection    |
                                   +-----------+-----------+
                                               |
                                               v
                                   +-----------------------+
                                   |       Grafana         |
                                   | Dashboards & Alerts   |
                                   +-----------------------+
```

---

# Technology Stack

## Frontend

* React 18
* TypeScript
* Vite
* Zustand
* TanStack Query
* React Router
* Socket.IO Client

## Backend

* Node.js
* Express
* TypeScript
* Prisma ORM
* JWT Authentication
* Socket.IO

## Database

* PostgreSQL

## Cache

* Redis

## Infrastructure

* Docker
* Docker Compose
* Nginx

## Monitoring

* Prometheus
* Grafana

---

# RBAC Matrix

| Action                  | Admin | Manager          | Member        |
| ----------------------- | ----- | ---------------- | ------------- |
| Create Workspace        | ✅     | ❌                | ❌             |
| Delete Workspace        | ✅     | ❌                | ❌             |
| Edit Workspace Settings | ✅     | ❌                | ❌             |
| Invite Members          | ✅     | ✅                | ❌             |
| Remove Members          | ✅     | ✅ (Members Only) | ❌             |
| Create Project          | ✅     | ✅                | ❌             |
| Delete Project          | ✅     | ❌                | ❌             |
| Create Board            | ✅     | ✅                | ❌             |
| Delete Board            | ✅     | ❌                | ❌             |
| Create Task             | ✅     | ✅                | ✅             |
| Assign Task             | ✅     | ✅                | ❌             |
| Reassign Task           | ✅     | ✅                | ❌             |
| Move Own Task           | ✅     | ✅                | ✅             |
| Move Any Task           | ✅     | ✅                | ❌             |
| Manage Roles            | ✅     | ❌                | ❌             |
| View Analytics          | ✅     | Team + Personal  | Personal Only |

---

# Seeded Test Accounts

The database seed automatically creates the following users.

| Username | Email                                             | Password      | Role    |
| -------- | ------------------------------------------------- | ------------- | ------- |
| alice    | [alice@example.com](mailto:alice@example.com)     | Alice@12345   | Admin   |
| bob      | [bob@example.com](mailto:bob@example.com)         | Bob@12345     | Manager |
| charlie  | [charlie@example.com](mailto:charlie@example.com) | Charlie@12345 | Member  |

---

# Environment Variables

## Backend

Create:

```bash
backend/.env
```

Example:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/task_management_db
REDIS_URL=redis://redis:6379

JWT_SECRET=super-secret-key
JWT_REFRESH_SECRET=super-secret-refresh-key

PORT=8080
NODE_ENV=development
```

---

# Running the Application

Start the complete platform:

```bash
docker compose up --build
```

Run in detached mode:

```bash
docker compose up --build -d
```

Stop services:

```bash
docker compose down
```

---

# Local Development

## Backend

```bash
cd backend

npm install

npm run dev
```

## Frontend

```bash
cd frontend

npm install

npm run dev
```

---

# Database Commands

Generate Prisma Client:

```bash
npm run prisma:generate
```

Run Migrations:

```bash
npm run prisma:migrate
```

Seed Database:

```bash
npm run prisma:seed
```

---

# Testing

Run Backend Tests:

```bash
cd backend

npm test
```

Run Specific RBAC Tests:

```bash
npx jest tests/integration/rbac-matrix.test.ts --runInBand --forceExit
```

Run Workspace Tests:

```bash
npx jest tests/integration/workspace.test.ts --runInBand --forceExit
```

Run Frontend Tests:

```bash
cd frontend

npm test
```

---

# API Endpoints

Base URL:

```text
/api/v1
```

## Authentication

```http
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET  /auth/me
PATCH /auth/me
```

## Workspaces

```http
POST   /workspaces
GET    /workspaces
GET    /workspaces/:workspaceId
DELETE /workspaces/:workspaceId
```

## Members

```http
POST   /workspaces/:workspaceId/members
GET    /workspaces/:workspaceId/members
PATCH  /workspaces/:workspaceId/members/:memberId
DELETE /workspaces/:workspaceId/members/:memberId
```

## Projects

```http
POST   /workspaces/:workspaceId/projects
GET    /workspaces/:workspaceId/projects
DELETE /workspaces/:workspaceId/projects/:projectId
```

## Boards

```http
POST /projects/:projectId/boards
GET  /projects/:projectId/boards
```

## Tasks

```http
POST   /boards/:boardId/tasks
GET    /boards/:boardId/tasks
PATCH  /tasks/:taskId
PATCH  /tasks/:taskId/move
DELETE /tasks/:taskId
```

## Comments

```http
POST /tasks/:taskId/comments
GET  /tasks/:taskId/comments
DELETE /comments/:commentId
```

## Analytics

```http
GET /workspaces/:workspaceId/analytics/summary
GET /workspaces/:workspaceId/analytics/member/:memberId
```

---

# Monitoring

Prometheus Metrics Endpoint:

```text
/metrics
```

Tracked Metrics:

* HTTP Requests
* Request Duration
* Active WebSocket Connections
* Task Creation Rate
* Task Completion Rate
* Notification Events
* Database Query Duration

---

# Health Checks

```http
GET /api/v1/health
GET /api/v1/ready
```

---

# Production Features

* Multi-Tenant Workspace Architecture
* Real-Time Collaboration
* WebSocket Authentication
* JWT Security
* Refresh Token Rotation
* RBAC Authorization
* Soft User Deletion
* Activity Audit Logs
* Redis Session Management
* Prometheus Monitoring
* Grafana Dashboards
* Dockerized Deployment

---

# Repository Structure

```text
.
├── backend
│   ├── src
│   ├── prisma
│   ├── tests
│   └── Dockerfile
│
├── frontend
│   ├── src
│   ├── public
│   └── Dockerfile
│
├── infra
│   ├── nginx
│   ├── prometheus
│   └── grafana
│
├── docker-compose.yml
├── TECH_STACK.md
└── README.md
```

---

# License

This project was developed as a full-stack engineering assessment demonstrating scalable backend architecture, role-based access control, real-time collaboration, monitoring, observability, and production deployment practices.
