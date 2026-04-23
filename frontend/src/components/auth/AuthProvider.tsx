import { useEffect, useState, type ReactNode } from "react"
import { AuthContext, type AuthStatus } from "./auth-context"
import { loginAdmin, logoutAdmin, readAdminSession } from "../../lib/auth"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")

  const refreshSession = async () => {
    try {
      const session = await readAdminSession()
      const nextStatus = session.authenticated ? "authenticated" : "unauthenticated"
      setStatus(nextStatus)
      return session.authenticated
    } catch {
      setStatus("unauthenticated")
      return false
    }
  }

  const login = async (password: string) => {
    await loginAdmin(password)
    await refreshSession()
  }

  const logout = async () => {
    await logoutAdmin()
    setStatus("unauthenticated")
  }

  useEffect(() => {
    let active = true
    readAdminSession()
      .then((session) => {
        if (!active) return
        setStatus(session.authenticated ? "authenticated" : "unauthenticated")
      })
      .catch(() => {
        if (!active) return
        setStatus("unauthenticated")
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, refreshSession, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
