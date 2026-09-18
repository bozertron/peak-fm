> **ARCHIVED.** These five documents describe the previous product direction and
> a stack this repository does not use (Prisma, NextAuth, Stripe Connect). They
> are retained as history. Do not implement from them — see `../README.md`.

# Peak Rentals: Map Interface Implementation

## Overview

The map is not a feature—it is THE interface. Users explore their community spatially, discovering equipment through location, not lists. The map reveals only what your trust network makes visible.

---

## Technology Stack

```bash
# Map library (Mapbox GL or Leaflet)
npm install mapbox-gl
# or
npm install leaflet react-leaflet

# Clustering for many pins
npm install supercluster
```

---

## Part 1: Map Container Component

### File: `components/map/PeakMap.tsx`

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { EquipmentPopup } from "./EquipmentPopup";
import { OwnerCard } from "./OwnerCard";

// Set your Mapbox token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface MapEquipment {
  id: string;
  title: string;
  category: string;
  dailyRate: number;
  latitude: number;
  longitude: number;
  owner: {
    id: string;
    name: string;
    avatarUrl?: string;
    flavor?: string;
  };
}

interface PeakMapProps {
  equipment: MapEquipment[];
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  onEquipmentClick?: (equipment: MapEquipment) => void;
}

// Big White coordinates
const BIG_WHITE_CENTER: [number, number] = [-118.9367, 49.7231];
const DEFAULT_ZOOM = 13;

export function PeakMap({ 
  equipment, 
  center = BIG_WHITE_CENTER, 
  zoom = DEFAULT_ZOOM,
  onEquipmentClick 
}: PeakMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [selectedEquipment, setSelectedEquipment] = useState<MapEquipment | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11", // Light style matches aesthetic
      center,
      zoom,
      pitch: 0,
      bearing: 0,
    });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    // Disable scroll zoom until user clicks map
    map.current.scrollZoom.disable();
    map.current.on("click", () => {
      map.current?.scrollZoom.enable();
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [center, zoom]);

  // Add/update markers
  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    equipment.forEach(item => {
      // Create custom marker element
      const el = document.createElement("div");
      el.className = "peak-map-marker";
      el.innerHTML = `
        <div class="peak-pin" data-category="${item.category}">
          ${getCategoryEmoji(item.category)}
        </div>
      `;

      // Create marker
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([item.longitude, item.latitude])
        .addTo(map.current!);

      // Click handler
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedEquipment(item);
        
        // Get screen position for popup
        const point = map.current!.project([item.longitude, item.latitude]);
        setPopupPosition({ x: point.x, y: point.y });
        
        // Pan to marker
        map.current!.easeTo({
          center: [item.longitude, item.latitude],
          offset: [0, -100],
          duration: 500,
        });
        
        onEquipmentClick?.(item);
      });

      markersRef.current.push(marker);
    });
  }, [equipment, onEquipmentClick]);

  // Close popup on map click
  useEffect(() => {
    if (!map.current) return;
    
    const handleMapClick = () => {
      setSelectedEquipment(null);
      setPopupPosition(null);
    };

    map.current.on("click", handleMapClick);
    
    return () => {
      map.current?.off("click", handleMapClick);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div 
        ref={mapContainer} 
        className="w-full h-full"
        style={{ minHeight: "500px" }}
      />
      
      {/* Equipment Popup */}
      {selectedEquipment && popupPosition && (
        <div
          className="absolute z-10 transform -translate-x-1/2"
          style={{
            left: popupPosition.x,
            top: popupPosition.y - 20,
          }}
        >
          <EquipmentPopup
            equipment={selectedEquipment}
            onClose={() => {
              setSelectedEquipment(null);
              setPopupPosition(null);
            }}
          />
        </div>
      )}
      
      {/* Custom CSS for markers */}
      <style jsx global>{`
        .peak-map-marker {
          cursor: pointer;
        }
        
        .peak-pin {
          width: 40px;
          height: 40px;
          background: #FFFFFF;
          border-radius: 50%;
          border: 2px solid #D4A574;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          box-shadow: 0 2px 8px rgba(44, 62, 80, 0.15);
          transition: all 0.2s ease;
          position: relative;
        }
        
        .peak-pin::after {
          content: '';
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%) rotate(45deg);
          width: 8px;
          height: 8px;
          background: #FFFFFF;
          border-right: 2px solid #D4A574;
          border-bottom: 2px solid #D4A574;
        }
        
        .peak-pin:hover {
          transform: scale(1.15);
          box-shadow: 0 4px 16px rgba(44, 62, 80, 0.25);
          border-color: #2D5A47;
        }
        
        .peak-map-marker.selected .peak-pin {
          background: #2D5A47;
          border-color: #2D5A47;
          transform: scale(1.2);
        }
        
        .peak-map-marker.selected .peak-pin::after {
          background: #2D5A47;
          border-color: #2D5A47;
        }
      `}</style>
    </div>
  );
}

// Category to emoji mapping
function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    "Telehandler": "🏗️",
    "Heavy Equipment": "🏗️",
    "Boom Lift": "⬆️",
    "Aerial Lift": "⬆️",
    "Skid Steer": "🚜",
    "Vehicle": "🚗",
    "Tools": "🔧",
    "Recreation": "🎿",
    "Winter Sports": "🎿",
    "Camping": "⛺",
    "Water Sports": "🚣",
  };
  return map[category] || "📦";
}
```

---

## Part 2: Equipment Popup Component

### File: `components/map/EquipmentPopup.tsx`

```tsx
"use client";

import Link from "next/link";

interface EquipmentPopupProps {
  equipment: {
    id: string;
    title: string;
    category: string;
    dailyRate: number;
    owner: {
      id: string;
      name: string;
      avatarUrl?: string;
      flavor?: string;
    };
  };
  onClose: () => void;
}

export function EquipmentPopup({ equipment, onClose }: EquipmentPopupProps) {
  return (
    <div className="bg-peak-snow rounded-peak shadow-peak-lg p-4 w-72 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-peak-stone/50 
                   flex items-center justify-center text-peak-slate hover:bg-peak-stone"
      >
        ✕
      </button>
      
      {/* Wood accent */}
      <div className="peak-wood-accent w-10 mb-3" />
      
      {/* Title */}
      <h3 className="font-serif text-peak-charcoal text-lg leading-tight mb-2">
        {equipment.title}
      </h3>
      
      {/* Category & Price */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-wider text-peak-slate">
          {equipment.category}
        </span>
        <span className="font-semibold text-peak-forest">
          ${(equipment.dailyRate / 100).toFixed(0)}
          <span className="text-peak-slate font-normal text-sm">/day</span>
        </span>
      </div>
      
      {/* Owner */}
      <div className="flex items-center gap-3 p-3 bg-peak-cream/50 rounded-lg mb-4">
        <div className="w-10 h-10 rounded-lg bg-peak-forest/10 flex items-center justify-center">
          {equipment.owner.avatarUrl ? (
            <img 
              src={equipment.owner.avatarUrl} 
              alt="" 
              className="w-full h-full rounded-lg object-cover"
            />
          ) : (
            <span className="font-serif text-peak-forest">
              {equipment.owner.name.charAt(0)}
            </span>
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-peak-charcoal">
            {equipment.owner.name}
          </div>
          {equipment.owner.flavor && (
            <div className="text-xs text-peak-slate">{equipment.owner.flavor}</div>
          )}
        </div>
      </div>
      
      {/* Action */}
      <Link
        href={`/equipment/${equipment.id}`}
        className="block w-full py-2.5 text-center bg-peak-forest text-white 
                   rounded-peak font-medium hover:bg-peak-forest/90 transition-colors"
      >
        View Details
      </Link>
    </div>
  );
}
```

---

## Part 3: Map Filter Bar

### File: `components/map/MapFilters.tsx`

```tsx
"use client";

import { useState } from "react";

interface MapFiltersProps {
  categories: string[];
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  networkStats: {
    direct: number;
    extended: number;
    total: number;
  };
}

export function MapFilters({ 
  categories, 
  selectedCategory, 
  onCategoryChange,
  networkStats 
}: MapFiltersProps) {
  const [showNetworkInfo, setShowNetworkInfo] = useState(false);

  return (
    <div className="absolute top-4 left-4 z-10 space-y-3">
      {/* Category Filter */}
      <div className="bg-peak-snow rounded-peak shadow-peak p-2 flex gap-1 flex-wrap max-w-sm">
        <button
          onClick={() => onCategoryChange(null)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${selectedCategory === null 
              ? 'bg-peak-forest text-white' 
              : 'text-peak-charcoal hover:bg-peak-stone/50'}`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selectedCategory === cat 
                ? 'bg-peak-forest text-white' 
                : 'text-peak-charcoal hover:bg-peak-stone/50'}`}
          >
            {cat}
          </button>
        ))}
      </div>
      
      {/* Network Info */}
      <div className="relative">
        <button
          onClick={() => setShowNetworkInfo(!showNetworkInfo)}
          className="bg-peak-snow rounded-peak shadow-peak px-4 py-2 flex items-center gap-2
                     hover:shadow-peak-lg transition-shadow"
        >
          <span className="text-peak-forest text-lg">🔗</span>
          <span className="text-sm text-peak-charcoal">
            {networkStats.total} people in network
          </span>
        </button>
        
        {showNetworkInfo && (
          <div className="absolute top-full left-0 mt-2 bg-peak-snow rounded-peak shadow-peak-lg p-4 w-64">
            <h4 className="font-serif text-peak-charcoal mb-3">Your Network</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-peak-slate">Direct connections</span>
                <span className="font-medium text-peak-forest">{networkStats.direct}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-peak-slate">Extended (via others)</span>
                <span className="font-medium text-peak-charcoal">{networkStats.extended}</span>
              </div>
              <div className="pt-2 border-t border-peak-stone flex justify-between">
                <span className="text-peak-charcoal font-medium">Total visible</span>
                <span className="font-medium text-peak-charcoal">{networkStats.total}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-peak-slate">
              You can only see equipment from people in your trusted network.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Part 4: Full Map Page

### File: `app/map/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PeakMap } from "@/components/map/PeakMap";
import { MapFilters } from "@/components/map/MapFilters";
import { OwnerCard } from "@/components/map/OwnerCard";

interface MapEquipment {
  id: string;
  title: string;
  category: string;
  dailyRate: number;
  latitude: number;
  longitude: number;
  owner: {
    id: string;
    name: string;
    avatarUrl?: string;
    flavor?: string;
  };
}

interface NetworkStats {
  direct: number;
  extended: number;
  total: number;
}

export default function MapPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [equipment, setEquipment] = useState<MapEquipment[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<MapEquipment[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStats>({ direct: 0, extended: 0, total: 0 });
  const [selectedOwner, setSelectedOwner] = useState<MapEquipment["owner"] | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth check
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Fetch network and equipment
  useEffect(() => {
    if (!session?.user?.id) return;

    async function fetchData() {
      try {
        // Fetch network stats
        const networkRes = await fetch("/api/trust/network");
        const networkData = await networkRes.json();
        setNetworkStats(networkData.stats);

        // Fetch visible equipment
        const equipmentRes = await fetch("/api/trust/visible-equipment");
        const equipmentData = await equipmentRes.json();
        
        // Filter to only equipment with location data
        const withLocation = equipmentData.equipment.filter(
          (e: any) => e.owner?.latitude && e.owner?.longitude
        ).map((e: any) => ({
          ...e,
          latitude: e.owner.latitude,
          longitude: e.owner.longitude,
        }));

        setEquipment(withLocation);
        setFilteredEquipment(withLocation);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(withLocation.map((e: any) => e.category))];
        setCategories(uniqueCategories as string[]);
      } catch (error) {
        console.error("Failed to fetch map data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [session?.user?.id]);

  // Filter by category
  useEffect(() => {
    if (selectedCategory) {
      setFilteredEquipment(equipment.filter(e => e.category === selectedCategory));
    } else {
      setFilteredEquipment(equipment);
    }
  }, [selectedCategory, equipment]);

  if (status === "loading" || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-peak-cream">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-peak-forest/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl animate-pulse">⛰️</span>
          </div>
          <p className="text-peak-slate">Loading your network...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen relative">
      {/* Map */}
      <PeakMap
        equipment={filteredEquipment}
        onEquipmentClick={(item) => setSelectedOwner(item.owner)}
      />
      
      {/* Filters */}
      <MapFilters
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        networkStats={networkStats}
      />
      
      {/* Selected Owner Sidebar */}
      {selectedOwner && (
        <div className="absolute top-4 right-4 z-10 w-80">
          <OwnerCard
            owner={selectedOwner}
            onClose={() => setSelectedOwner(null)}
          />
        </div>
      )}
      
      {/* Empty State */}
      {filteredEquipment.length === 0 && !loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-peak-snow rounded-peak shadow-peak-lg p-8 text-center max-w-sm pointer-events-auto">
            <div className="w-16 h-16 rounded-full bg-peak-forest/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🗺️</span>
            </div>
            <h3 className="font-serif text-xl text-peak-charcoal mb-2">
              {selectedCategory ? "No equipment in this category" : "Your map is empty"}
            </h3>
            <p className="text-peak-slate text-sm mb-4">
              {selectedCategory 
                ? "Try selecting a different category or expand your network."
                : "As your network grows, equipment from trusted connections will appear here."
              }
            </p>
            {!selectedCategory && (
              <button className="px-4 py-2 bg-peak-forest text-white rounded-peak font-medium">
                Invite Someone
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Part 5: Owner Card (Sidebar)

### File: `components/map/OwnerCard.tsx`

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface OwnerCardProps {
  owner: {
    id: string;
    name: string;
    avatarUrl?: string;
    flavor?: string;
  };
  onClose: () => void;
}

interface OwnerEquipment {
  id: string;
  title: string;
  category: string;
  dailyRate: number;
}

export function OwnerCard({ owner, onClose }: OwnerCardProps) {
  const [equipment, setEquipment] = useState<OwnerEquipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOwnerEquipment() {
      try {
        const res = await fetch(`/api/equipment?ownerId=${owner.id}`);
        const data = await res.json();
        setEquipment(data.equipment || []);
      } catch (error) {
        console.error("Failed to fetch owner equipment:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchOwnerEquipment();
  }, [owner.id]);

  return (
    <div className="bg-peak-snow rounded-peak shadow-peak-lg overflow-hidden">
      {/* Header */}
      <div className="relative p-6 bg-gradient-to-br from-peak-forest/10 to-peak-cream">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-peak-snow/80 
                     flex items-center justify-center text-peak-slate hover:bg-peak-snow"
        >
          ✕
        </button>
        
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-peak-snow border-2 border-peak-wood-light/30 
                          flex items-center justify-center shadow-sm">
            {owner.avatarUrl ? (
              <img 
                src={owner.avatarUrl} 
                alt="" 
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <span className="text-2xl font-serif text-peak-forest">
                {owner.name.charAt(0)}
              </span>
            )}
          </div>
          
          <div>
            <h3 className="font-serif text-xl text-peak-charcoal">{owner.name}</h3>
            {owner.flavor && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs 
                               bg-peak-forest/10 text-peak-forest">
                {owner.flavor}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Equipment List */}
      <div className="p-4">
        <h4 className="text-xs uppercase tracking-wider text-peak-slate mb-3">
          Available Items ({equipment.length})
        </h4>
        
        {loading ? (
          <div className="py-8 text-center text-peak-slate">Loading...</div>
        ) : equipment.length === 0 ? (
          <div className="py-8 text-center text-peak-slate">No items available</div>
        ) : (
          <div className="space-y-2">
            {equipment.map(item => (
              <Link
                key={item.id}
                href={`/equipment/${item.id}`}
                className="block p-3 rounded-lg border border-peak-stone hover:border-peak-wood/30 
                           hover:bg-peak-cream/50 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-peak-charcoal text-sm">
                      {item.title}
                    </div>
                    <div className="text-xs text-peak-slate mt-0.5">
                      {item.category}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-peak-forest">
                    ${(item.dailyRate / 100).toFixed(0)}/day
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="p-4 border-t border-peak-stone flex gap-2">
        <Link
          href={`/profile/${owner.id}`}
          className="flex-1 py-2 text-center text-sm font-medium text-peak-charcoal 
                     border border-peak-wood/30 rounded-peak hover:bg-peak-cream/50"
        >
          View Profile
        </Link>
        <button
          className="flex-1 py-2 text-center text-sm font-medium text-white 
                     bg-peak-burgundy rounded-peak hover:bg-peak-burgundy/90"
        >
          Message
        </button>
      </div>
    </div>
  );
}
```

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_mapbox_token_here
```

---

## Styling Notes

1. **Map tiles**: Use Mapbox "light" style for consistency with cream/warm aesthetic
2. **Pin shadows**: Soft, not harsh—matches overall shadow system
3. **Pin border**: Uses `woodLight` color to tie into palette
4. **Hover states**: Scale up gently, never jarring
5. **Animations**: All 200-300ms, ease curves

---

## Testing Checklist

- [ ] Map loads with correct center (Big White)
- [ ] Equipment pins appear at correct locations
- [ ] Only trusted network equipment visible
- [ ] Category filter works
- [ ] Pin click shows popup
- [ ] Popup links to equipment detail
- [ ] Owner card loads equipment list
- [ ] Empty state displays when no equipment
- [ ] Mobile responsive (touch targets adequate)
