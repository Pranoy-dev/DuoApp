import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from("todos").select();

  return (
    <ul className="safe-x p-4">
      {todos?.map((todo: { id: string; name: string }) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  );
}
