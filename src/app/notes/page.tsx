import Link from "next/link";
import { createNote } from "@/app/actions";
import { ErrorBanner } from "@/components/forms";
import { NoteBoard } from "@/components/note-board";
import { NoteFields } from "@/components/note-fields";
import { listNotes } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [sp, notes] = await Promise.all([searchParams, listNotes()]);

  return (
    <main className="page page-wide">
      <header className="notes-heading">
        <div>
          <Link href="/" className="back" aria-label="Back to dashboard">
            ←
          </Link>
          <h1>Notes</h1>
          <p className="muted">
            Keep ideas, decisions, and useful details within reach.
          </p>
        </div>
        <details className="note-create">
          <summary>Create new note</summary>
          <form action={createNote} className="stack details-body">
            <NoteFields />
            <div>
              <button className="btn" type="submit">
                Create note
              </button>
            </div>
          </form>
        </details>
      </header>

      <ErrorBanner message={sp.error} />

      {notes.length === 0 ? (
        <p className="card empty note-empty">
          Your board is ready. Create your first note for an idea, decision, or
          detail you want close at hand.
        </p>
      ) : (
        <NoteBoard notes={notes} />
      )}
    </main>
  );
}
