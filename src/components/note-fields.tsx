import type { Note } from "@/lib/types";

export function NoteFields({ note }: { note?: Note }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`note-title-${note?.id ?? "new"}`}>Title</label>
        <input
          id={`note-title-${note?.id ?? "new"}`}
          name="title"
          defaultValue={note?.title}
          maxLength={120}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`note-body-${note?.id ?? "new"}`}>Note</label>
        <textarea
          id={`note-body-${note?.id ?? "new"}`}
          className="note-textarea"
          name="body"
          defaultValue={note?.body}
          maxLength={10_000}
          placeholder="Write anything you want to keep handy…"
        />
      </div>
      <div className="field">
        <label htmlFor={`note-tags-${note?.id ?? "new"}`}>
          Tags (comma separated)
        </label>
        <input
          id={`note-tags-${note?.id ?? "new"}`}
          name="tags"
          defaultValue={note?.tags.join(", ")}
          maxLength={500}
          placeholder="Idea, launch, follow-up"
        />
      </div>
    </>
  );
}
