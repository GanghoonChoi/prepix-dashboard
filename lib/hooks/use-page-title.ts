"use client";

import { useEffect } from "react";

/**
 * Sets the document title for a client-rendered page. Client pages can't export
 * Next's `metadata`, so we set it imperatively. Restores the base title on
 * unmount so a stale page title never lingers during navigation.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — Prepix`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
