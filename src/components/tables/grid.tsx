"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { AgGridReactProps } from "ag-grid-react";

const LoadedGrid = dynamic(() => import("ag-grid-react").then((mod) => mod.AgGridReact), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center text-[12px] text-ink-muted">
      Initializing ledger grid…
    </div>
  ),
});

/**
 * AG Grid's React component is generic over row data. Wrapping the dynamic
 * import preserves that generic so column definitions stay type-checked.
 */
export const DataGrid = LoadedGrid as unknown as <TData>(
  props: AgGridReactProps<TData>,
) => React.ReactElement;
