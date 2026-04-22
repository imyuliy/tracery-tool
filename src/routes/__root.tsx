import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-semibold text-blood">404</h1>
        <h2 className="mt-4 font-display text-xl text-ink">Pagina niet gevonden</h2>
        <p className="mt-2 font-sans text-sm text-ink/60">
          De pagina die je zoekt bestaat niet of is verplaatst.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-blood px-4 py-2 font-sans text-sm font-medium text-paper transition-all hover:bg-ember hover:shadow-[0_0_24px_-4px_oklch(0.60_0.22_24/0.6)]"
          >
            Naar home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "De Tracémolen — Vayu Solutions" },
      {
        name: "description",
        content:
          "Engineering copilot voor MS-kabeltracé-ontwerpen van Vayu Solutions.",
      },
      { name: "author", content: "Vayu Solutions" },
      { property: "og:title", content: "De Tracémolen — Vayu Solutions" },
      {
        property: "og:description",
        content:
          "Engineering copilot voor MS-kabeltracé-ontwerpen van Vayu Solutions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "De Tracémolen — Vayu Solutions" },
      { name: "description", content: "TraceWise Copilot is an engineering copilot for MS cable route designs." },
      { property: "og:description", content: "TraceWise Copilot is an engineering copilot for MS cable route designs." },
      { name: "twitter:description", content: "TraceWise Copilot is an engineering copilot for MS cable route designs." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/400f9744-64d7-43a4-947f-0f0e64049048/id-preview-47685b69--9367b7e4-8cae-4a45-9281-7618a92b6cac.lovable.app-1776766210130.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/400f9744-64d7-43a4-947f-0f0e64049048/id-preview-47685b69--9367b7e4-8cae-4a45-9281-7618a92b6cac.lovable.app-1776766210130.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
