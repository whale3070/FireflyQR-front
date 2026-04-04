// NFT 押金池：当 NFT 销量增加 N 个，押金池总量 = 10 * N；随 NFT 数量动态调整
import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { PublisherOutletContext } from "./PublisherAdminLayout";

const DEPOSIT_PER_NFT = 10;

export default function NFTDepositPoolPage() {
  const { bookSales, nftStatsMap, refreshNftStats, envMode } = useOutletContext<PublisherOutletContext>();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshNftStats?.();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (envMode === "real" && bookSales?.length) refreshNftStats?.();
  }, [envMode, bookSales?.length]);

  const rows = (bookSales || []).map((book) => {
    const stats = book?.address ? nftStatsMap?.[book.address.toLowerCase()] : undefined;
    const N = stats?.minted_total ?? 0;
    const pool = DEPOSIT_PER_NFT * N;
    return {
      name: book.name || "—",
      symbol: book.symbol || "—",
      address: book.address,
      N,
      pool,
    };
  });

  const totalN = rows.reduce((s, r) => s + r.N, 0);
  const totalPool = DEPOSIT_PER_NFT * totalN;

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">NFT 押金池</h1>
        {envMode === "real" && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {refreshing ? "刷新中…" : "刷新数据"}
          </button>
        )}
      </div>

      <p className="text-sm text-slate-600">
        当 NFT 销量增加 N 个，押金池总量 = 10 × N；随 NFT 数量动态调整。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-slate-500 text-xs uppercase font-semibold mb-1">当前 NFT 总销量 (N)</p>
          <p className="text-4xl font-black text-slate-900">{totalN.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-indigo-600 text-xs uppercase font-semibold mb-1">押金池总量 (10 × N)</p>
          <p className="text-4xl font-black text-slate-900">{(totalPool).toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">按商品 / 合约</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-6 py-3 font-semibold">商品 / 合约</th>
                <th className="px-6 py-3 font-semibold">NFT 销量 (N)</th>
                <th className="px-6 py-3 font-semibold">押金池 (10 × N)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                    暂无书籍或统计数据，请先在「添加书籍」上架并在 Live 模式下刷新。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.address} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-6 py-3">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{r.address.slice(0, 10)}…{r.address.slice(-8)}</div>
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-800">{r.N.toLocaleString()}</td>
                    <td className="px-6 py-3 font-bold text-indigo-600">{(r.pool).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
