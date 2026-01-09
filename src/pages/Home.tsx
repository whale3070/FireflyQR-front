import React from 'react'
import SalesBoard from '../components/SalesBoard'

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold mb-2">NFT 金库</h2>
          <p className="text-sm text-white/70 mb-4">
            使用微信或系统相机扫码实体书二维码，将自动打开领取页面。
          </p>
          <div className="text-sm text-white/60">
            领取入口示例：<span className="font-mono">/valut_mint_nft/&lt;hashCode&gt;</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <SalesBoard />
        </div>
      </section>
    </div>
  )
}
