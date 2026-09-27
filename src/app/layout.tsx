import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HireTrack — Campus placements, clearly",
  description: "A calmer way to manage campus placements, applications, and candidate progress.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
