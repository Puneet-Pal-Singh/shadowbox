export class StreamHandler {
  private sockets: Set<WebSocket> = new Set();

  // Add a new client connection
  add(socket: WebSocket) {
    this.sockets.add(socket);
    
    // Cleanup on close/error
    socket.addEventListener("close", () => this.sockets.delete(socket));
    socket.addEventListener("error", () => this.sockets.delete(socket));
  }

  // Send a message to ALL connected clients for this session
  broadcast(type: string, data: any) {
    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    for (const socket of this.sockets) {
      try {
        socket.send(message);
      } catch (e) {
        this.sockets.delete(socket);
      }
    }
  }
}