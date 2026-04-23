import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "./useAuth"

export default function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        正在验证登录状态...
      </div>
    )
  }

  if (status !== "authenticated") {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return <Outlet />
}
