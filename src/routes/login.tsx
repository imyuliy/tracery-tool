import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Inloggen — De Tracémolen" },
      {
        name: "description",
        content:
          "Log in op De Tracémolen, de engineering copilot voor MS-kabeltracé-ontwerpen van Vayu Solutions.",
      },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup";

function LoginPage() {
  const navigate = useNavigate();
  const { session } = useSupabaseAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else {
        const redirectTo =
          typeof window !== "undefined" ? window.location.origin : undefined;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setInfo(
          "Account aangemaakt. Controleer je inbox voor de bevestigingsmail.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      {/* Ambient blood-glow accents */}
      <div className="pointer-events-none absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-blood/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-ember/10 blur-[120px]" />

      <div className="relative w-full max-w-md">
        <div className="mb-10 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-display text-3xl font-semibold tracking-tight text-ink transition-colors hover:text-blood"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blood font-display text-base font-bold text-paper shadow-[0_0_20px_-2px_oklch(0.60_0.22_24/0.7)]">
              T
            </span>
            De Tracémolen
          </Link>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink/50">
            Engineering copilot · Vayu Solutions
          </p>
        </div>

        <div className="glass-strong rounded-xl p-8">
          <h1 className="font-display text-2xl text-ink">
            {mode === "signin" ? "Inloggen" : "Account aanmaken"}
          </h1>
          <p className="mt-1 font-sans text-sm text-ink/60">
            {mode === "signin"
              ? "Voer je e-mail en wachtwoord in."
              : "Maak een nieuw engineer-account aan."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-sans text-ink/80">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naam@vayusolutions.nl"
                className="bg-paper/70 text-ink placeholder:text-ink/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-sans text-ink/80">
                Wachtwoord
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-paper/70 text-ink placeholder:text-ink/30"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-sans text-sm text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-md border border-blood/30 bg-blood/10 px-3 py-2 font-sans text-sm text-ink">
                {info}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting
                ? "Bezig…"
                : mode === "signin"
                  ? "Inloggen"
                  : "Account aanmaken"}
            </Button>
          </form>

          <div className="mt-6 text-center font-sans text-sm">
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setInfo(null);
                }}
                className="text-blood underline-offset-4 transition-colors hover:text-ember hover:underline"
              >
                Nog geen account? Aanmaken
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                  setInfo(null);
                }}
                className="text-blood underline-offset-4 transition-colors hover:text-ember hover:underline"
              >
                Al een account? Inloggen
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-ink/40">
          MVP-1 · alleen e-mail + wachtwoord
        </p>
      </div>
    </main>
  );
}
