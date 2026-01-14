import { WebSocket } from 'ws'

// PeerJS message types
export type MessageType = 
  | 'OPEN'           // Server -> Client: Connection established
  | 'ERROR'          // Server -> Client: Error occurred
  | 'ID-TAKEN'       // Server -> Client: Requested ID is already in use
  | 'INVALID-KEY'    // Server -> Client: Invalid API key
  | 'LEAVE'          // Client -> Server: Peer is leaving
  | 'EXPIRE'         // Server -> Client: Peer has expired
  | 'OFFER'          // Client -> Client: WebRTC offer
  | 'ANSWER'         // Client -> Client: WebRTC answer
  | 'CANDIDATE'      // Client -> Client: ICE candidate
  | 'HEARTBEAT'      // Client -> Server: Keep-alive ping

// Message structure used by PeerJS
export interface PeerMessage {
  type: MessageType
  src?: string       // Source peer ID
  dst?: string       // Destination peer ID
  payload?: any      // Message payload (SDP, ICE candidate, etc.)
}

// Connected client with metadata
export interface Client {
  id: string
  socket: WebSocket
  lastHeartbeat: number
}

// Server configuration
export interface ServerConfig {
  port: number
  path: string
  key: string
  heartbeatInterval: number
  heartbeatTimeout: number
  allowDiscovery: boolean
}
