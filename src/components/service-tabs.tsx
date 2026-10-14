"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { reorderServices } from "@/app/actions";

interface Tab {
  id: string;
  name: string;
}

// Native HTML5 drag-and-drop; order updates locally on drop, then persists
// via the reorderServices action.
export function ServiceTabs({
  projectId,
  services,
  selectedId,
  win,
}: {
  projectId: string;
  services: Tab[];
  selectedId: string | null;
  win: string;
}) {
  const [order, setOrder] = useState(() => services.map((s) => s.id));
  const serverIds = services.map((s) => s.id).join();
  useEffect(() => {
    setOrder(serverIds ? serverIds.split(",") : []);
  }, [serverIds]);
  const dragFrom = useRef<number | null>(null);
  const [, startTransition] = useTransition();

  const byId = new Map(services.map((s) => [s.id, s]));

  function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    startTransition(() => reorderServices(projectId, next));
  }

  return (
    <div className="tabs">
      {order.map((id, i) => {
        const tab = byId.get(id);
        if (!tab) return null;
        return (
          <Link
            key={id}
            href={`/projects/${projectId}?window=${win}&service=${id}`}
            scroll={false}
            aria-current={selectedId === id ? "true" : undefined}
            draggable
            title="Drag to reorder"
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              drop(i);
            }}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
