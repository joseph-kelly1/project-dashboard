export { auth as middleware } from "@/auth";

// Everything requires a session except the auth endpoints, the sign-in page,
// and static assets. Unauthenticated page requests redirect to /signin;
// non-page requests get 401 (Auth.js default behavior).
export const config = {
  matcher: [
    "/((?!api/auth|signin|_next/static|_next/image|favicon.ico|icon.svg|logo.svg).*)",
  ],
};
