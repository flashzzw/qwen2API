import { FormEvent, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LockKeyhole, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "../components/ui/button"
import { useAuth } from "../components/auth/useAuth"

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { status, login } = useAuth()
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const nextPath = searchParams.get("next") || "/"
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/"

  useEffect(() => {
    if (status === "authenticated") {
      navigate(safeNextPath, { replace: true })
    }
  }, [navigate, safeNextPath, status])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password.trim() || submitting) {
      return
    }

    setSubmitting(true)
    try {
      await login(password.trim())
      toast.success("登录成功")
      navigate(safeNextPath, { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "登录失败"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_28%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/60 bg-card/85 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 space-y-3">
          <div className="inline-flex rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 text-sky-500">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              qwen2API Admin
            </p>
            <h1 className="text-3xl font-black tracking-tight">管理台登录</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              请输入管理员密钥。登录成功后，前端操作页和管理接口会共用同一会话。
            </p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">管理员密钥</span>
            <div className="flex items-center gap-3 rounded-2xl border border-input bg-background px-4 py-3 shadow-sm">
              <LockKeyhole className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入 .env 中的 ADMIN_KEY"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </label>

          <Button className="h-11 w-full rounded-2xl" disabled={submitting || !password.trim()} type="submit">
            {submitting ? "登录中..." : "进入管理台"}
          </Button>
        </form>
      </div>
    </div>
  )
}
