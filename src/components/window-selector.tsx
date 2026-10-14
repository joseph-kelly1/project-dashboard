import Link from "next/link";
import type { TimeWindow } from "@/lib/types";
import { TIME_WINDOWS } from "@/lib/types";

const LABELS: Record<TimeWindow, string> = {
  daily: "Daily",
  monthly: "Monthly",
  yearly: "Yearly",
  ytd: "Year to date",
  "all-time": "All time",
};

export function WindowSelector({
  current,
  basePath,
  params = {},
}: {
  current: TimeWindow;
  basePath: string;
  params?: Record<string, string>;
}) {
  return (
    <div className="tabs">
      {TIME_WINDOWS.map((w) => {
        const q = new URLSearchParams({ ...params, window: w });
        return (
          <Link
            key={w}
            href={`${basePath}?${q}`}
            scroll={false}
            aria-current={w === current ? "true" : undefined}
          >
            {LABELS[w]}
          </Link>
        );
      })}
    </div>
  );
}
