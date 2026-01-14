# PeerJS Signaling Server

A lightweight, self-hosted PeerJS-compatible signaling server for WebRTC peer-to-peer connections.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in development mode (with hot reload)
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Configuration

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9000` | Server port |
| `PATH_PREFIX` | `/peerjs` | WebSocket path prefix |
| `API_KEY` | `peerjs` | API key for authentication |
| `ALLOW_DISCOVERY` | `false` | Enable `/peerjs/peers` endpoint |

## Client Configuration

Update your PeerJS client to connect to this server:

```typescript
import Peer from 'peerjs'

const peer = new Peer('my-peer-id', {
  host: 'localhost',      // or your ngrok URL
  port: 9000,             // omit for ngrok (uses 443)
  path: '/peerjs',
  key: 'peerjs',
  secure: false,          // true for ngrok/HTTPS
})
```

### With ngrok

```bash
# Start the server
pnpm dev

# In another terminal, expose with ngrok
ngrok http 9000
```

Then update your client:

```typescript
const peer = new Peer('my-peer-id', {
  host: 'abc123.ngrok.io',  // your ngrok URL
  port: 443,
  path: '/peerjs',
  key: 'peerjs',
  secure: true,
})
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/health` | GET | Health check |
| `/peerjs/id` | GET | Generate a random peer ID |
| `/peerjs/peers` | GET | List connected peers (if discovery enabled) |

## WebSocket Protocol

The server implements the PeerJS signaling protocol:

| Message Type | Direction | Description |
|--------------|-----------|-------------|
| `OPEN` | Server → Client | Connection established |
| `ERROR` | Server → Client | Error occurred |
| `ID-TAKEN` | Server → Client | Requested ID already in use |
| `OFFER` | Client ↔ Client | WebRTC SDP offer (relayed) |
| `ANSWER` | Client ↔ Client | WebRTC SDP answer (relayed) |
| `CANDIDATE` | Client ↔ Client | ICE candidate (relayed) |
| `HEARTBEAT` | Client → Server | Keep-alive ping |
| `LEAVE` | Client → Server | Peer disconnecting |
| `EXPIRE` | Server → Client | Peer timed out |

## Docker

```bash
# Build image
docker build -t peer-server .

# Run container
docker run -p 9000:9000 peer-server
```

## Notes

- This is a **signaling server only**. It helps peers find each other and exchange connection info.
- Once WebRTC connection is established, data flows directly between peers (P2P).
- For peers behind strict NATs, you may need to configure TURN servers in the client.
