const { io } = require("socket.io-client");

console.log("Initiating Socket.IO handshake request against http://localhost on path /socket...");

const socket = io("http://localhost", {
  path: "/socket",
  transports: ["websocket"],
  forceNew: true
});

socket.on("connect", () => {
  console.log("SUCCESS - CONNECTED TO SOCKET.IO SERVER WITH ID:", socket.id);

  // Send an auth request with a dummy token to test auth rejection
  socket.emit("auth", {
    token: "fake-unauthorized-handshake-token"
  });
});

socket.on("connect_error", (err) => {
  console.log("CONNECT ERROR:", err.message);
  process.exit(1);
});

socket.on("auth_error", (msg) => {
  console.log("RECEIVED EXPECTED AUTH ERROR FROM SERVER:", msg);
});

socket.on("disconnect", (reason) => {
  console.log("DISCONNECTED AS EXPECTED. REASON:", reason);
  process.exit(0);
});

// Timeout fail-safe to prevent test hanging if server is unreachable
setTimeout(() => {
  console.log("Test timed out after 8 seconds.");
  process.exit(1);
}, 8000);
