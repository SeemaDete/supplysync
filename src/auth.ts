import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { z } from "zod";
import authConfig from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
});

export const entraEnabled = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

const providers = [
  Credentials({
    name: "Email",
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) throw new CredentialsSignin();
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, include: { role: true } });
      if (!user || !user.active || !user.passwordHash) throw new CredentialsSignin();
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) throw new CredentialsSignin();
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
  ...(entraEnabled
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    // Entra users must be pre-provisioned by an Admin (matched on email) - no self sign-up.
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;
      const email = (user.email ?? (profile?.preferred_username as string | undefined))?.toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      return Boolean(dbUser?.active);
    },
    async jwt({ token, user, profile }) {
      // On sign-in (user present) load role & supplier link from the database.
      // Entra ID may omit the "email" claim – fall back to preferred_username (UPN).
      const signInEmail = user ? (user.email ?? (profile?.preferred_username as string | undefined)) : undefined;
      if (signInEmail) {
        const dbUser = await prisma.user.findUnique({
          where: { email: signInEmail.toLowerCase() },
          include: { role: true },
        });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role.key;
          token.supplierId = dbUser.supplierId;
          token.canOverride = dbUser.canOverride;
          token.name = dbUser.name;
          await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } });
        }
      }
      return token;
    },
  },
});
