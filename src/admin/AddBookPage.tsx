import React, { useState, useCallback, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import type { PublisherOutletContext } from "./PublisherAdminLayout";

function origin() {
  if (typeof window === "undefined") return "";
  return window.location.origin || "";
}

export default function AddBookPage() {
  const {
    envMode,
    apiBaseUrl,
    error,
    opLoading,
    bookName,
    setBookName,
    author,
    setAuthor,
    symbol,
    setSymbol,
    baseUri,
    setBaseUri,
    contractAddr,
    handleDeployContract,
    bookListForDropdown,
    shortenAddress,
  } = useOutletContext<PublisherOutletContext>();

  const buttonText = opLoading ? "部署中..." : "部署合约";

  // 售后策略：选择 SKU（合约）、免费换新天数、保修天数
  const [policyContract, setPolicyContract] = useState<string>("");
  const [freeReplacementDays, setFreeReplacementDays] = useState<number>(7);
  const [warrantyDays, setWarrantyDays] = useState<number>(365);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState(false);

  // 选择合约时拉取当前策略回填
  const loadPolicyForContract = useCallback(
    async (contract: string) => {
      if (!contract || !/^0x[a-fA-F0-9]{40}$/.test(contract.trim())) return;
      try {
        const res = await fetch(
          `${origin()}/api/v1/sku-policy?contract=${encodeURIComponent(contract.trim())}`,
          { method: "GET" }
        );
        const data = await res.json();
        if (data?.ok && data?.free_replacement_days != null) setFreeReplacementDays(Number(data.free_replacement_days));
        if (data?.ok && data?.warranty_days != null) setWarrantyDays(Number(data.warranty_days));
      } catch {
        /* ignore */
      }
    },
    []
  );

  useEffect(() => {
    if (policyContract) loadPolicyForContract(policyContract);
  }, [policyContract, loadPolicyForContract]);

  const handleSavePolicy = async () => {
    let contract = policyContract.trim();
    if (!contract) {
      setPolicyError("请选择或填写有效的合约地址");
      return;
    }
    if (!contract.startsWith("0x")) contract = "0x" + contract;
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      setPolicyError("请选择或填写有效的合约地址");
      return;
    }
    if (freeReplacementDays < 0 || warrantyDays < 0) {
      setPolicyError("天数不能为负数");
      return;
    }
    setPolicyError(null);
    setPolicySuccess(false);
    setPolicyLoading(true);
    try {
      const res = await fetch(`${origin()}/api/v1/admin/sku-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract,
          free_replacement_days: freeReplacementDays,
          warranty_days: warrantyDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setPolicyError(data?.error || `请求失败: ${res.status}`);
        return;
      }
      setPolicySuccess(true);
    } catch (e: any) {
      setPolicyError(e?.message || "网络错误");
    } finally {
      setPolicyLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-8">
        <h2 className="text-lg font-bold text-slate-800 mb-6">📚 部署商品SKU的合约地址</h2>

        <div
          className={`mb-4 p-3 ${
            envMode === "mock"
              ? "bg-amber-50 border-amber-200"
              : "bg-emerald-50 border-emerald-200"
          } border rounded-xl`}
        >
          <p className={`text-xs ${envMode === "mock" ? "text-amber-700" : "text-emerald-700"}`}>
            {envMode === "mock"
              ? "🔧 Demo 模式：合约部署仅为模拟"
              : `🟢 Dev API：${apiBaseUrl}（由后端完成部署）`}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">书籍名称 *</label>
            <input
              placeholder="例：区块链技术原理"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">作者名称</label>
            <input
              placeholder="例：张三"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">书籍代码 (Symbol) *</label>
            <input
              placeholder="例：BLOCKCHAIN"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all uppercase"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">NFT Metadata Base URI（可选）</label>
            <input
              placeholder="例: https://...pinata.cloud/ipfs/bafybei.../"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              value={baseUri}
              onChange={(e) => setBaseUri(e.target.value)}
            />
            <p className="text-[11px] text-slate-400 mt-1">tokenURI = baseURI + tokenId，留空则 NFT 无图片</p>
          </div>

          <button
            onClick={handleDeployContract}
            disabled={opLoading || !bookName || !symbol}
            className="w-full mt-4 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 transition-all shadow-md"
          >
            {buttonText}
          </button>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            说明：部署由后端自动完成，请确保网络与权限正常。
          </p>

          {contractAddr && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-emerald-700 text-xs mb-2 font-medium">✓ 合约部署成功</p>
              <p className="text-xs font-mono text-slate-500 break-all">{contractAddr}</p>
            </div>
          )}
        </div>
      </div>

      {/* 设置退换货与保修时长（按 SKU/合约） */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-8">
        <h2 className="text-lg font-bold text-slate-800 mb-2">🛡️ 售后策略（按商品 SKU）</h2>
        <p className="text-xs text-slate-500 mb-6">选择已部署的合约，设置免费换新天数与保修天数；领取时间起算。</p>

        {policyError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-600 text-xs">{policyError}</p>
          </div>
        )}
        {policySuccess && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-emerald-700 text-xs">✓ 售后策略已保存</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">商品 SKU（合约地址）*</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 appearance-none cursor-pointer"
              value={policyContract}
              onChange={(e) => setPolicyContract(e.target.value)}
              aria-label="选择商品 SKU 合约"
            >
              <option value="">-- 选择已部署的合约 --</option>
              {contractAddr && (
                <option value={contractAddr}>
                  {shortenAddress(contractAddr)}（刚部署）
                </option>
              )}
              {bookListForDropdown.map((b) => {
                const raw = (b.bookAddr || "").toString();
                const addr = raw.startsWith("0x") ? raw.toLowerCase() : "0x" + raw.toLowerCase();
                if (!addr || addr === "0x") return null;
                if (contractAddr && addr === contractAddr.toLowerCase()) return null;
                const label = [b.symbol, b.name].filter(Boolean).join(" · ") || shortenAddress(addr);
                return (
                  <option key={addr} value={addr}>
                    {label} ({shortenAddress(addr)})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">免费换新天数（退换货时长）</label>
            <input
              type="number"
              min={0}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
              value={freeReplacementDays}
              onChange={(e) => setFreeReplacementDays(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-[11px] text-slate-400 mt-1">领取日起 N 天内可免费换新</p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">保修天数</label>
            <input
              type="number"
              min={0}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
              value={warrantyDays}
              onChange={(e) => setWarrantyDays(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-[11px] text-slate-400 mt-1">领取日起 N 天内保修有效（如 365 即一年）</p>
          </div>

          <button
            type="button"
            onClick={handleSavePolicy}
            disabled={policyLoading || !policyContract}
            className="w-full mt-2 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 transition-all shadow-md"
          >
            {policyLoading ? "保存中..." : "保存售后策略"}
          </button>
        </div>
      </div>
    </div>
  );
}
