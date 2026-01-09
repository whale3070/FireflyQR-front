import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function SecretCodeGate() {
  const navigate = useNavigate()
  const params = useParams()

  useEffect(() => {
    const raw = params.code ?? ''
    const code = (() => {
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    })().trim()

    if (!code) {
      navigate('/scan', { replace: true })
      return
    }

    try {
      localStorage.setItem('secretCode', code)
    } catch {}

    navigate('/scan', { replace: true })
  }, [navigate, params.code])

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="text-sm text-white/70">正在加载兑换码...</div>
      </div>
    </div>
  )
}

