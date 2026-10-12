import { Suspense } from "react";
import { MyTasks } from "./my-tasks";

export const metadata = { title: "Mis tareas" };

export default function TasksPage() {
  return (
    <Suspense>
      <MyTasks />
    </Suspense>
  );
}
