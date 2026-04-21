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

  // Al ingelogd? → meteen door.
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
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <Link
            to="/"
            className="font-display text-3xl font-semibold tracking-tight text-ink"
          >
            De Tracémolen
          </Link>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            Engineering copilot · Vayu Solutions
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <h1 className="font-display text-2xl text-ink">
            {mode === "signin" ? "Inloggen" : "Account aanmaken"}
          </h1>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            {mode === "signin"
              ? "Voer je e-mail en wachtwoord in."
              : "Maak een nieuw engineer-account aan."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-sans">
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-sans">
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
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-sans text-sm text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-md border border-border bg-muted px-3 py-2 font-sans text-sm text-ink">
                {info}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink text-paper hover:bg-ink/90"
            >
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
                className="text-cyan underline-offset-4 hover:underline"
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
                className="text-cyan underline-offset-4 hover:underline"
              >
                Al een account? Inloggen
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center font-sans text-xs text-muted-foreground">
          MVP-1 · alleen e-mail + wachtwoord. Geen social login.
        </p>
      </div>
    </main>
  );
}
