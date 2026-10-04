import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// NextAuth configuration. Credentials provider against our own user table.
// Passwords are bcrypt-hashed. Sessions are JWT (stateless) — fits serverless.

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
      tenantId: string
      branchIds: string[]
      activeBranchId: string | null
    }
  }
  interface User {
    id: string
    name: string
    email: string
    role: string
    tenantId: string
    branchIds: string[]
    activeBranchId: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    tenantId: string
    branchIds: string[]
    activeBranchId: string | null
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 }, // 12h shift
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Staff credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            branches: { select: { branchId: true } },
          },
        })
        if (!user || !user.active) return null
        // Constant-time-ish compare (bcrypt handles timing internally).
        const ok = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!ok) return null
        const branchIds = user.branches.map((b) => b.branchId)
        // Default active branch = first assigned branch.
        const activeBranchId = branchIds[0] ?? null
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          branchIds,
          activeBranchId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.tenantId = user.tenantId
        token.branchIds = user.branchIds
        token.activeBranchId = user.activeBranchId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.tenantId = token.tenantId
        session.user.branchIds = token.branchIds
        session.user.activeBranchId = token.activeBranchId
      }
      return session
    },
  },
}
