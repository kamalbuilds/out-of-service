import type { ReactNode } from "react";

/**
 * Every number on this page carries the query that produced it. Click or tab to
 * the dotted value and the dataset, the exact query and the row count open under it.
 */
export function SourceNote({
  children,
  dataset,
  query,
  rows,
  fetchedAt,
  className = "",
}: {
  children: ReactNode;
  dataset?: string;
  query?: string;
  rows?: number;
  fetchedAt?: string;
  className?: string;
}) {
  if (!dataset && !query && rows === undefined) return <span className={className}>{children}</span>;
  return (
    <details className={`sourced inline-block align-baseline ${className}`}>
      <summary>{children}</summary>
      <div className="code mt-1.5 max-w-md rounded-plate border border-hair bg-paper-sunk px-2.5 py-2 text-[0.6875rem] leading-relaxed text-ink-soft">
        {dataset ? <div className="text-ink">{dataset}</div> : null}
        {rows !== undefined ? <div className="num">{rows.toLocaleString("en-US")} rows</div> : null}
        {query ? <div className="mt-0.5 break-all">{query}</div> : null}
        {fetchedAt ? <div className="num mt-0.5">fetched {new Date(fetchedAt).toLocaleString("en-US")}</div> : null}
      </div>
    </details>
  );
}
