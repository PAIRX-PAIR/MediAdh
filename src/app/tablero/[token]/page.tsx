import type { Metadata } from "next";
import { BoardScreen } from "./board-screen";

export const metadata: Metadata = {
  title: "Tablero del taller",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Operators' queue without signing in (secret link; read-only). */
export default async function BoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BoardScreen token={token} />;
}
