import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
    };
  }
}

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "puresquare.com";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false;
      // Google Workspace 'hd' claim restricts to the org domain.
      const hd = (profile as { hd?: string }).hd;
      if (hd !== ALLOWED_DOMAIN) return false;
      if (!profile.email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;

      // Upsert user, and backfill any pending participant rows that match.
      const existing = await db.query.users.findFirst({
        where: eq(users.email, profile.email),
      });
      if (!existing) {
        await db.insert(users).values({
          email: profile.email,
          googleSub: profile.sub,
          name: profile.name ?? null,
          image: (profile.picture as string | undefined) ?? null,
        });
      } else if (!existing.googleSub) {
        await db
          .update(users)
          .set({
            googleSub: profile.sub,
            name: existing.name ?? profile.name ?? null,
            image: existing.image ?? ((profile.picture as string | undefined) ?? null),
          })
          .where(eq(users.id, existing.id));
      }
      return true;
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const u = await db.query.users.findFirst({
          where: eq(users.email, profile.email),
        });
        if (u) token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
