> **ARCHIVED.** These five documents describe the previous product direction and
> a stack this repository does not use (Prisma, NextAuth, Stripe Connect). They
> are retained as history. Do not implement from them — see `../README.md`.

# Peak Rentals: LLM Implementation Checklist

## 🚫 DO NOT TOUCH (Preserve These)

### Core Files - No Modifications
```
lib/auth.ts                    # Auth configuration
lib/prisma.ts                  # Database client
lib/stripe.ts                  # Payment processing
lib/validation.ts              # Validation utilities
app/api/auth/[...nextauth]/    # Auth routes
app/api/equipment/route.ts     # Equipment CRUD (extend only)
app/api/equipment/[id]/route.ts
app/api/stripe/*               # All payment routes
```

### Database Models - No Schema Changes To
```prisma
model User          # Only ADD new fields, never remove/rename existing
model Equipment     # Only ADD new fields
model Booking       # Do not modify
model SearchLog     # Do not modify
model Account       # Do not modify (NextAuth)
model Session       # Do not modify (NextAuth)
```

### Working Features - Test After Any Change
- [ ] Equipment listing creation
- [ ] Equipment search
- [ ] Stripe Connect onboarding
- [ ] Checkout flow
- [ ] Admin analytics
- [ ] User authentication

---

## ✅ ADD THESE (New Features)

### Phase 1: Database Extensions
```prisma
# ADD these new models to schema.prisma:
model Vouch { ... }
model ContactCard { ... }
model Conversation { ... }
model Message { ... }
model PeaksTransaction { ... }
model TreasureChest { ... }

# ADD these fields to User model:
flavor          String?
memberSince     DateTime  @default(now())
foundingMember  Boolean   @default(false)
peaksBalance    Int       @default(0)
latitude        Float?
longitude       Float?
locationName    String?
bio             String?
avatarUrl       String?
```

### Phase 2: New API Routes
```
app/api/trust/vouch/route.ts           # Vouch creation/broadcast
app/api/trust/network/route.ts         # Trust graph query
app/api/trust/visible-equipment/route.ts # Network-filtered equipment
app/api/cards/route.ts                  # Contact card collection
app/api/conversations/route.ts          # Chat conversations
app/api/conversations/[id]/messages/route.ts
app/api/peaks/balance/route.ts          # Points system
app/api/peaks/chest/route.ts            # Treasure chest
```

### Phase 3: New Pages
```
app/map/page.tsx                # Map interface (NEW PRIMARY)
app/cards/page.tsx              # Contact card gallery
app/chat/[conversationId]/page.tsx
app/profile/[id]/page.tsx       # Public profile
app/network/page.tsx            # Trust network visualization
```

### Phase 4: New Components
```
components/map/PeakMap.tsx
components/map/EquipmentPin.tsx
components/map/EquipmentPopup.tsx
components/map/MapFilters.tsx
components/map/OwnerCard.tsx
components/cards/ContactCard.tsx
components/cards/CardGallery.tsx
components/chat/ChatProvider.tsx
components/chat/ChatWindow.tsx
components/chat/MessageBubble.tsx
components/chat/ConversationList.tsx
components/chat/MessageOwnerButton.tsx
components/ui/PeakButton.tsx
components/ui/PeakCard.tsx
components/ui/PeakInput.tsx
```

---

## 🎨 TRANSFORM THESE (Aesthetic Update)

### Files to Update
```
tailwind.config.js    # Add Peak color palette
app/globals.css       # Add custom properties, fonts, utilities
app/layout.tsx        # Add font imports
```

### Components to Restyle (Keep Logic, Change Appearance)
```
# Find and replace Tailwind classes in:
components/EquipmentCard.tsx     # Use peak-frame, new colors
components/Search/EquipmentSearch.tsx
app/browse/page.tsx              # Point to map as primary
app/equipment/[id]/page.tsx      # Add MessageOwnerButton
```

### Class Replacement Guide
| Old | New |
|-----|-----|
| `bg-white` | `bg-peak-snow` |
| `bg-gray-50` | `bg-peak-cream` |
| `text-gray-900` | `text-peak-charcoal` |
| `text-gray-500` | `text-peak-slate` |
| `bg-blue-600` | `bg-peak-forest` |
| `bg-red-600` | `bg-peak-burgundy` |
| `rounded-lg` | `rounded-peak` |
| `shadow` | `shadow-peak` |
| `border-gray-200` | `border-peak-stone` |

---

## 📋 Implementation Order

### Sprint A: Foundation (Day 1-2)
1. [ ] Update `tailwind.config.js` with Peak colors
2. [ ] Update `app/globals.css` with fonts and utilities
3. [ ] Add new Prisma models (Vouch, ContactCard, etc.)
4. [ ] Run `prisma migrate dev --name add_trust_system`
5. [ ] Verify existing features still work

### Sprint B: Trust System (Day 3-4)
1. [ ] Create `/api/trust/vouch/route.ts`
2. [ ] Create `/api/trust/network/route.ts`
3. [ ] Create `/api/trust/visible-equipment/route.ts`
4. [ ] Create `/api/cards/route.ts`
5. [ ] Test trust network queries

### Sprint C: Communications (Day 5-6)
1. [ ] Add `lib/weblink.ts`
2. [ ] Create `/api/conversations/*` routes
3. [ ] Create `ChatProvider.tsx`
4. [ ] Create `ChatWindow.tsx`, `MessageBubble.tsx`
5. [ ] Add `MessageOwnerButton.tsx` to equipment detail
6. [ ] Test P2P messaging

### Sprint D: Map Interface (Day 7-8)
1. [ ] Install mapbox-gl
2. [ ] Create `PeakMap.tsx` and related components
3. [ ] Create `/app/map/page.tsx`
4. [ ] Wire up filters and equipment display
5. [ ] Test map with real data

### Sprint E: Aesthetic Polish (Day 9-10)
1. [ ] Restyle all existing components
2. [ ] Create `PeakCard.tsx`, `PeakButton.tsx`, `PeakInput.tsx`
3. [ ] Update navigation to feature map
4. [ ] Create card gallery page
5. [ ] Final visual QA

---

## 🧪 Testing After Each Sprint

### Quick Verification Script
```bash
# Run after each change
npm run typecheck        # TypeScript passes
npm run lint            # No lint errors
npm run dev             # App starts
# Then manually test:
# 1. Can create equipment
# 2. Can search equipment
# 3. Can sign in/out
# 4. Can access Stripe onboarding
```

### Full Feature Test Matrix
| Feature | Endpoint | Test |
|---------|----------|------|
| Create equipment | POST /api/equipment | Create, verify in DB |
| Search | POST /api/equipment/search | Search, check unfulfilled logging |
| Stripe onboard | POST /api/stripe/connect | Get onboarding URL |
| Checkout | POST /api/stripe/checkout | Create session |
| Vouch | POST /api/trust/vouch | Create vouch, check cards created |
| Network | GET /api/trust/network | Returns correct trust graph |
| Chat | POST /api/conversations | Creates conversation |
| Map | GET /app/map | Renders with equipment pins |

---

## ⚠️ Common Mistakes to Avoid

1. **Don't rename existing API routes** — Add new ones instead
2. **Don't change User.id type** — Everything references it
3. **Don't remove existing Equipment fields** — Only add new ones
4. **Don't skip TypeScript** — All new code must be typed
5. **Don't inline styles in JSX** — Use Tailwind or CSS classes
6. **Don't add dependencies without checking** — Some may conflict
7. **Don't modify Stripe webhook logic** — It's working
8. **Don't change auth session structure** — Many things depend on it

---

## 📁 Final File Structure

```
peak-rentals/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/  # Existing - DON'T TOUCH
│   │   ├── equipment/           # Existing - DON'T TOUCH
│   │   ├── stripe/              # Existing - DON'T TOUCH
│   │   ├── analytics/           # Existing - DON'T TOUCH
│   │   ├── trust/               # NEW
│   │   │   ├── vouch/route.ts
│   │   │   ├── network/route.ts
│   │   │   └── visible-equipment/route.ts
│   │   ├── cards/route.ts       # NEW
│   │   ├── conversations/       # NEW
│   │   │   ├── route.ts
│   │   │   └── [id]/messages/route.ts
│   │   └── peaks/               # NEW
│   │       ├── balance/route.ts
│   │       └── chest/route.ts
│   ├── map/page.tsx             # NEW - Primary interface
│   ├── cards/page.tsx           # NEW
│   ├── chat/[id]/page.tsx       # NEW
│   ├── browse/page.tsx          # Update styling
│   ├── equipment/[id]/page.tsx  # Add MessageOwnerButton
│   └── layout.tsx               # Add fonts
├── components/
│   ├── map/                     # NEW
│   ├── cards/                   # NEW
│   ├── chat/                    # NEW
│   ├── ui/                      # NEW Peak components
│   └── [existing...]            # Restyle only
├── lib/
│   ├── auth.ts                  # DON'T TOUCH
│   ├── prisma.ts                # DON'T TOUCH
│   ├── stripe.ts                # DON'T TOUCH
│   ├── weblink.ts               # NEW
│   └── peaks.ts                 # NEW
├── prisma/
│   └── schema.prisma            # ADD new models only
├── tailwind.config.js           # UPDATE with Peak colors
└── app/globals.css              # UPDATE with Peak styles
```

---

## 🎯 Success Criteria

Before declaring "done", verify:

- [ ] All existing features work unchanged
- [ ] Map displays equipment from trust network only
- [ ] Vouch system creates proper trust chains
- [ ] Chat works between trusted users
- [ ] Chat blocked for non-network users
- [ ] Peaks awarded for actions
- [ ] Aesthetic is consistently "ski chalet"
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] Mobile responsive
