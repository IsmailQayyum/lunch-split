"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "./ui/card";

type Entry = { slug: string; title: string; visited: number };

const KEY = "lunch-split:recent";

export function useRecent() {
  const [items, setItems] = useState<Entry[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);
  return items;
}

export function recordVisit(slug: string, title: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: Entry[] = raw ? JSON.parse(raw) : [];
    const next = [
      { slug, title, visited: Date.now() },
      ...list.filter((x) => x.slug !== slug),
    ].slice(0, 10);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function RecentTickets() {
  const items = useRecent();
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wider text-muted mb-3">From this browser</h2>
      <div className="space-y-2">
        {items.map((it) => (
          <Link key={it.slug} href={`/t/${it.slug}`}>
            <Card className="text-sm py-3 px-4 hover:bg-border/20 transition cursor-pointer">
              {it.title}
              <span className="text-muted text-xs ml-2">/{it.slug}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
