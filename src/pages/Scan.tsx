import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scanner } from '@yudiel/react-qr-scanner'
import { BACKEND_URL } from '../config/backend'

export default function Scan() {
  const navigate = useNavigate()
  const [showScanner, setShowScanner] = useState<boolean>(false)
  const [secretCode, setSecretCode] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'scanning' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')
  const hasWallet = useMemo(() => {
    try {
      return !!localStorage.getItem('selectedAddress')
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('secretCode') || ''
      if (saved) setSecretCode(saved)
    } catch {}
  }, [])

  const sha256Hex = async (text: string) => {
    const enc = new TextEncoder()
    const data = enc.encode(text)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(digest)
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  const verifySecretCode = async (code: string) => {
    const codeHash = await sha256Hex(code)
    const url = `${BACKEND_URL}/secret/verify?codeHash=${encodeURIComponent(codeHash)}`
    const resp = await fetch(url, { method: 'GET' })
    if (!resp.ok) return false
    const body = await resp.json().catch(() => ({} as any))
    return body?.ok === true
  }

  const proceed = async (raw: string) => {
    const code = raw.trim()
    if (!code) {
      setStatus('error')
      setMessage('未获取到兑换码')
      return
    }
    try {
      setStatus('verifying')
      setMessage('验证中...')
      const ok = await verifySecretCode(code)
      if (!ok) {
        try {
          localStorage.removeItem('secretCode')
        } catch {}
        setStatus('error')
        setMessage('兑换码无效，无法领取 NFT')
        return
      }
      setStatus('success')
      setMessage('验证通过，正在进入 Mint...')
      try {
        localStorage.removeItem('secretCode')
      } catch {}
      navigate(`/mint-confirm?code=${encodeURIComponent(code)}`)
    } catch {
      setStatus('error')
      setMessage('验证失败，请稍后重试')
    }
  }

  useEffect(() => {
    if (!secretCode) return
    proceed(secretCode)
  }, [secretCode])

  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center text-center">
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8">
            <div className="text-base text-white/80">请点击下方按钮进行扫码</div>
            <div className="mt-5 flex flex-col items-center gap-4">
              <button
                type="button"
                className="group relative h-32 w-32 sm:h-36 sm:w-36 rounded-2xl bg-primary text-background shadow-glow transition active:scale-95 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-primary/60"
                onClick={() => {
                  setMessage('')
                  setStatus('scanning')
                  setShowScanner(true)
                }}
                disabled={status === 'verifying'}
              >
                <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/10 transition" />
                <div className="relative flex h-full w-full flex-col items-center justify-center gap-2">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="opacity-95">
                    <path
                      d="M7 3H5a2 2 0 0 0-2 2v2m18 0V5a2 2 0 0 0-2-2h-2M7 21H5a2 2 0 0 1-2-2v-2m18 0v2a2 2 0 0 1-2 2h-2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M7 12h10M12 7v10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="text-base font-semibold tracking-wide">点击扫码</div>
                </div>
              </button>

              <div className="flex flex-col items-center gap-2">
                <svg className="h-5 w-5 text-primary/80 animate-bounce" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v12m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <div className="text-base text-white/70">
                  {status === 'verifying'
                    ? '正在校验兑换码...'
                    : status === 'success'
                      ? '校验通过，准备进入 Mint'
                      : status === 'error'
                        ? '校验失败，请重新扫码'
                        : !hasWallet
                          ? '建议先连接钱包（右上角）'
                          : '准备就绪'}
                </div>
                {(message || status === 'verifying') && (
                  <div className={`text-base ${status === 'error' ? 'text-red-400' : status === 'success' ? 'text-emerald-400' : 'text-white/70'}`}>
                    {message || '验证中...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowScanner(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-background p-4 space-y-3 shadow-glow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-medium">
                <span>扫码中</span>
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              </div>
              <button
                type="button"
                className="text-xs text-white/60 hover:text-white"
                onClick={() => {
                  setShowScanner(false)
                  setStatus('idle')
                }}
              >
                关闭
              </button>
            </div>
            <div className="rounded-lg overflow-hidden border border-white/10 bg-black/60">
              <Scanner
                onScan={(results) => {
                  const first = Array.isArray(results) ? results[0] : null
                  const value = first?.rawValue ?? ''
                  if (value) {
                    setShowScanner(false)
                    setStatus('idle')
                    const trimmed = value.trim()
                    if (/^https?:\/\//i.test(trimmed)) {
                      window.location.href = trimmed
                      return
                    }
                    navigate(`/whale_valut/${encodeURIComponent(trimmed)}`)
                  }
                }}
                onError={() => {}}
                constraints={{ facingMode: 'environment' }}
              />
            </div>
            <div className="text-base text-white/70">将摄像头对准书上的二维码</div>
          </div>
        </div>
      )}
    </div>
  )
}
