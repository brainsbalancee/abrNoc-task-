// Edge-compatible middleware. Protects app routes (but not /api/auth/* or /login).
// We keep this thin: heavy tenant/role checks happen server-side in each route
// via requireTenant(). This just bounces unauthenticated browsers to /login.
import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: { signIn: '/login' },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
})

export const config = {
  // Protect app routes only. API routes enforce auth themselves via
  // requireTenant(); the middleware is just a UX redirect for browsers.
  matcher: ['/((?!api|login|_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
