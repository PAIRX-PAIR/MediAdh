import { Suspense } from "react";
import { TeamScreen } from "./team-screen";

export const metadata = { title: "Equipo" };

export default function TeamPage() {
  return (
    <Suspense>
      <TeamScreen />
    </Suspense>
  );
}
