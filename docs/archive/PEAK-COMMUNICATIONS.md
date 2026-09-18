> **ARCHIVED.** These five documents describe the previous product direction and
> a stack this repository does not use (Prisma, NextAuth, Stripe Connect). They
> are retained as history. Do not implement from them — see `../README.md`.

# Peak Rentals: Communications Integration (WebLink)

## Overview

Peak Rentals uses WebLink for peer-to-peer communications with a lightweight WebSocket signaling server for connection establishment. Messages are persisted to the database for offline delivery and history.

**Architecture:**
```
┌─────────────┐     WebRTC DataChannel     ┌─────────────┐
│   User A    │◄─────────────────────────►│   User B    │
└──────┬──────┘                            └──────┬──────┘
       │                                          │
       │  WebSocket (signaling only)              │
       │                                          │
       └─────────────►┌──────────┐◄───────────────┘
                      │ Signaling│
                      │  Server  │
                      └──────────┘
                           │
                      ┌────▼────┐
                      │ Database │ (message persistence)
                      └─────────┘
```

---

## Dependencies

```bash
# Client-side (already in Next.js)
npm install simple-peer uuid

# Server-side signaling (separate service or API route)
npm install ws
```

---

## Part 1: WebLink Client Wrapper

### File: `lib/weblink.ts`

```typescript
import Peer from "simple-peer";
import { v4 as uuidv4 } from "uuid";

export interface PeakMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
  conversationId: string;
  delivered?: boolean;
  read?: boolean;
}

export interface WebLinkConfig {
  userId: string;
  signalingUrl: string;
  onMessage: (message: PeakMessage) => void;
  onPeerConnected: (peerId: string) => void;
  onPeerDisconnected: (peerId: string) => void;
  onError: (error: Error) => void;
}

export class WebLinkClient {
  private userId: string;
  private socket: WebSocket | null = null;
  private peers: Map<string, Peer.Instance> = new Map();
  private pendingMessages: Map<string, PeakMessage[]> = new Map();
  private config: WebLinkConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: WebLinkConfig) {
    this.config = config;
    this.userId = config.userId;
  }

  // === CONNECTION MANAGEMENT ===

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return;

    this.socket = new WebSocket(this.config.signalingUrl);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.socket?.send(JSON.stringify({
        type: "register",
        userId: this.userId
      }));
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleSignalingMessage(data);
    };

    this.socket.onclose = () => {
      this.handleDisconnect();
    };

    this.socket.onerror = (error) => {
      this.config.onError(new Error("WebSocket error"));
    };
  }

  disconnect(): void {
    this.peers.forEach((peer) => peer.destroy());
    this.peers.clear();
    this.socket?.close();
    this.socket = null;
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(), delay);
    }
  }

  // === SIGNALING ===

  private handleSignalingMessage(data: any): void {
    switch (data.type) {
      case "offer":
        this.handleOffer(data.from, data.offer);
        break;
      case "answer":
        this.handleAnswer(data.from, data.answer);
        break;
      case "ice-candidate":
        this.handleIceCandidate(data.from, data.candidate);
        break;
      case "user-online":
        this.initiateConnection(data.userId);
        break;
      case "user-offline":
        this.handlePeerOffline(data.userId);
        break;
    }
  }

  private initiateConnection(peerId: string): void {
    if (this.peers.has(peerId)) return;

    const peer = new Peer({
      initiator: true,
      trickle: true,
    });

    this.setupPeer(peer, peerId);
    this.peers.set(peerId, peer);
  }

  private handleOffer(peerId: string, offer: any): void {
    const peer = new Peer({
      initiator: false,
      trickle: true,
    });

    this.setupPeer(peer, peerId);
    this.peers.set(peerId, peer);
    peer.signal(offer);
  }

  private handleAnswer(peerId: string, answer: any): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.signal(answer);
    }
  }

  private handleIceCandidate(peerId: string, candidate: any): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.signal(candidate);
    }
  }

  private handlePeerOffline(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
      this.config.onPeerDisconnected(peerId);
    }
  }

  // === PEER SETUP ===

  private setupPeer(peer: Peer.Instance, peerId: string): void {
    peer.on("signal", (signal) => {
      const type = signal.type === "offer" ? "offer" : 
                   signal.type === "answer" ? "answer" : "ice-candidate";
      
      this.socket?.send(JSON.stringify({
        type,
        to: peerId,
        from: this.userId,
        [type === "ice-candidate" ? "candidate" : type]: signal
      }));
    });

    peer.on("connect", () => {
      this.config.onPeerConnected(peerId);
      this.flushPendingMessages(peerId);
    });

    peer.on("data", (data) => {
      try {
        const message: PeakMessage = JSON.parse(data.toString());
        this.config.onMessage(message);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    });

    peer.on("close", () => {
      this.peers.delete(peerId);
      this.config.onPeerDisconnected(peerId);
    });

    peer.on("error", (err) => {
      console.error(`Peer error with ${peerId}:`, err);
      this.peers.delete(peerId);
    });
  }

  // === MESSAGING ===

  sendMessage(peerId: string, content: string, conversationId: string): PeakMessage {
    const message: PeakMessage = {
      id: uuidv4(),
      senderId: this.userId,
      content,
      timestamp: Date.now(),
      conversationId,
      delivered: false
    };

    const peer = this.peers.get(peerId);
    
    if (peer && peer.connected) {
      peer.send(JSON.stringify(message));
      message.delivered = true;
    } else {
      // Queue for later delivery
      const pending = this.pendingMessages.get(peerId) || [];
      pending.push(message);
      this.pendingMessages.set(peerId, pending);
    }

    return message;
  }

  private flushPendingMessages(peerId: string): void {
    const pending = this.pendingMessages.get(peerId);
    if (!pending || pending.length === 0) return;

    const peer = this.peers.get(peerId);
    if (!peer || !peer.connected) return;

    pending.forEach((message) => {
      peer.send(JSON.stringify(message));
      message.delivered = true;
    });

    this.pendingMessages.delete(peerId);
  }

  // === STATUS ===

  isConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    return peer?.connected ?? false;
  }

  getConnectedPeers(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.connected)
      .map(([id]) => id);
  }
}

// Singleton instance
let webLinkInstance: WebLinkClient | null = null;

export function getWebLink(config?: WebLinkConfig): WebLinkClient {
  if (!webLinkInstance && config) {
    webLinkInstance = new WebLinkClient(config);
  }
  if (!webLinkInstance) {
    throw new Error("WebLink not initialized. Call with config first.");
  }
  return webLinkInstance;
}

export function destroyWebLink(): void {
  webLinkInstance?.disconnect();
  webLinkInstance = null;
}
```

---

## Part 2: Signaling Server (API Route)

### File: `app/api/signaling/route.ts`

For Next.js API routes, we use a polling-based approach or integrate with an external WebSocket server. Here's a simple polling fallback:

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// In-memory signal queue (use Redis in production)
const signalQueue = new Map<string, any[]>();

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, to, from, offer, answer, candidate } = await request.json();

  if (type === "register") {
    // User came online - notify their network
    return NextResponse.json({ status: "registered" });
  }

  // Queue signal for recipient
  const queue = signalQueue.get(to) || [];
  queue.push({ type, from, offer, answer, candidate, timestamp: Date.now() });
  signalQueue.set(to, queue);

  return NextResponse.json({ status: "queued" });
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch and clear pending signals
  const signals = signalQueue.get(session.user.id) || [];
  signalQueue.delete(session.user.id);

  // Clean old signals (older than 30 seconds)
  const now = Date.now();
  const freshSignals = signals.filter(s => now - s.timestamp < 30000);

  return NextResponse.json({ signals: freshSignals });
}
```

### Recommended: External WebSocket Server

For production, deploy the WebLink WebSocket server separately:

```bash
# Clone and deploy
git clone https://github.com/99percentpeople/weblink-ws-server
cd weblink-ws-server
# Configure and deploy to your infrastructure
```

Update `lib/weblink.ts` to point to your deployed server URL.

---

## Part 3: Message Persistence API

### File: `app/api/conversations/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/conversations - List user's conversations
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { id: session.user.id } }
    },
    include: {
      participants: {
        select: { id: true, name: true, avatarUrl: true }
      },
      equipment: {
        select: { id: true, title: true }
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true, senderId: true }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  // Format for client
  const formatted = conversations.map(conv => ({
    id: conv.id,
    participants: conv.participants.filter(p => p.id !== session.user.id),
    equipment: conv.equipment,
    lastMessage: conv.messages[0] || null,
    updatedAt: conv.updatedAt
  }));

  return NextResponse.json({ conversations: formatted });
}

// POST /api/conversations - Start new conversation
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { participantId, equipmentId, initialMessage } = await request.json();

  // Verify participant is in trust network
  const trustConnection = await prisma.vouch.findFirst({
    where: {
      OR: [
        { voucherId: session.user.id, voucheeId: participantId, broadcast: true },
        { voucherId: participantId, voucheeId: session.user.id, broadcast: true }
      ]
    }
  });

  // Also check extended network (2 degrees)
  if (!trustConnection) {
    const extendedConnection = await prisma.$queryRaw`
      SELECT 1 FROM Vouch v1
      JOIN Vouch v2 ON v1.voucheeId = v2.voucherId
      WHERE v1.voucherId = ${session.user.id}
      AND v2.voucheeId = ${participantId}
      AND v1.broadcast = true AND v2.broadcast = true
      LIMIT 1
    `;

    if ((extendedConnection as any[]).length === 0) {
      return NextResponse.json({ error: "User not in your network" }, { status: 403 });
    }
  }

  // Check for existing conversation
  const existing = await prisma.conversation.findFirst({
    where: {
      participants: {
        every: { id: { in: [session.user.id, participantId] } }
      },
      equipmentId: equipmentId || null
    }
  });

  if (existing) {
    return NextResponse.json({ conversation: existing, existing: true });
  }

  // Create new conversation
  const conversation = await prisma.conversation.create({
    data: {
      participants: {
        connect: [{ id: session.user.id }, { id: participantId }]
      },
      equipmentId: equipmentId || undefined
    },
    include: {
      participants: { select: { id: true, name: true, avatarUrl: true } }
    }
  });

  // Add initial message if provided
  if (initialMessage) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: session.user.id,
        content: initialMessage
      }
    });
  }

  // Create contact cards if not existing
  await prisma.contactCard.createMany({
    data: [
      { collectorId: session.user.id, subjectId: participantId, origin: "conversation" },
      { collectorId: participantId, subjectId: session.user.id, origin: "conversation" }
    ],
    skipDuplicates: true
  });

  return NextResponse.json({ conversation, existing: false }, { status: 201 });
}
```

### File: `app/api/conversations/[id]/messages/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/conversations/[id]/messages - Get message history
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Verify user is participant
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.id,
      participants: { some: { id: session.user.id } }
    }
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } }
    }
  });

  const hasMore = messages.length > limit;
  const items = hasMore ? messages.slice(0, -1) : messages;

  return NextResponse.json({
    messages: items.reverse(), // Chronological order
    nextCursor: hasMore ? items[0].id : null,
    hasMore
  });
}

// POST /api/conversations/[id]/messages - Persist a message
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content, clientMessageId } = await request.json();

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  }

  // Verify user is participant
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.id,
      participants: { some: { id: session.user.id } }
    }
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Check for duplicate (idempotency)
  if (clientMessageId) {
    const existing = await prisma.message.findFirst({
      where: { id: clientMessageId }
    });
    if (existing) {
      return NextResponse.json({ message: existing, duplicate: true });
    }
  }

  const message = await prisma.message.create({
    data: {
      id: clientMessageId || undefined,
      conversationId: params.id,
      senderId: session.user.id,
      content: content.trim()
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } }
    }
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: params.id },
    data: { updatedAt: new Date() }
  });

  return NextResponse.json({ message }, { status: 201 });
}
```

---

## Part 4: React Chat Components

### File: `components/chat/ChatProvider.tsx`

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { WebLinkClient, PeakMessage, getWebLink, destroyWebLink } from "@/lib/weblink";
import { useSession } from "next-auth/react";

interface ChatContextType {
  isConnected: boolean;
  connectedPeers: string[];
  sendMessage: (peerId: string, content: string, conversationId: string) => PeakMessage | null;
  messages: Map<string, PeakMessage[]>;
  markAsRead: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [messages, setMessages] = useState<Map<string, PeakMessage[]>>(new Map());
  const [client, setClient] = useState<WebLinkClient | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    const weblink = getWebLink({
      userId: session.user.id,
      signalingUrl: process.env.NEXT_PUBLIC_SIGNALING_URL || "ws://localhost:8080",
      onMessage: (message) => {
        setMessages(prev => {
          const copy = new Map(prev);
          const convMessages = copy.get(message.conversationId) || [];
          copy.set(message.conversationId, [...convMessages, message]);
          return copy;
        });
        
        // Persist to database
        persistMessage(message);
      },
      onPeerConnected: (peerId) => {
        setConnectedPeers(prev => [...prev.filter(p => p !== peerId), peerId]);
      },
      onPeerDisconnected: (peerId) => {
        setConnectedPeers(prev => prev.filter(p => p !== peerId));
      },
      onError: (error) => {
        console.error("WebLink error:", error);
      }
    });

    weblink.connect();
    setClient(weblink);
    setIsConnected(true);

    return () => {
      destroyWebLink();
      setIsConnected(false);
    };
  }, [session?.user?.id]);

  const persistMessage = async (message: PeakMessage) => {
    try {
      await fetch(`/api/conversations/${message.conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message.content,
          clientMessageId: message.id
        })
      });
    } catch (error) {
      console.error("Failed to persist message:", error);
    }
  };

  const sendMessage = useCallback((peerId: string, content: string, conversationId: string) => {
    if (!client) return null;
    
    const message = client.sendMessage(peerId, content, conversationId);
    
    // Add to local state immediately
    setMessages(prev => {
      const copy = new Map(prev);
      const convMessages = copy.get(conversationId) || [];
      copy.set(conversationId, [...convMessages, message]);
      return copy;
    });

    // Persist
    persistMessage(message);

    return message;
  }, [client]);

  const markAsRead = useCallback((conversationId: string) => {
    setMessages(prev => {
      const copy = new Map(prev);
      const convMessages = copy.get(conversationId) || [];
      copy.set(conversationId, convMessages.map(m => ({ ...m, read: true })));
      return copy;
    });
  }, []);

  return (
    <ChatContext.Provider value={{ isConnected, connectedPeers, sendMessage, messages, markAsRead }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
```

### File: `components/chat/ChatWindow.tsx`

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useChat } from "./ChatProvider";
import { MessageBubble } from "./MessageBubble";

interface ChatWindowProps {
  conversationId: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
}

export function ChatWindow({ 
  conversationId, 
  participantId, 
  participantName,
  participantAvatar 
}: ChatWindowProps) {
  const { sendMessage, messages, connectedPeers, markAsRead } = useChat();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOnline = connectedPeers.includes(participantId);

  // Load message history
  useEffect(() => {
    async function loadHistory() {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      const data = await res.json();
      if (data.messages) {
        setHistory(data.messages);
      }
    }
    loadHistory();
    markAsRead(conversationId);
  }, [conversationId, markAsRead]);

  // Combine history with real-time messages
  const allMessages = [
    ...history,
    ...(messages.get(conversationId) || [])
  ].filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(participantId, input.trim(), conversationId);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-peak-cream rounded-lg border border-peak-wood/20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-peak-wood/10">
        {participantAvatar ? (
          <img src={participantAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-peak-forest/20 flex items-center justify-center">
            <span className="text-peak-forest font-medium">
              {participantName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-serif text-peak-charcoal">{participantName}</h3>
          <span className={`text-xs ${isOnline ? "text-peak-forest" : "text-peak-charcoal/50"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allMessages.map((message) => (
          <MessageBubble
            key={message.id}
            content={message.content}
            isMine={message.senderId === participantId ? false : true}
            timestamp={message.createdAt || message.timestamp}
            delivered={message.delivered}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-peak-wood/10">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 resize-none rounded-lg border border-peak-wood/20 bg-white p-3 
                       focus:outline-none focus:ring-2 focus:ring-peak-forest/30
                       placeholder:text-peak-charcoal/40 text-peak-charcoal"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="self-end px-4 py-2 rounded-lg bg-peak-forest text-white font-medium
                       hover:bg-peak-forest/90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### File: `components/chat/MessageBubble.tsx`

```tsx
interface MessageBubbleProps {
  content: string;
  isMine: boolean;
  timestamp: number | string;
  delivered?: boolean;
}

export function MessageBubble({ content, isMine, timestamp, delivered }: MessageBubbleProps) {
  const time = typeof timestamp === "number" 
    ? new Date(timestamp) 
    : new Date(timestamp);
  
  const formattedTime = time.toLocaleTimeString([], { 
    hour: "numeric", 
    minute: "2-digit" 
  });

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isMine
            ? "bg-peak-forest text-white rounded-br-sm"
            : "bg-white border border-peak-wood/10 text-peak-charcoal rounded-bl-sm"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
          <span className={`text-xs ${isMine ? "text-white/60" : "text-peak-charcoal/40"}`}>
            {formattedTime}
          </span>
          {isMine && delivered && (
            <svg className="w-3 h-3 text-white/60" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Part 5: Integration with Equipment Detail

### Add "Message Owner" to Equipment Page

In `app/equipment/[id]/page.tsx`, add:

```tsx
import { MessageOwnerButton } from "@/components/chat/MessageOwnerButton";

// Inside the component, after owner info:
<MessageOwnerButton 
  ownerId={equipment.owner.id}
  ownerName={equipment.owner.name}
  equipmentId={equipment.id}
  equipmentTitle={equipment.title}
/>
```

### File: `components/chat/MessageOwnerButton.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface Props {
  ownerId: string;
  ownerName: string;
  equipmentId: string;
  equipmentTitle: string;
}

export function MessageOwnerButton({ ownerId, ownerName, equipmentId, equipmentTitle }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session || session.user.id === ownerId) {
    return null;
  }

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: ownerId,
          equipmentId,
          initialMessage: `Hi! I'm interested in the ${equipmentTitle}.`
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError("You need to be in this person's network to message them.");
        } else {
          setError(data.error || "Something went wrong");
        }
        return;
      }

      router.push(`/chat/${data.conversation.id}`);
    } catch (e) {
      setError("Failed to start conversation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-3 px-4 rounded-lg bg-peak-burgundy text-white font-medium
                   hover:bg-peak-burgundy/90 disabled:opacity-50 transition-colors
                   flex items-center justify-center gap-2"
      >
        {loading ? (
          <span className="animate-pulse">Starting chat...</span>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Message {ownerName}
          </>
        )}
      </button>
      {error && (
        <p className="text-sm text-peak-burgundy/80 text-center">{error}</p>
      )}
    </div>
  );
}
```

---

## Environment Variables

Add to `.env.local`:

```bash
# WebLink Signaling Server
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:8080

# Or for production:
# NEXT_PUBLIC_SIGNALING_URL=wss://signaling.peakrentals.io
```

---

## Testing Checklist

- [ ] WebLink client connects to signaling server
- [ ] Peers can establish direct connection
- [ ] Messages send/receive in real-time
- [ ] Messages persist to database
- [ ] Offline messages sync on reconnect
- [ ] Conversation creation respects trust network
- [ ] Message history loads correctly
- [ ] "Message Owner" button appears on equipment detail
- [ ] Non-network users see appropriate error
