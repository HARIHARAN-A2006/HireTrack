import type { Metadata } from "next";
import { ThemeToggle } from "@/app/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "HireTrack — Campus placements, clearly",
  description: "A calmer way to manage campus placements, applications, and candidate progress.",
  icons: {
    icon: "/hiretrack-icon.svg",
    shortcut: "/hiretrack-icon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark">
      <body><ThemeToggle />{children}</body>
    </html>
  );
}
