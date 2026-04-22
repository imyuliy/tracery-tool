// Client-side middleware: stuurt het huidige Supabase access_token mee
// als Authorization: Bearer <token> bij elke server-fn aanroep.
// Server-fns met requireSupabaseAuth verwachten deze header.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const withSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      sendContext: {},
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
