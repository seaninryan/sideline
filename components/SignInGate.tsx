"use client";
import React, { useState } from "react";
import SignIn from "@/components/SignIn";
import { createClient } from "@/lib/supabase/client";

export default function SignInGate({ initialError }: { initialError?: string }) {
  const [err, setErr] = useState(initialError || "");
  const [phase, setPhase] = useState<"" | "wait">(""); // "" = idle (button enabled), "wait" = redirecting (button disabled)
  const onSignIn = async () => {
    setPhase("wait");
    const sb = createClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setErr(error.message); setPhase(""); }
  };
  return <SignIn phase={phase} err={err} onSignIn={onSignIn} />;
}
