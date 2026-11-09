"use client";

/** Errors in the root layout itself: plain markup, no app styles needed. */
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#14161b", color: "#e8e8ea", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#a0a4ad" }}>Your script is saved automatically. Reload to continue.</p>
          <button onClick={() => window.location.reload()} style={{ background: "#e8b04a", border: 0, borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
