import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  pages: { signIn: "/signin" },
  callbacks: {
    // Single-user lock: numeric GitHub id (usernames can change/be reclaimed).
    signIn({ profile }) {
      const allowed = process.env.ALLOWED_GITHUB_ID;
      return Boolean(allowed) && String(profile?.id) === allowed;
    },
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
});
