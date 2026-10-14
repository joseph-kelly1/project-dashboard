"use client";

// Only client component in the app: native confirm() before destructive posts.
export function DeleteButton({
  label = "Delete",
  confirmText,
}: {
  label?: string;
  confirmText: string;
}) {
  return (
    <button
      type="submit"
      className="btn-outline"
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
