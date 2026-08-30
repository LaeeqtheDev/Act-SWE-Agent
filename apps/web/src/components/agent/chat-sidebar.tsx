"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2, Settings } from "lucide-react";

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onClearEmpty,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onClearEmpty?: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <aside className="w-64 shrink-0 border-r flex flex-col h-full">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md border hover:bg-muted/50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {conversations.map((c) => (
          <div
            key={c.id}
            onMouseEnter={() => setHoveredId(c.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelect(c.id)}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded-md text-sm cursor-pointer transition-colors ${
              activeId === c.id ? "bg-muted" : "hover:bg-muted/50"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate flex-1 text-xs">{c.title || "New chat"}</span>
            {hoveredId === c.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t space-y-1">
        {onClearEmpty && conversations.some((c) => !c.title) && (
          <button
            onClick={onClearEmpty}
            className="w-full flex items-center gap-2 text-xs px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
          >
            <Trash2 className="h-3 w-3" /> Clear empty chats
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground"
        >
          <Settings className="h-3.5 w-3.5" /> Model & API key
        </button>
      </div>
    </aside>
  );
}
