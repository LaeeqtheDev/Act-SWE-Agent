"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { isHostedMode } from "@/lib/hosted-mode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

// Polled, not pushed — simple and reliable rather than needing a websocket
// or service worker for a first version. A workflow finishing or an agent
// incident firing while nobody's watching the chat shows up here.
export function NotificationBell({ apiUrl = API_URL, getToken }: { apiUrl?: string; getToken?: () => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    // In hosted mode the endpoint requires auth, so calling it before the
    // Clerk token has arrived produces a guaranteed 401 — and polling every
    // 30s turned that into a steady stream of unhandled rejections. Wait
    // for the token first.
    if (isHostedMode() && typeof getToken !== "function") return;
    try {
      const res = await fetch(`${apiUrl}/notifications`, { headers: await authHeaders() });
      if (!res.ok) return; // 401 before sign-in is expected, not an error worth surfacing
      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(typeof data.unread === "number" ? data.unread : 0);
    } catch {
      // quiet failure — a notification bell shouldn't be able to break the page
    }
  }, [apiUrl, authHeaders, getToken]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, [load]);

  async function openAndMarkRead(id: string) {
    await fetch(`${apiUrl}/notifications/${id}/read`, { method: "POST", headers: await authHeaders() });
    load();
  }

  async function markAllRead() {
    await fetch(`${apiUrl}/notifications/read-all`, { method: "POST", headers: await authHeaders() });
    load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warn ring-2 ring-background" />
        )}
      </button>

      {open && (
        <>
          {/* Click-outside layer — without this the panel only closes by
              hitting the bell again, which is easy to miss. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[22rem] rounded-lg border border-border bg-popover shadow-xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-medium text-foreground">
                Notifications{unread > 0 && <span className="text-muted-foreground"> · {unread} new</span>}
              </span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nothing yet.</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    Workflow results and agent alerts show up here.
                  </p>
                </div>
              )}
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || "/agent"}
                  onClick={() => {
                    openAndMarkRead(n.id);
                    setOpen(false);
                  }}
                  className="block px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors relative"
                >
                  {!n.read && <span className="absolute left-1.5 top-4 h-1.5 w-1.5 rounded-full bg-warn" />}
                  <p className={`text-sm pl-2 ${n.read ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 pl-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1 pl-2">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
