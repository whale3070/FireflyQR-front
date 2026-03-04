//App.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";

// 导入所有页面组件
import Home from "./pages/Home";
import Success from "./pages/Success";
import Reward from "./pages/Reward";
import Heatmap from "./pages/Heatmap";
import Bookshelf from "./pages/Bookshelf";
import BookDetail from "./pages/BookDetail";
import VerifyPage from "./pages/VerifyPage";
import MintConfirm from "./pages/MintConfirm";

// ✅ Publisher Admin（已拆分到 /src/admin）
import PublisherAdminLayout from "./admin/PublisherAdminLayout";
import OverviewPage from "./admin/OverviewPage";
import AddBookPage from "./admin/AddBookPage";
import QrCodePage from "./admin/QrCodePage";
import AnalyticsPage from "./admin/AnalyticsPage";
import TopUpPage from "./admin/TopUpPage"; // ✅ 新增：多资产充值入口

// 模式切换
import { AppModeProvider } from "./contexts/AppModeContext";
import ModeSwitcher from "./components/ModeSwitcher";

export default function App() {
  /**
   * 核心验证逻辑：对接后端 verify 接口
   */
  const handleVerify = async (addr: string, hash: string) => {
    try {
      if (!addr || !hash) {
        console.warn("HandleVerify: 地址或哈希缺失", { addr, hash });
        return null;
      }

      // 你后端固定地址：保持你现有逻辑不动
      const response = await fetch(
        `/secret/verify?address=${encodeURIComponent(
          addr
        )}&codeHash=${encodeURIComponent(hash)}`
      );

      if (!response.ok) {
        console.error("验证接口返回错误状态:", response.status);
        return null;
      }

      const data = await response.json();
      return data?.ok ? data.role : null;
    } catch (err) {
      console.error("验证接口连接异常", err);
      return null;
    }
  };

  return (
    <AppModeProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#2C1810] flex flex-col text-[#F5F0E8] font-sans">
          <ModeSwitcher />

          <main style={{ minHeight: "80vh", position: "relative", flexGrow: 1 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/bookshelf" element={<Bookshelf />} />

              {/* --- 铸造执行路径 --- */}
              <Route path="/mint/:hashCode" element={<MintConfirm />} />

              {/* 金库路径确权（身份识别、博弈弹窗） */}
              <Route path="/vault_mint_nft/:hash" element={<VerifyPage onVerify={handleVerify} />} />
              {/* 兼容你之前拼写错误的路径 */}
              <Route path="/valut_mint_nft/:hash" element={<VerifyPage onVerify={handleVerify} />} />

              <Route path="/verify/:hash" element={<VerifyPage onVerify={handleVerify} />} />
              <Route path="/verify" element={<VerifyPage onVerify={handleVerify} />} />

              {/* 业务路由 */}
              <Route path="/success" element={<Success />} />
              <Route path="/reward" element={<Reward />} />
              <Route path="/Heatmap" element={<Heatmap />} />
              <Route path="/book/:address" element={<BookDetail />} />

              {/* ✅ 商家后台管理系统（路由化拆分） */}
              <Route path="/publisher-admin" element={<PublisherAdminLayout />}>
                <Route index element={<Navigate to="/publisher-admin/overview" replace />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="add-book" element={<AddBookPage />} />
                <Route path="qrcode" element={<QrCodePage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                {/* ✅ 新增：多资产充值入口 */}
                <Route path="topup" element={<TopUpPage />} />
              </Route>

              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="flex flex-col items-center justify-center h-[60vh] font-display">
                    <h1 className="text-4xl font-bold text-gold mb-4">404</h1>
                    <p className="text-[#F5F0E8]/70 text-sm">Page not found</p>
                    <Link to="/bookshelf" className="mt-6 text-accent hover:text-accent-light underline">
                      Back to list
                    </Link>
                  </div>
                }
              />
            </Routes>
          </main>

          <footer className="bg-primary-dark border-t border-primary/40 px-8 py-4">
            <div className="max-w-[1600px] mx-auto flex justify-between items-center text-[10px] text-accent-light/80">
              <div className="flex gap-6">
                <Link to="/bookshelf" className="hover:text-gold uppercase tracking-tighter">
                  ｜Market
                </Link>
                <Link to="/Heatmap" className="hover:text-gold uppercase tracking-tighter">
                  ｜Heatmap
                </Link>
                <Link to="/reward" className="hover:text-gold uppercase tracking-tighter">
                  ｜Reward
                </Link>
                <Link to="/publisher-admin" className="hover:text-white uppercase tracking-tighter">
                  ｜Publisher Admin
                </Link>
                <Link to="/verify" className="hover:text-white uppercase tracking-tighter">
                  ｜Admin
                </Link>
              </div>
              <div className="uppercase tracking-widest text-right text-accent-light/70">
                Anti-counterfeit · No refill · Whale Vault · Avalanche C-Chain
              </div>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </AppModeProvider>
  );
}
