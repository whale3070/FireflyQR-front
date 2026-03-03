// Home.tsx
import React, { useEffect, useMemo, useState } from 'react';

export default function Home() {
  const [visitedAt, setVisitedAt] = useState<string>('');

  useEffect(() => {
    setVisitedAt(new Date().toLocaleString());
  }, []);

  const year = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="min-h-screen bg-[#2C1810] flex flex-col text-[#F5F0E8]">
      {/* Top nav */}
      <header className="border-b border-primary/30 bg-primary-dark/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-wine to-primary-dark rounded-lg shadow-glow" />
              <h1 className="text-xl font-serif font-bold text-accent-light">Whale Vault</h1>
            </div>
            <div className="text-sm text-accent-light/80 font-medium">Anti-counterfeit · No Refill</div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center">
        <div className="mx-auto max-w-4xl w-full px-4 py-8">
          {/* Info card */}
          <div className="rounded-2xl border border-primary/20 bg-primary-dark/40 p-8 backdrop-blur-sm shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-wine/30 to-gold/20 border border-gold/40 flex items-center justify-center">
                <span className="text-3xl">🍶</span>
              </div>
              <h1 className="text-4xl font-serif font-bold mb-3 text-accent-light">
                Welcome to the Anti-counterfeit Platform
              </h1>
              <p className="text-lg text-[#F5F0E8]/90 mb-2">Scan the product’s anti-counterfeit QR code with WeChat or your camera</p>
              <p className="text-[#F5F0E8]/60 text-sm">One code per item, no refill, on-chain verification</p>
            </div>

            <div className="my-8 border-t border-primary/20" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-primary/20 p-6 rounded-lg border border-gold/20">
                <div className="text-2xl mb-3">🔍</div>
                <h3 className="font-serif font-semibold mb-2 text-gold">Step 1: Find the code</h3>
                <p className="text-sm text-[#F5F0E8]/70">Locate the unique anti-counterfeit label or QR code on the packaging</p>
              </div>
              <div className="bg-primary/20 p-6 rounded-lg border border-gold/20">
                <div className="text-2xl mb-3">📱</div>
                <h3 className="font-serif font-semibold mb-2 text-gold">Step 2: Scan to verify</h3>
                <p className="text-sm text-[#F5F0E8]/70">Scan to open the verification page and check if it’s first open</p>
              </div>
              <div className="bg-primary/20 p-6 rounded-lg border border-gold/20">
                <div className="text-2xl mb-3">✅</div>
                <h3 className="font-serif font-semibold mb-2 text-gold">Step 3: On-chain record</h3>
                <p className="text-sm text-[#F5F0E8]/70">Verification result is recorded on-chain, tamper-proof and traceable</p>
              </div>
            </div>

            <div className="bg-gold/10 border border-gold/30 rounded-lg p-6 mb-8">
              <h3 className="font-serif font-semibold mb-3 text-gold flex items-center">
                <span className="mr-2">💡</span> Important
              </h3>
              <ul className="space-y-2 text-sm text-[#F5F0E8]/80">
                <li>· One code per item; each code can only be verified once to prevent refill</li>
                <li>· Buy from official channels and look for the official anti-counterfeit mark</li>
                <li>· Verification records are permanently on-chain and can be queried anytime</li>
                <li>· Contact official support if you have any questions</li>
              </ul>
            </div>

            <div className="text-center">
              <p className="text-sm text-[#F5F0E8]/50">
                Avalanche C-Chain
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <div className="inline-flex flex-col items-center space-y-2 text-sm text-[#F5F0E8]/50">
              <div className="flex items-center flex-wrap justify-center gap-x-4 gap-y-1">
                <span>🔐 On-chain verification</span>
                <span>·</span>
                <span>🍶 No refill</span>
                <span>·</span>
                <span>🌐 Traceable records</span>
              </div>
              <div className="text-xs">Visit time: {visitedAt || '—'}</div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-primary/30 bg-primary-dark/80">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="text-center text-accent-light/60 text-xs tracking-widest">
            <p>Anti-counterfeit · No refill · Whale Vault © {year}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
