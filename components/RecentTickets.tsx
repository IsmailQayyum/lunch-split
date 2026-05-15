"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

function relTime(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function RecentTickets() {
  const items = useRecent();
  if (items.length === 0) return null;
  return (
    <div>
      <div className="eyebrow text-center mb-4">YOUR DRAWER · LAST {items.length}</div>
      <div className="space-y-1">
        {items.map((it, i) => (
          <Link
            key={it.slug}
            href={`/t/${it.slug}`}
            className="block group animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="line-item py-2 hover:text-saffron transition-colors">
              <span className="text-sm">
                <span className="display-italic text-[19px] mr-2">{it.title}</span>
              </span>
              <span className="leader" />
              <span className="text-[11px] text-ink-faint group-hover:text-saffron">
                {relTime(it.visited)} · /{it.slug}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
