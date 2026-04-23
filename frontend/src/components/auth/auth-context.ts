import { createContext } from "react"

export type AuthStatus = "loading" | "authenticated" | "unauthenticated"

export type AuthContextValue = {
  status: AuthStatus
  refreshSession: () => Promise<boolean>
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
