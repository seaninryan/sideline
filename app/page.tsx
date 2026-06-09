import { createClient } from "@/lib/supabase/server";
import Landing from "@/components/Landing";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return <Landing userId={user?.id ?? null} email={user?.email ?? null} />;
}
