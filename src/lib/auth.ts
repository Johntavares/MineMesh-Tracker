import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const inputEmail = credentials.email.trim().toLowerCase()
        const inputPassword = credentials.password

        try {
          const user = await prisma.user.findUnique({
            where: { email: inputEmail }
          })

          if (user) {
            const isPasswordValid = await bcrypt.compare(inputPassword, user.password)
            if (isPasswordValid) {
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
              }
            }
          }
        } catch (dbError) {
          console.warn('[AUTH] Database unreachable, checking admin fallback:', dbError)
        }

        // Fallback for admin user if DB is offline or seeded user
        if (inputEmail === 'admin@mesh.local' && inputPassword === 'admin') {
          return {
            id: 'admin-default-id',
            email: 'admin@mesh.local',
            name: 'Administrador',
            role: 'ADMIN',
          }
        }

        return null
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'supersecretmvp',
}
