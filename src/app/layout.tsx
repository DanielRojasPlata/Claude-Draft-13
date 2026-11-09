import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "@fontsource/courier-prime/400-italic.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Guionista", description: "Screenplay editor" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
