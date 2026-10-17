import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/rbac";

// Edge-safe part of the Auth.js config (no Prisma, no bcrypt). Used by middleware.
export default {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [], // real providers are added in auth.ts (Node runtime)
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/cron") ||
        pathname === "/api/health" ||
        pathname === "/favicon.ico";
      if (isPublic) return true;
      if (!auth?.user) return false; // → redirect to /login

      const role = auth.user.role as Role;
      // Suppliers may only use the portal and shared APIs
      if (role === "SUPPLIER") {
        const allowed = pathname.startsWith("/portal") || pathname.startsWith("/api/") || pathname === "/";
        if (!allowed) return Response.redirect(new URL("/portal", request.nextUrl));
      } else if (pathname.startsWith("/portal")) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      return true;
    },
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.supplierId = (token.supplierId as string | null) ?? null;
        session.user.canOverride = Boolean(token.canOverride);
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
