import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Settings, ChevronDown, BookOpen, Cog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { displayName, useSupabaseAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopNav() {
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <header className="border-b border-border bg-paper/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          to="/dashboard"
          className="group inline-flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-ink transition-colors hover:text-blood"
        >
          <Cog className="h-7 w-7 text-blood drop-shadow-[0_0_10px_oklch(0.60_0.22_24/0.55)] transition-transform duration-700 ease-out group-hover:rotate-90" strokeWidth={1.75} />
          De Tracémolen
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 font-sans"
            >
              <span className="hidden sm:inline">{displayName(user)}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-ink/50">
              {user?.email ?? "Niet ingelogd"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/admin/eisenpakketten" })}
              className="cursor-pointer"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Eisenpakketten
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/settings" })}
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              Instellingen
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleSignOut}
              disabled={signingOut}
              className="cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Uitloggen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
