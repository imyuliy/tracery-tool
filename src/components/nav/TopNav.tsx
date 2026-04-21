import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Settings, ChevronDown } from "lucide-react";
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
    <header className="border-b border-border bg-paper">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          to="/dashboard"
          className="font-display text-xl font-semibold tracking-tight text-ink"
        >
          De Tracémolen
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="gap-2 font-sans text-ink hover:bg-muted"
            >
              <span className="hidden sm:inline">{displayName(user)}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-sans">
              {user?.email ?? "Niet ingelogd"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
