import { Suspense } from "react";
import { AdminTasks } from "./admin-tasks";

export const metadata = { title: "Tareas del equipo" };

export default function AdminTasksPage() {
  return (
    <Suspense>
      <AdminTasks />
    </Suspense>
  );
}
