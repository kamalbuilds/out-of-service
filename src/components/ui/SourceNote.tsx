import type { ReactNode } from "react";

/**
 * Every number on this page carries the query that produced it. Click or tab
 * to the dotted value and the dataset, the exact query and the row count open
 * underneath it.
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
      <div className="mt-1 max-w-md border-l-2 border-ink bg-white px-2 py-1 font-mono text-[0.6875rem] leading-snug text-muted">
        {dataset ? <div>{dataset}</div> : null}
        {rows !== undefined ? <div>{rows.toLocaleString("en-US")} rows</div> : null}
        {query ? <div className="break-all">{query}</div> : null}
        {fetchedAt ? <div>fetched {new Date(fetchedAt).toLocaleString("en-US")}</div> : null}
      </div>
    </details>
  );
}
