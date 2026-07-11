"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeNote, reorderNotes, updateNote } from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import { Linkify } from "@/components/forms";
import { NoteFields } from "@/components/note-fields";
import type { Note } from "@/lib/types";

export function NoteBoard({ notes }: { notes: Note[] }) {
  const [order, setOrder] = useState(() => notes.map((note) => note.id));
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startTransition] = useTransition();
  const draggedId = useRef<string | null>(null);
  const serverIds = notes.map((note) => note.id).join(",");

  useEffect(() => {
    setOrder(serverIds ? serverIds.split(",") : []);
  }, [serverIds]);

  const byId = new Map(notes.map((note) => [note.id, note]));
  const tags = Array.from(
    new Map(
      notes
        .flatMap((note) => note.tags)
        .map((tag) => [tag.toLowerCase(), tag]),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));
  const tagKeys = tags.map((tag) => tag.toLowerCase()).join(",");

  useEffect(() => {
    if (
      selectedTag &&
      !tagKeys.split(",").includes(selectedTag.toLowerCase())
    ) {
      setSelectedTag(null);
    }
  }, [selectedTag, tagKeys]);

  const visibleIds = order.filter((id) => {
    if (!selectedTag) return true;
    return byId
      .get(id)
      ?.tags.some(
        (tag) => tag.toLowerCase() === selectedTag.toLowerCase(),
      );
  });

  function persist(next: string[], movedId: string) {
    setOrder(next);
    const moved = byId.get(movedId);
    setAnnouncement(`${moved?.title ?? "Note"} moved.`);
    startTransition(() => reorderNotes(next));
  }

  function reorderedVisible(fromId: string, toId: string): string[] | null {
    if (fromId === toId) return null;
    const from = visibleIds.indexOf(fromId);
    const to = visibleIds.indexOf(toId);
    if (from < 0 || to < 0) return null;
    const nextVisible = [...visibleIds];
    const [moved] = nextVisible.splice(from, 1);
    nextVisible.splice(to, 0, moved);
    let visibleIndex = 0;
    return order.map((id) =>
      visibleIds.includes(id) ? nextVisible[visibleIndex++] : id,
    );
  }

  function move(id: string, offset: -1 | 1) {
    const at = visibleIds.indexOf(id);
    const target = visibleIds[at + offset];
    if (!target) return;
    const next = reorderedVisible(id, target);
    if (next) persist(next, id);
  }

  return (
    <>
      {tags.length > 0 && (
        <nav className="note-filters" aria-label="Filter notes by tag">
          <span className="note-filter-label">Filter</span>
          <button
            className="note-filter"
            type="button"
            aria-pressed={selectedTag === null}
            onClick={() => setSelectedTag(null)}
          >
            All <span>{notes.length}</span>
          </button>
          {tags.map((tag) => {
            const count = notes.filter((note) =>
              note.tags.some(
                (value) => value.toLowerCase() === tag.toLowerCase(),
              ),
            ).length;
            return (
              <button
                className="note-filter"
                type="button"
                key={tag.toLowerCase()}
                aria-pressed={selectedTag === tag}
                onClick={() => setSelectedTag(tag)}
              >
                {tag} <span>{count}</span>
              </button>
            );
          })}
        </nav>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {visibleIds.length === 0 ? (
        <p className="card empty note-empty">
          No notes match this tag. Choose another filter to bring them back.
        </p>
      ) : (
        <div className="note-grid" aria-busy={isPending}>
          {visibleIds.map((id, index) => {
            const note = byId.get(id);
            if (!note) return null;
            const isExpanded = expandedId === note.id;
            return (
              <article
                className={`note-card${isExpanded ? " note-card-expanded" : ""}`}
                key={note.id}
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (
                    target.closest(
                      "button, a, input, textarea, summary, details, form",
                    ) ||
                    window.getSelection()?.toString()
                  ) {
                    return;
                  }
                  setExpandedId(isExpanded ? null : note.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const fromId = draggedId.current;
                  draggedId.current = null;
                  if (!fromId) return;
                  const next = reorderedVisible(fromId, note.id);
                  if (next) persist(next, fromId);
                }}
              >
                <div className="note-card-head">
                  <button
                    className="note-drag-handle"
                    type="button"
                    draggable={!isPending}
                    title="Drag to reorder"
                    aria-label={`Drag ${note.title} to reorder`}
                    onDragStart={(event) => {
                      draggedId.current = note.id;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", note.id);
                    }}
                    onDragEnd={() => {
                      draggedId.current = null;
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                  </button>
                  <h2>
                    <button
                      className="note-title-button"
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${note.title}`}
                      onClick={() => setExpandedId(isExpanded ? null : note.id)}
                    >
                      <span>{note.title}</span>
                      <span className="note-expand-label" aria-hidden="true">
                        {isExpanded ? "Collapse" : "Read"}
                      </span>
                    </button>
                  </h2>
                  <div className="note-move-controls">
                    <button
                      type="button"
                      aria-label={`Move ${note.title} earlier`}
                      title="Move earlier"
                      disabled={index === 0 || isPending}
                      onClick={() => move(note.id, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${note.title} later`}
                      title="Move later"
                      disabled={index === visibleIds.length - 1 || isPending}
                      onClick={() => move(note.id, 1)}
                    >
                      →
                    </button>
                  </div>
                </div>

                {note.tags.length > 0 && (
                  <div className="note-tags" aria-label="Tags">
                    {note.tags.map((tag) => (
                      <button
                        type="button"
                        className="note-tag"
                        key={tag.toLowerCase()}
                        onClick={() => setSelectedTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {note.body ? (
                  <p className="note-body">
                    <Linkify text={note.body} />
                  </p>
                ) : (
                  <p className="note-body note-body-empty">No text yet.</p>
                )}

                <div className="note-card-actions">
                  <details>
                    <summary>Edit</summary>
                    <form action={updateNote} className="stack details-body">
                      <input type="hidden" name="id" value={note.id} />
                      <NoteFields note={note} />
                      <div>
                        <button className="btn" type="submit">
                          Save note
                        </button>
                      </div>
                    </form>
                  </details>
                  <form action={removeNote}>
                    <input type="hidden" name="id" value={note.id} />
                    <DeleteButton
                      label="Delete"
                      confirmText={`Delete note "${note.title}"?`}
                    />
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
