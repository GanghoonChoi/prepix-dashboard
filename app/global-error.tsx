"use client";

import { useEffect } from "react";

// Catches errors thrown in the root layout itself. It replaces the entire
// document, so it must render its own <html>/<body>. Kept dependency-free and
// inline-styled since app providers/styles may not be available at this point.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 600, margin: 0 }}>
            문제가 발생했어요 / Something went wrong
          </h1>
          <p style={{ fontSize: "14px", opacity: 0.6, marginTop: "8px" }}>
            예상치 못한 오류가 발생했어요. 다시 시도해 주세요. / An unexpected error
            occurred. Please try again.
          </p>
        </div>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            fontSize: "14px",
            borderRadius: "6px",
            border: "1px solid #2a2a2a",
            background: "#fafafa",
            color: "#0a0a0a",
            cursor: "pointer",
          }}
        >
          다시 시도 / Try again
        </button>
      </body>
    </html>
  );
}
