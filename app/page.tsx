import { createClient } from "@/lib/supabase/server";
import SignInGate from "@/components/SignInGate";
import EditorApp from "@/components/EditorApp";

export default async function Home({ searchParams }: { searchParams: { auth_error?: string } }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return <SignInGate initialError={searchParams.auth_error ? "Sign-in failed — please try again." : ""} />;
  }
  return <EditorApp />;
}
