# Operational & Troubleshooting Manual

This guide outlines common operational issues, diagnostic procedures, and resolution pathways for the Collaborative Task Management & Analytics Platform.

---

## 🐘 1. Database Locking & Transaction Bottlenecks

### Issue Description
Users experience requests hanging or timing out with `504 Gateway Timeout` or `PrismaClientKnownRequestError` during card movements or task updates. This is typically caused by uncommitted relational transaction locks or concurrent update deadlocks.

### Diagnostic Verification
Connect directly to the PostgreSQL instance and query the active transaction and lock catalog:
```sql
-- View all locked transactions and queries waiting for lock release
SELECT pid, age(clock_timestamp(), query_start), usename, state, query
FROM pg_stat_activity
WHERE waiting = true;
```

### Resolution Pathway
If a specific backend thread process ID (`pid`) is blocking execution queues, terminate it cleanly:
```sql
-- Clean termination of the blocking transaction process
SELECT pg_cancel_backend(blocking_pid);

-- Hard termination if pg_cancel_backend does not release the lock
SELECT pg_terminate_backend(blocking_pid);
```
Alternatively, in local development/staging sandbox environments, restart the PostgreSQL Docker container:
```bash
docker restart postgres
```

---

## ⚡ 2. WebSocket Handshake Failures & Handshake Timout Drop (4001 / 4003)

### Issue Description
Clients fail to connect to the Socket.IO server, yielding console errors `WebSocket connection closed with code 4001` or `4003` inside their browser consoles.

### Diagnostic Verification
1. **Verify Handshake Timeout**: Ensure that the client-side socket emits the `auth` event with the JWT access token **within 5 seconds** of initiating the connection.
2. **Reverse Proxy Inspection**: Nginx must be configured to forward WebSocket HTTP headers properly. If `Upgrade` or `Connection` headers are missing, Nginx drops the socket connection before it reaches the Node.js backend.

### Resolution Pathway
Verify the Nginx routing block inside `infra/nginx/nginx.conf` contains the exact header pass-throughs:
```nginx
location /socket {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 🎯 3. Redis Broker disconnections & Rate Limiter Failures

### Issue Description
Login calls throw `500 Internal Server Error` with messages containing `Redis connection lost` or `Rate limit verification failed`. Real-time updates do not sync across different browser windows.

### Diagnostic Verification
Check if the Redis server container is healthy and responding to ping diagnostics:
```bash
docker exec -it redis redis-cli ping
# Expected response: PONG
```

### Resolution Pathway
1. **Horizontal Sync Failure**: If Redis drops offline, the system falls back to database-backed operations, but live WebSocket presence syncing will be isolated per instance node. Restart Redis container to restore cluster sync:
   ```bash
   docker restart redis
   ```
2. **Rate Limiting Key Expiry**: If client rate limit caches leak or keys do not expire, run Redis flush selectively to reset lock windows for blocked IPs:
   ```bash
   docker exec -it redis redis-cli KEYS "rate_limit:login:*" | xargs docker exec -it redis redis-cli DEL
   ```

---

## 🔒 4. Nginx CORS Blocks & HTTP 403 Errors

### Issue Description
Frontend calls fail with browser console errors stating: `Access to XMLHttpRequest at ... has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present`.

### Diagnostic Verification
Compare the client's host header origin with the backend's allowed CORS config vector:
```bash
curl -I -H "Origin: http://localhost:3000" http://localhost:8080/api/v1/health
```

### Resolution Pathway
1. Verify the allowed domain matches inside your backend `.env` variables:
   ```bash
   CORS_ORIGIN=http://localhost:3000
   ```
2. For production, ensure CORS is explicitly mapped to the custom SSL target domain (e.g. `https://task-platform.production.local`).
