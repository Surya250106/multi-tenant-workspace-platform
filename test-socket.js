const { io } = require("socket.io-client");
const http = require("http");

async function apiRequest(path, method, headers, payload = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "localhost",
      port: 80, // Request via Nginx proxy on port 80
      path,
      method,
      headers
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success) {
            resolve(parsed.data);
          } else {
            reject(new Error(`API failed on ${path}: ` + JSON.stringify(parsed)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    if (payload) {
      req.write(JSON.stringify(payload));
    }
    req.end();
  });
}

async function loginAndGetToken() {
  const result = await apiRequest("/api/v1/auth/login", "POST", {
    "Content-Type": "application/json"
  }, {
    username: "alice",
    password: "Password@12345"
  });
  return result.accessToken;
}

async function getFirstBoardId(token) {
  const headers = {
    "Authorization": `Bearer ${token}`
  };
  
  // 1. Get workspaces
  const workspacesResult = await apiRequest("/api/v1/workspaces", "GET", headers);
  if (!workspacesResult.workspaces || workspacesResult.workspaces.length === 0) {
    throw new Error("No workspaces found!");
  }
  const workspaceId = workspacesResult.workspaces[0].id;
  
  // 2. Get projects and boards
  const projectsResult = await apiRequest(`/api/v1/workspaces/${workspaceId}/projects`, "GET", headers);
  if (!projectsResult.projects || projectsResult.projects.length === 0) {
    throw new Error("No projects found!");
  }
  const project = projectsResult.projects[0];
  if (!project.boards || project.boards.length === 0) {
    throw new Error("No boards found inside project!");
  }
  
  // Find "To Do" board or fallback to first board
  const todoBoard = project.boards.find(b => b.name.toLowerCase() === "to do" || b.name.toLowerCase() === "todo") || project.boards[0];
  return todoBoard.id;
}

async function run() {
  try {
    console.log("Retrieving valid JWT Access Token for Alice...");
    const token = await loginAndGetToken();
    console.log("Access Token acquired!");

    console.log("Dynamically fetching To Do board column UUID...");
    const boardId = await getFirstBoardId(token);
    console.log(`Resolved Board UUID: ${boardId}`);

    console.log("Connecting to Socket.IO server at http://localhost/socket...");
    const socket = io("http://localhost", {
      path: "/socket",
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("CONNECTED:", socket.id);
      console.log("Sending authentication packet...");
      socket.emit("auth", { token });
    });

    socket.on("auth_success", (data) => {
      console.log("AUTH SUCCESS:", data);
      console.log(`Joining board column: ${boardId}...`);
      socket.emit("join_board", { boardId });
    });

    socket.on("auth_error", (data) => {
      console.error("AUTH ERROR:", data);
      process.exit(1);
    });

    socket.on("joined", (data) => {
      console.log("JOINED BOARD:", data);
      console.log("\n>>> REAL-TIME BROADCAST LISTENER ACTIVE <<<");
      console.log("Waiting for events (task_created, task_updated, task_moved, notification)...");
    });

    socket.on("user_joined", (data) => {
      console.log("EVENT RECEIVED - USER JOINED:", data);
    });

    socket.on("user_left", (data) => {
      console.log("EVENT RECEIVED - USER LEFT:", data);
    });

    socket.on("task_created", (data) => {
      console.log("EVENT RECEIVED - TASK CREATED:", JSON.stringify(data, null, 2));
    });

    socket.on("task_updated", (data) => {
      console.log("EVENT RECEIVED - TASK UPDATED:", JSON.stringify(data, null, 2));
    });

    socket.on("task_moved", (data) => {
      console.log("EVENT RECEIVED - TASK MOVED:", JSON.stringify(data, null, 2));
    });

    socket.on("notification", (data) => {
      console.log("EVENT RECEIVED - NOTIFICATION:", JSON.stringify(data, null, 2));
    });

    socket.on("pong", () => {
      console.log("HEARTBEAT PONG RECEIVED");
    });

    socket.on("disconnect", (reason) => {
      console.log("DISCONNECTED:", reason);
      if (reason === "io server disconnect") {
        process.exit(0);
      }
    });

    setInterval(() => {
      console.log("Sending heartbeat ping...");
      socket.emit("heartbeat");
    }, 10000);

  } catch (err) {
    console.error("Error running test-socket script:", err.message);
    process.exit(1);
  }
}

run();