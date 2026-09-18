> **ARCHIVED.** These five documents describe the previous product direction and
> a stack this repository does not use (Prisma, NextAuth, Stripe Connect). They
> are retained as history. Do not implement from them — see `../README.md`.

# Peak Rentals: Vision Integration Master Guide

## Purpose
This document guides an LLM coding agent to transform a functional but generic rental marketplace into Peak Rentals—a trust-based, community-driven platform with distinctive character. The existing codebase is **production-ready** and must not be broken.

---

## Critical Principles

### 1. Preservation First
The existing system handles:
- Equipment CRUD (working)
- Stripe Connect payments (working)
- Search with unfulfilled logging (working)
- Admin analytics (working)
- NextAuth authentication (working)

**DO NOT modify** these systems unless explicitly extending them. All new features are **additive**.

### 2. The Transformation Summary
| Current State | Target State |
|--------------|--------------|
| Equipment catalog (list view) | Map-centric discovery interface |
| User accounts | Trust network with vouch chains |
| Transaction-first | Chat-first, transaction optional |
| Generic rental UI | Ski chalet aesthetic |
| Anonymous listings | Personality-rich "galleries" |

### 3. Integration Order
Execute these phases sequentially. Each phase must pass before proceeding.

```
Phase 1: Database Schema Extensions (non-destructive)
Phase 2: Trust System API Routes (new endpoints)
Phase 3: WebLink Communications Integration
Phase 4: Map Interface Layer
Phase 5: Aesthetic Transformation
Phase 6: Trading Card / Gallery System
```

---

## Phase 1: Database Schema Extensions

### New Models (Add to schema.prisma)

```prisma
// === TRUST NETWORK ===

model Vouch {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  
  // The person giving the vouch
  voucherId   String
  voucher     User     @relation("VouchesGiven", fields: [voucherId], references: [id])
  
  // The person receiving the vouch
  voucheeId   String
  vouchee     User     @relation("VouchesReceived", fields: [voucheeId], references: [id])
  
  // Has the voucher "broadcast" this person to their network?
  broadcast   Boolean  @default(false)
  broadcastAt DateTime?
  
  // Optional note from voucher
  note        String?
  
  @@unique([voucherId, voucheeId])
  @@index([voucherId])
  @@index([voucheeId])
  @@index([broadcast])
}

model ContactCard {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  
  // The person who "collected" this card
  collectorId String
  collector   User     @relation("CardsCollected", fields: [collectorId], references: [id])
  
  // The person whose card was collected
  subjectId   String
  subject     User     @relation("CardsOf", fields: [subjectId], references: [id])
  
  // How they connected (first transaction, vouch, etc.)
  origin      String   @default("vouch") // "vouch" | "transaction" | "introduced"
  
  @@unique([collectorId, subjectId])
  @@index([collectorId])
}

// === COMMUNICATIONS ===

model Conversation {
  id           String    @id @default(cuid())
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  
  // Participants (exactly 2 for DM, could extend for groups)
  participants User[]    @relation("ConversationParticipants")
  
  // Optional: linked to equipment discussion
  equipmentId  String?
  equipment    Equipment? @relation(fields: [equipmentId], references: [id])
  
  messages     Message[]
  
  @@index([equipmentId])
}

model Message {
  id             String       @id @default(cuid())
  createdAt      DateTime     @default(now())
  
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  senderId       String
  sender         User         @relation(fields: [senderId], references: [id])
  
  content        String
  
  // For P2P sync status
  delivered      Boolean      @default(false)
  read           Boolean      @default(false)
  
  @@index([conversationId])
  @@index([senderId])
}

// === GAMIFICATION ===

model PeaksTransaction {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  amount      Int      // positive = earned, negative = spent
  reason      String   // "rental_complete" | "vouch_given" | "first_interaction" | "chest_opened"
  
  // Optional reference to what triggered this
  referenceId String?
  referenceType String? // "booking" | "vouch" | "chest"
  
  @@index([userId])
}

model TreasureChest {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  
  title       String
  description String
  peaksCost   Int      // Cost in Peaks to open/enter
  
  // What's inside
  prizeType   String   // "item" | "credit" | "raffle"
  prizeValue  String   // JSON describing the prize
  
  // Availability
  available   Boolean  @default(true)
  claimedBy   String?
  claimedAt   DateTime?
  
  @@index([available])
}
```

### User Model Extensions (Modify existing)

```prisma
model User {
  // ... existing fields ...
  
  // === NEW FIELDS ===
  
  // Profile flavor (auto-generated or self-described)
  flavor          String?   // "Heavy Equipment" | "Outdoor Adventure" | "Vintage & Curious"
  
  // Member status
  memberSince     DateTime  @default(now())
  foundingMember  Boolean   @default(false)
  
  // Peaks balance (cached, derived from PeaksTransaction)
  peaksBalance    Int       @default(0)
  
  // Location for map
  latitude        Float?
  longitude       Float?
  locationName    String?   // "Big White Village"
  
  // Profile completeness
  bio             String?
  avatarUrl       String?
  
  // === NEW RELATIONS ===
  vouchesGiven     Vouch[]            @relation("VouchesGiven")
  vouchesReceived  Vouch[]            @relation("VouchesReceived")
  cardsCollected   ContactCard[]      @relation("CardsCollected")
  cardsOf          ContactCard[]      @relation("CardsOf")
  conversations    Conversation[]     @relation("ConversationParticipants")
  messagesSent     Message[]
  peaksHistory     PeaksTransaction[]
}
```

### Migration Strategy

```bash
# 1. Generate migration (non-destructive)
npx prisma migrate dev --name add_trust_and_comms

# 2. Verify existing data intact
npx prisma studio

# 3. Seed founding members if needed
npx prisma db seed
```

---

## Phase 2: Trust System API Routes

### File: `app/api/trust/vouch/route.ts`

```typescript
// POST /api/trust/vouch - Create initial vouch (private connection)
// PUT /api/trust/vouch - Broadcast to network

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, note } = await request.json();

  // Find or invite the vouchee
  let vouchee = await prisma.user.findUnique({ where: { email } });
  
  if (!vouchee) {
    // Create placeholder user (they'll complete profile on first login)
    vouchee = await prisma.user.create({
      data: { email, memberSince: new Date() }
    });
  }

  // Check if vouch already exists
  const existing = await prisma.vouch.findUnique({
    where: {
      voucherId_voucheeId: {
        voucherId: session.user.id,
        voucheeId: vouchee.id
      }
    }
  });

  if (existing) {
    return NextResponse.json({ error: "Already vouched" }, { status: 400 });
  }

  // Create vouch (not yet broadcast)
  const vouch = await prisma.vouch.create({
    data: {
      voucherId: session.user.id,
      voucheeId: vouchee.id,
      note,
      broadcast: false
    },
    include: { vouchee: { select: { id: true, name: true, email: true } } }
  });

  // Create mutual contact cards
  await prisma.contactCard.createMany({
    data: [
      { collectorId: session.user.id, subjectId: vouchee.id, origin: "vouch" },
      { collectorId: vouchee.id, subjectId: session.user.id, origin: "vouch" }
    ],
    skipDuplicates: true
  });

  // Award Peaks for vouching
  await prisma.peaksTransaction.create({
    data: {
      userId: session.user.id,
      amount: 5,
      reason: "vouch_given",
      referenceId: vouch.id,
      referenceType: "vouch"
    }
  });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { peaksBalance: { increment: 5 } }
  });

  return NextResponse.json({ vouch }, { status: 201 });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vouchId } = await request.json();

  // Verify ownership
  const vouch = await prisma.vouch.findUnique({
    where: { id: vouchId },
    include: { vouchee: true }
  });

  if (!vouch || vouch.voucherId !== session.user.id) {
    return NextResponse.json({ error: "Not your vouch" }, { status: 403 });
  }

  if (vouch.broadcast) {
    return NextResponse.json({ error: "Already broadcast" }, { status: 400 });
  }

  // Broadcast: this person is now visible to voucher's network
  const updated = await prisma.vouch.update({
    where: { id: vouchId },
    data: { broadcast: true, broadcastAt: new Date() }
  });

  return NextResponse.json({ vouch: updated });
}
```

### File: `app/api/trust/network/route.ts`

```typescript
// GET /api/trust/network - Get user's visible network (trust graph)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 1. Direct connections (people who vouched for me, broadcast)
  const directVouchers = await prisma.vouch.findMany({
    where: { voucheeId: userId, broadcast: true },
    include: { voucher: { select: { id: true, name: true, avatarUrl: true, flavor: true, latitude: true, longitude: true } } }
  });

  // 2. People I've vouched for (broadcast)
  const myVouchees = await prisma.vouch.findMany({
    where: { voucherId: userId, broadcast: true },
    include: { vouchee: { select: { id: true, name: true, avatarUrl: true, flavor: true, latitude: true, longitude: true } } }
  });

  // 3. Extended network: people broadcast by my direct connections
  const directConnectionIds = [
    ...directVouchers.map(v => v.voucherId),
    ...myVouchees.map(v => v.voucheeId)
  ];

  const extendedNetwork = await prisma.vouch.findMany({
    where: {
      voucherId: { in: directConnectionIds },
      broadcast: true,
      voucheeId: { not: userId }
    },
    include: {
      vouchee: { select: { id: true, name: true, avatarUrl: true, flavor: true, latitude: true, longitude: true } },
      voucher: { select: { id: true, name: true } } // Who introduced them
    }
  });

  // Deduplicate and structure
  const networkMap = new Map();
  
  // Direct connections (degree 1)
  directVouchers.forEach(v => {
    networkMap.set(v.voucher.id, { ...v.voucher, degree: 1, introducedBy: null });
  });
  myVouchees.forEach(v => {
    networkMap.set(v.vouchee.id, { ...v.vouchee, degree: 1, introducedBy: null });
  });
  
  // Extended connections (degree 2)
  extendedNetwork.forEach(v => {
    if (!networkMap.has(v.vouchee.id)) {
      networkMap.set(v.vouchee.id, { 
        ...v.vouchee, 
        degree: 2, 
        introducedBy: v.voucher.name 
      });
    }
  });

  const network = Array.from(networkMap.values());

  return NextResponse.json({ 
    network,
    stats: {
      direct: directVouchers.length + myVouchees.length,
      extended: network.length - (directVouchers.length + myVouchees.length),
      total: network.length
    }
  });
}
```

### File: `app/api/trust/visible-equipment/route.ts`

```typescript
// GET /api/trust/visible-equipment - Equipment from user's trust network only

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const query = searchParams.get("q");

  // Get visible user IDs from trust network
  const [vouchers, vouchees, extended] = await Promise.all([
    prisma.vouch.findMany({
      where: { voucheeId: session.user.id, broadcast: true },
      select: { voucherId: true }
    }),
    prisma.vouch.findMany({
      where: { voucherId: session.user.id, broadcast: true },
      select: { voucheeId: true }
    }),
    // Extended network (2 degrees)
    prisma.$queryRaw`
      SELECT DISTINCT v2.voucheeId 
      FROM Vouch v1
      JOIN Vouch v2 ON v1.voucheeId = v2.voucherId OR v1.voucherId = v2.voucherId
      WHERE (v1.voucherId = ${session.user.id} OR v1.voucheeId = ${session.user.id})
      AND v1.broadcast = true AND v2.broadcast = true
    `
  ]);

  const visibleOwnerIds = new Set([
    session.user.id, // Own equipment
    ...vouchers.map(v => v.voucherId),
    ...vouchees.map(v => v.voucheeId),
    ...(extended as any[]).map(e => e.voucheeId)
  ]);

  // Build equipment query
  const where: any = {
    ownerId: { in: Array.from(visibleOwnerIds) },
    available: true
  };

  if (category) {
    where.category = { equals: category, mode: "insensitive" };
  }

  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } }
    ];
  }

  const equipment = await prisma.equipment.findMany({
    where,
    include: {
      owner: {
        select: { 
          id: true, 
          name: true, 
          avatarUrl: true, 
          flavor: true,
          latitude: true,
          longitude: true 
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ equipment, count: equipment.length });
}
```

---

## Phase 3: WebLink Communications Integration

See `PEAK-COMMUNICATIONS.md` for complete WebLink integration guide.

---

## Phase 4: Map Interface Layer

See `PEAK-MAP-INTERFACE.md` for complete map implementation.

---

## Phase 5: Aesthetic Transformation

See `PEAK-AESTHETIC-SYSTEM.md` for complete design system.

---

## Phase 6: Trading Card / Gallery System

### File: `app/api/cards/route.ts`

```typescript
// GET /api/cards - Get user's collected contact cards

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cards = await prisma.contactCard.findMany({
    where: { collectorId: session.user.id },
    include: {
      subject: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          flavor: true,
          memberSince: true,
          foundingMember: true,
          _count: {
            select: { equipment: true }
          }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  // Enrich with equipment preview for each card
  const enrichedCards = await Promise.all(
    cards.map(async (card) => {
      const equipmentPreview = await prisma.equipment.findMany({
        where: { ownerId: card.subjectId, available: true },
        select: { id: true, title: true, category: true, dailyRate: true },
        take: 3
      });

      return {
        ...card,
        subject: {
          ...card.subject,
          equipmentCount: card.subject._count.equipment,
          equipmentPreview
        }
      };
    })
  );

  return NextResponse.json({ cards: enrichedCards });
}
```

---

## Testing Checklist

### Phase 1: Schema
- [ ] Migration runs without data loss
- [ ] Existing equipment queries work unchanged
- [ ] Existing user queries work unchanged
- [ ] New relations are indexed properly

### Phase 2: Trust System
- [ ] User can vouch for another by email
- [ ] Vouch creates mutual contact cards
- [ ] Broadcast expands visibility correctly
- [ ] Network query returns correct trust graph
- [ ] Equipment filtered to visible network only

### Phase 3: Communications
- [ ] WebLink signaling connects
- [ ] Messages persist to database
- [ ] Offline messages sync on reconnect
- [ ] Conversation tied to equipment optionally

### Phase 4: Map
- [ ] Equipment pins display at correct locations
- [ ] Clicking pin shows owner card
- [ ] Filter by category works
- [ ] Only trusted network visible

### Phase 5: Aesthetic
- [ ] Tailwind config updated
- [ ] Color palette applied consistently
- [ ] Typography hierarchy correct
- [ ] Components match spec

### Phase 6: Cards
- [ ] Card collection grows with interactions
- [ ] Gallery view renders correctly
- [ ] Card links to full profile
- [ ] Equipment preview shows on card

---

## File Structure (New Files)

```
app/
├── api/
│   ├── trust/
│   │   ├── vouch/route.ts
│   │   ├── network/route.ts
│   │   └── visible-equipment/route.ts
│   ├── cards/route.ts
│   ├── conversations/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── messages/route.ts
│   └── peaks/
│       ├── balance/route.ts
│       └── chest/route.ts
├── map/
│   └── page.tsx
├── cards/
│   └── page.tsx
└── chat/
    └── [conversationId]/
        └── page.tsx
components/
├── map/
│   ├── PeakMap.tsx
│   ├── EquipmentPin.tsx
│   └── OwnerCard.tsx
├── cards/
│   ├── ContactCard.tsx
│   └── CardGallery.tsx
├── chat/
│   ├── ChatWindow.tsx
│   ├── MessageBubble.tsx
│   └── ConversationList.tsx
└── ui/
    ├── peak-button.tsx
    ├── peak-card.tsx
    └── peak-input.tsx
lib/
├── weblink.ts
└── peaks.ts
```

---

## Critical Reminders for LLM Agents

1. **Never modify** `app/api/equipment/*` core logic
2. **Never modify** `app/api/stripe/*` payment flow
3. **Never modify** `lib/auth.ts` authentication
4. **Always use** existing `prisma` client from `lib/prisma.ts`
5. **Always use** existing session pattern from other routes
6. **Test each phase** before proceeding to next
7. **Preserve** all existing TypeScript types
8. **Extend** `lib/types.ts` for new types, don't replace
