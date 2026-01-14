import { createServer, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { URL } from 'url'
import type { Client, PeerMessage, ServerConfig } from './types'

// Configuration with defaults
const config: ServerConfig = {
  port: parseInt(process.env.PORT || '9000', 10),
  path: process.env.PATH_PREFIX || '/peerjs',
  key: process.env.API_KEY || 'peerjs',
  heartbeatInterval: 5000,
  heartbeatTimeout: 15000,
  allowDiscovery: process.env.ALLOW_DISCOVERY === 'true',
}

// Store connected clients by their peer ID
const clients = new Map<string, Client>()

// Generate a random peer ID
function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

// Send a message to a client
function send(client: Client, message: PeerMessage): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message))
  }
}

// Handle incoming WebSocket message
function handleMessage(client: Client, data: string): void {
  let message: PeerMessage
  
  try {
    message = JSON.parse(data)
  } catch {
    console.error(`[${client.id}] Invalid JSON:`, data)
    return
  }

  // Attach source ID
  message.src = client.id

  switch (message.type) {
    case 'HEARTBEAT':
      client.lastHeartbeat = Date.now()
      break

    case 'LEAVE':
      removeClient(client.id)
      break

    case 'OFFER':
    case 'ANSWER':
    case 'CANDIDATE':
      // Relay message to destination peer
      if (message.dst) {
        const destClient = clients.get(message.dst)
        if (destClient) {
          send(destClient, message)
        } else {
          // Destination peer not found
          send(client, {
            type: 'ERROR',
            payload: { msg: `Peer ${message.dst} not found` }
          })
        }
      }
      break

    default:
      console.log(`[${client.id}] Unknown message type:`, message.type)
  }
}

// Remove a client and clean up
function removeClient(id: string): void {
  const client = clients.get(id)
  if (client) {
    clients.delete(id)
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.close()
    }
    console.log(`[-] Peer disconnected: ${id} (${clients.size} peers connected)`)
  }
}

// Parse peer ID and key from WebSocket URL
function parseConnectionParams(url: string): { id: string | null; token: string | null; key: string | null } {
  try {
    // URL format: /peerjs?key=peerjs&id=my-peer-id&token=xxxx
    const parsed = new URL(url, 'http://localhost')
    return {
      id: parsed.searchParams.get('id'),
      token: parsed.searchParams.get('token'),
      key: parsed.searchParams.get('key'),
    }
  } catch {
    return { id: null, token: null, key: null }
  }
}

// HTTP request handler
function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const pathname = url.pathname

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (pathname === '/' || pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      name: 'peer-server',
      peers: clients.size,
      uptime: process.uptime()
    }))
    return
  }

  // Get a random ID: GET /peerjs/id
  if (pathname === `${config.path}/id`) {
    let id = generateId()
    // Ensure unique ID
    while (clients.has(id)) {
      id = generateId()
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(id)
    return
  }

  // List peers (if allowed): GET /peerjs/peers
  if (pathname === `${config.path}/peers`) {
    if (config.allowDiscovery) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(Array.from(clients.keys())))
    } else {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Discovery disabled' }))
    }
    return
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
}

// Create HTTP server
const server = createServer(handleHttpRequest)

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: config.path,
})

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  const params = parseConnectionParams(req.url || '')
  
  // Validate API key
  if (params.key !== config.key) {
    socket.send(JSON.stringify({ type: 'INVALID-KEY' }))
    socket.close()
    return
  }

  // Get or generate peer ID
  let peerId = params.id
  if (!peerId) {
    peerId = generateId()
    while (clients.has(peerId)) {
      peerId = generateId()
    }
  }

  // Check if ID is already taken
  if (clients.has(peerId)) {
    socket.send(JSON.stringify({ type: 'ID-TAKEN', payload: { msg: `ID ${peerId} is already in use` } }))
    socket.close()
    return
  }

  // Create client
  const client: Client = {
    id: peerId,
    socket,
    lastHeartbeat: Date.now(),
  }

  clients.set(peerId, client)
  console.log(`[+] Peer connected: ${peerId} (${clients.size} peers connected)`)

  // Send OPEN message to confirm connection
  send(client, { type: 'OPEN' })

  // Handle messages
  socket.on('message', (data) => {
    handleMessage(client, data.toString())
  })

  // Handle disconnect
  socket.on('close', () => {
    removeClient(peerId!)
  })

  socket.on('error', (err) => {
    console.error(`[${peerId}] Socket error:`, err.message)
    removeClient(peerId!)
  })
})

// Heartbeat checker - remove stale clients
setInterval(() => {
  const now = Date.now()
  for (const [id, client] of clients) {
    if (now - client.lastHeartbeat > config.heartbeatTimeout) {
      console.log(`[!] Peer timed out: ${id}`)
      send(client, { type: 'EXPIRE' })
      removeClient(id)
    }
  }
}, config.heartbeatInterval)

// Start server
server.listen(config.port, () => {
  console.log('═══════════════════════════════════════════')
  console.log('  🚀 PeerJS Signaling Server')
  console.log('═══════════════════════════════════════════')
  console.log(`  HTTP:      http://localhost:${config.port}`)
  console.log(`  WebSocket: ws://localhost:${config.port}${config.path}`)
  console.log(`  API Key:   ${config.key}`)
  console.log(`  Discovery: ${config.allowDiscovery ? 'enabled' : 'disabled'}`)
  console.log('═══════════════════════════════════════════')
  console.log('')
  console.log('  Client config example:')
  console.log(`    new Peer(id, {`)
  console.log(`      host: 'localhost',`)
  console.log(`      port: ${config.port},`)
  console.log(`      path: '${config.path}',`)
  console.log(`      key: '${config.key}',`)
  console.log(`    })`)
  console.log('')
})
