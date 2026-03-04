import React from "react";
import { useOutletContext } from "react-router-dom";
import type { PublisherOutletContext } from "./PublisherAdminLayout";
import type { BookSales } from "./PublisherAdminLayout";
import { EXPLORER_URL } from "../config/chain";

type LeaderboardItem = {
  name: string;
  count: number;
  lng?: number;
  lat?: number;
};

type MintRecord = {
  reader?: string;
  token_id?: string;
  tx_hash?: string;
  block?: number;
  minted_at?: number;
};

export default function OverviewPage() {
  const {
    totalSales,
    bookSales,
    regionRanks,
    envMode,
    nftStatsMap,
    refreshNftStats,
  } = useOutletContext<PublisherOutletContext>();

  // ✅ Live 地区榜单（从后端聚合 Redis 的 city 统计读取）
  const [liveLeaderboard, setLiveLeaderboard] = React.useState<LeaderboardItem[]>([]);
  const [lbLoading, setLbLoading] = React.useState(false);
  const [lbErr, setLbErr] = React.useState<string | null>(null);

  const fetchLeaderboard = React.useCallback(async () => {
    if (envMode !== "real") return;

    setLbLoading(true);
    setLbErr(null);
    try {
      const resp = await fetch(`/api/v1/analytics/leaderboard?limit=10`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const json = await resp.json();

      // 兼容两种返回：
      // A) { ok: true, data: { items: [...] } }
      // B) { ok: true, items: [...] }
      const items =
        (json?.data?.items as LeaderboardItem[] | undefined) ??
        (json?.items as LeaderboardItem[] | undefined) ??
        [];

      if (!json?.ok) {
        throw new Error(json?.error || "leaderboard api failed");
      }

      // 兜底清洗
      const cleaned = (items || [])
        .map((it) => ({
          name: (it?.name === "Unknown" || !it?.name) ? "未知" : String(it.name),
          count: Number(it?.count ?? 0),
          lng: it?.lng,
          lat: it?.lat,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setLiveLeaderboard(cleaned);
    } catch (e: any) {
      setLbErr(e?.message || "failed to load leaderboard");
      setLiveLeaderboard([]);
    } finally {
      setLbLoading(false);
    }
  }, [envMode]);

  React.useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envMode]);

  const totals = React.useMemo(() => {
    const agg = {
      mintedTotal: 0,
      uniqueRealUsers: 0,
      lastScannedBlock: 0,
      coveredContracts: 0,
    };

    if (envMode !== "real") return agg;

    for (const b of bookSales) {
      const s = nftStatsMap?.[(b.address || "").toLowerCase()];
      if (!s) continue;
      agg.coveredContracts += 1;
      agg.mintedTotal += Number(s.minted_total || 0);
      agg.uniqueRealUsers += Number(s.unique_real_users || 0);
      agg.lastScannedBlock = Math.max(agg.lastScannedBlock, Number(s.last_scanned_block || 0));
    }

    return agg;
  }, [bookSales, envMode, nftStatsMap]);

  // ✅ 最终用于展示的地区榜单：
  // - real: 用后端 leaderboard
  // - mock: 沿用 regionRanks（你现有 mock 数据）
  const displayRanks = React.useMemo(() => {
    if (envMode === "real") return liveLeaderboard;
    // 兼容 regionRanks 可能是 {region,count}
    return (regionRanks || []).map((r: any) => ({
      name: (r.region ?? r.name) === "Unknown" || !(r.region ?? r.name) ? "未知" : String(r.region ?? r.name),
      count: Number(r.count ?? 0),
    })) as LeaderboardItem[];
  }, [envMode, liveLeaderboard, regionRanks]);

  // 点击 SKU 子合约：弹窗展示链上地址 + 链上领取记录
  const [detailBook, setDetailBook] = React.useState<BookSales | null>(null);
  const [detailMints, setDetailMints] = React.useState<MintRecord[]>([]);
  const [detailMintsLoading, setDetailMintsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!detailBook?.address) {
      setDetailMints([]);
      return;
    }
    let cancelled = false;
    setDetailMintsLoading(true);
    setDetailMints([]);
    fetch(`/api/v1/nft/contract/${encodeURIComponent(detailBook.address)}/mints?limit=100`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setDetailMints(Array.isArray(data.mints) ? data.mints : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetailMintsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailBook?.address]);

  const copyAddress = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {});
  };

  return (
    <div className="space-y-6 text-slate-800">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-indigo-700 text-xs uppercase font-semibold mb-1">Gross Sales</p>
          <p className="text-4xl font-black text-slate-900">{totalSales.toLocaleString()}</p>
          <p className="mt-2 text-xs text-slate-600">商家口径（业务销量总计）</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-teal-700 text-xs uppercase font-semibold mb-1">Titles Live</p>
          <p className="text-4xl font-black text-slate-900">{bookSales.length}</p>
          <p className="mt-2 text-xs text-slate-600">已上链 / 已上架的商品合约</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-emerald-700 text-xs uppercase font-semibold mb-1">On-chain Verified Mints</p>
          <p className="text-4xl font-black text-slate-900">
            {envMode === "real" ? totals.mintedTotal.toLocaleString() : "—"}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {envMode === "real"
              ? `实时扫描到区块 #${totals.lastScannedBlock.toLocaleString()}`
              : "切换到 Live Data 查看链上统计"}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-soft border border-slate-200">
          <p className="text-purple-700 text-xs uppercase font-semibold mb-1">Unique Real Readers</p>
          <p className="text-4xl font-black text-slate-900">
            {envMode === "real" ? totals.uniqueRealUsers.toLocaleString() : "—"}
          </p>
          <p className="mt-2 text-xs text-slate-600">反刷量口径：一码一人（可审计）</p>
        </div>
      </div>

      {/* ✅ 地区销量/点亮排名 */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900">🌍 销量地区排名（City 级）</h2>
          <div className="flex items-center gap-2">
            {envMode === "real" && (
              <button
                onClick={fetchLeaderboard}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all"
              >
                刷新地区榜单
              </button>
            )}
            <span
              className={`text-xs ${
                envMode === "mock" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              } px-2 py-1 rounded-full font-medium`}
            >
              {envMode === "mock" ? "Demo Data" : "Live Data"}
            </span>
          </div>
        </div>

        <div className="px-6 py-4">
          {envMode === "real" && lbLoading && (
            <div className="text-xs text-slate-600">正在拉取地区榜单…</div>
          )}
          {envMode === "real" && lbErr && (
            <div className="text-xs text-red-600">
              地区榜单加载失败：{lbErr}（请确认后端已挂载 /api/v1/analytics/leaderboard）
            </div>
          )}

          {displayRanks.length === 0 ? (
            <div className="text-xs text-slate-600">暂无数据（先 mint 几次产生城市聚合）</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">排名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">城市</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">销量/点亮数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayRanks
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 10)
                  .map((it, idx) => (
                    <tr key={`${it.name}-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            idx === 0
                              ? "bg-amber-100 text-amber-800"
                              : idx === 1
                              ? "bg-slate-200 text-slate-700"
                              : idx === 2
                              ? "bg-orange-100 text-orange-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-900 font-medium">{it.name}</td>
                      <td className="px-4 py-4 text-right font-mono text-lg text-emerald-700 font-bold">
                        {Number(it.count || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 商品销量排行（原有） */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900">📖 商品销量排行（点击行查看子合约与链上领取记录）</h2>
          <div className="flex items-center gap-2">
            {envMode === "real" && (
              <button
                onClick={() => refreshNftStats()}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-all"
              >
                刷新链上统计
              </button>
            )}
            <span
              className={`text-xs ${
                envMode === "mock" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              } px-2 py-1 rounded-full font-medium`}
            >
              {envMode === "mock" ? "Demo Data" : "Live Data"}
            </span>
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">排名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">代码</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">商品 SKU</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">部署者</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">链上 Mint</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">真实读者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {bookSales.map((book, idx) => (
              <tr
                key={book.address}
                className="hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setDetailBook(book)}
              >
                <td className="px-4 py-4">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      idx === 0
                        ? "bg-amber-100 text-amber-800"
                        : idx === 1
                        ? "bg-slate-200 text-slate-700"
                        : idx === 2
                        ? "bg-orange-100 text-orange-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {idx + 1}
                  </span>
                </td>
                <td className="px-4 py-4 font-mono text-indigo-700 text-sm font-medium">{book.symbol}</td>
                <td className="px-4 py-4 font-mono text-slate-900 text-sm break-all">{book.address || "—"}</td>
                <td className="px-4 py-4 font-mono text-slate-700 text-xs break-all">{book.deployer || "—"}</td>
                <td className="px-4 py-4 text-right font-mono text-lg text-slate-900 font-bold">
                  {envMode === "real" ? (nftStatsMap?.[(book.address || "").toLowerCase()]?.minted_total ?? "—") : "—"}
                </td>
                <td className="px-4 py-4 text-right font-mono text-lg text-purple-800 font-bold">
                  {envMode === "real" ? (nftStatsMap?.[(book.address || "").toLowerCase()]?.unique_real_users ?? "—") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 子合约详情弹窗：链上地址 + 链上领取记录 */}
      {detailBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDetailBook(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">
                📖 {detailBook.name}（{detailBook.symbol}）
              </h2>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                onClick={() => setDetailBook(null)}
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-1">子合约链上地址</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-sm text-indigo-700 bg-slate-100 px-2 py-1 rounded break-all">
                  {detailBook.address}
                </code>
                <button
                  type="button"
                  className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700"
                  onClick={() => copyAddress(detailBook.address)}
                >
                  复制
                </button>
                <a
                  href={`${EXPLORER_URL}/address/${detailBook.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                >
                  区块浏览器查看
                </a>
              </div>
            </div>
            <div className="px-6 py-4 flex-1 overflow-auto">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">链上领取 NFT 记录</p>
              {detailMintsLoading ? (
                <p className="text-sm text-slate-600">加载中…</p>
              ) : detailMints.length === 0 ? (
                <p className="text-sm text-slate-600">暂无记录（仅包含本系统处理过的 mint 交易）</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">领取地址</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">Token ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">交易哈希</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {detailMints.map((m, i) => (
                      <tr key={`${m.tx_hash ?? i}-${i}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700 truncate max-w-[120px]" title={m.reader ?? ""}>
                          {m.reader ?? "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-800">{m.token_id ?? "—"}</td>
                        <td className="px-3 py-2">
                          {m.tx_hash ? (
                            <a
                              href={`${EXPLORER_URL}/tx/${m.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-indigo-700 hover:underline truncate max-w-[140px] inline-block"
                              title={m.tx_hash}
                            >
                              {m.tx_hash.slice(0, 10)}…{m.tx_hash.slice(-8)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 text-xs">
                          {m.minted_at
                            ? new Date((m.minted_at as number) * 1000).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
