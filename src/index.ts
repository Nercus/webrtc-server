import { DurableObject } from "cloudflare:workers";

export class WebSocketServer extends DurableObject<Env> {
  roomId: string | null = null;
  clients: Set<WebSocket>;


	constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.roomId = null;
    this.clients = new Set();
  }

  async initialize(roomId: string) {
    this.roomId = roomId;
    await this.ctx.storage.put("roomId", roomId);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/connect")) {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];
      server.accept();
      this.clients.add(server);

      server.addEventListener('message', event => {
        // Broadcast to all clients in the room
        for (const ws of this.clients) {
          if (ws !== server) {
            ws.send(event.data);
          }
        }
      });
      server.addEventListener('close', () => {
        this.clients.delete(server);
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }
}


const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const generateRoomCode = (length = 6): string => {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const handleRoomCreation = async (request: Request, env: Env): Promise<Response> => {
  let roomId: string;
  let id, stub;

  do {
    roomId = generateRoomCode();
    id = env.WEBSOCKET_SERVER.idFromName(roomId);
    stub = env.WEBSOCKET_SERVER.get(id);
  } while (false);

  await stub.fetch(request);
  await stub.initialize(roomId);

  // Here you would typically store the room in a database or in-memory store
  return new Response(JSON.stringify({ roomId }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

const handleRoomJoin = async (request: Request): Promise<Response> => {
  const { roomId } = await request.json() as { roomId: string };
  if (!roomId) {
    return new Response('Missing roomId', { status: 400 });
  }
  // Could add more logic here to verify room existence
  console.log(`Client joining room ${roomId}`);
  return new Response(JSON.stringify({ roomId }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const handleWebSocket = async (request: Request, env: Env): Promise<Response> => {
  const roomId = new URL(request.url).searchParams.get('roomId');
  if (!roomId) {
    return new Response('Missing roomId', { status: 400 });
  }
  const id = env.WEBSOCKET_SERVER.idFromName(roomId);
  const stub = env.WEBSOCKET_SERVER.get(id);
  console.log(`WebSocket connection to room ${roomId}`);
  // Always forward to /connect on the DO
  const doUrl = `https://webrtc.wintersperger.dev/connect`
  const forwardRequest = new Request(doUrl, request);

  return stub.fetch(forwardRequest);
 }



function withCORS(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// Handle preflight OPTIONS requests
const handleOptions = async (): Promise<Response> => {
  return withCORS(new Response(null, { status: 204 }));
};


export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return handleOptions();
    }
    if (url.pathname === '/create-room' && request.method === 'POST') {
      return withCORS(await handleRoomCreation(request, env));
    } else if (url.pathname === '/join-room' && request.method === 'POST') {
      return withCORS(await handleRoomJoin(request));
    } else if (url.pathname === '/ws' && request.method === 'GET') {
      // WebSocket upgrades do not need CORS
      return handleWebSocket(request, env);
    } else {
      return withCORS(new Response('Not Found', { status: 404 }));
    }
	},
} satisfies ExportedHandler<Env>;
