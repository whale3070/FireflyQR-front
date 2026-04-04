// NFT 管理：按子合约列出已领取 NFT 的钱包，按时间排序（最近在前），点击可查售后与过保状态
import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { EXPLORER_URL } from "../config/chain";

type MintRecord = {
  reader?: string;
  token_id?: string;
  minted_at?: number;
  tx_hash?: string;
  block?: number;
};

type ReaderRow = {
  address: string;
  claimTime: number | null; // unix ts, null if from owners only
  tokenId?: string;
};

type DeadlinesPayload = {
  ok: boolean;
  claim_time?: string;
  free_replacement_deadline?: string;
  warranty_deadline?: string;
  error?: string;
};

export default function NFTOwnersPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const contract = (searchParams.get("contract") || "").trim();

  const [owners, setOwners] = useState<string[]>([]);
  const [mints, setMints] = useState<MintRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 按时间排序的列表：优先用 mints（最近在前），去重后补 owners 里没有的
  const sortedRows = useMemo((): ReaderRow[] => {
    const byAddr = new Map<string, ReaderRow>();
    const mintsDesc = [...mints].sort((a, b) => (b.minted_at ?? 0) - (a.minted_at ?? 0));
    for (const m of mintsDesc) {
      const addr = (m.reader ?? "").toLowerCase();
      if (!addr || byAddr.has(addr)) continue;
      byAddr.set(addr, {
        address: addr,
        claimTime: m.minted_at ?? null,
        tokenId: m.token_id,
      });
    }
    for (const addr of owners) {
      const a = addr.toLowerCase();
      if (!byAddr.has(a)) byAddr.set(a, { address: a, claimTime: null });
    }
    return Array.from(byAddr.values());
  }, [owners, mints]);

  useEffect(() => {
    if (!contract || !contract.startsWith("0x") || contract.length !== 42) {
      setOwners([]);
      setMints([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const c = encodeURIComponent(contract);
    Promise.all([
      fetch(`/api/v1/nft/contract/${c}/owners`).then((r) => r.json()),
      fetch(`/api/v1/nft/contract/${c}/mints?limit=500`).then((r) => r.json()),
    ])
      .then(([ownersRes, mintsRes]) => {
        const oPayload = ownersRes?.data ?? ownersRes;
        const mPayload = mintsRes?.data ?? mintsRes;
        if (oPayload?.ok) setOwners(Array.isArray(oPayload.owners) ? oPayload.owners : []);
        else setOwners([]);
        if (mPayload?.ok) setMints(Array.isArray(mPayload.mints) ? mPayload.mints : []);
        else setMints([]);
      })
      .catch((e) => {
        setError(e?.message || "加载失败");
        setOwners([]);
        setMints([]);
      })
      .finally(() => setLoading(false));
  }, [contract]);

  const copyAddress = (addr: string) => {
    navigator.clipboard?.writeText(addr).then(() => {});
  };

  // 点击某行：弹窗查售后
  const [detailReader, setDetailReader] = useState<string | null>(null);
  const [detailDeadlines, setDetailDeadlines] = useState<DeadlinesPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!detailReader || !contract) {
      setDetailDeadlines(null);
      return;
    }
    setDetailLoading(true);
    setDetailDeadlines(null);
    const reader = detailReader.startsWith("0x") ? detailReader : "0x" + detailReader;
    fetch(
      `/api/v1/sku-deadlines-by-reader?contract=${encodeURIComponent(contract)}&reader=${encodeURIComponent(reader)}`
    )
      .then((r) => r.json())
      .then((data) => {
        const payload = data?.data ?? data;
        setDetailDeadlines(payload ?? { ok: false });
      })
      .catch(() => setDetailDeadlines({ ok: false, error: "请求失败" }))
      .finally(() => setDetailLoading(false));
  }, [detailReader, contract]);

  const now = Date.now() / 1000;
  const toTs = (s: string | undefined) =>
    s ? new Date(s.replace(/-/g, "/")).getTime() / 1000 : null;
  const freeReplacementTs = toTs(detailDeadlines?.free_replacement_deadline);
  const warrantyTs = toTs(detailDeadlines?.warranty_deadline);
  const freeReplacementExpired = freeReplacementTs != null ? now > freeReplacementTs : null;
  const warrantyExpired = warrantyTs != null ? now > warrantyTs : null;

  if (!contract || !contract.startsWith("0x")) {
    return (
      <div className="space-y-6 text-slate-800">
        <h1 className="text-xl font-bold text-slate-900">NFT 管理 · 领取地址</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-slate-700">请从「查看销量」页的销量排行中，点击某一子合约行，在弹窗中点击「更多」进入本页。</p>
          <button
            type="button"
            onClick={() => navigate("/publisher-admin/overview")}
            className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            前往查看销量 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-900">NFT 管理 · 已领取钱包地址</h1>
        <button
          type="button"
          onClick={() => navigate("/publisher-admin/overview")}
          className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
        >
          返回查看销量
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">子合约地址</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm text-indigo-700 bg-slate-100 px-2 py-1 rounded break-all">
              {contract}
            </code>
            <button
              type="button"
              className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700"
              onClick={() => copyAddress(contract)}
            >
              复制
            </button>
            <a
              href={`${EXPLORER_URL}/address/${contract}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
            >
              区块浏览器查看
            </a>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading && <p className="text-sm text-slate-600">加载中…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && sortedRows.length === 0 && (
            <p className="text-sm text-slate-600">暂无已领取地址（由链上 Transfer 统计，需扫块后才有数据）</p>
          )}
          {!loading && !error && sortedRows.length > 0 && (
            <>
              <p className="text-xs text-slate-500 uppercase font-semibold mb-3">
                共 {sortedRows.length} 个钱包领取（按领取时间排序，最近在前）
              </p>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">#</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">钱包地址</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">领取时间</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedRows.map((row, idx) => (
                      <tr
                        key={row.address}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => setDetailReader(row.address)}
                      >
                        <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono text-slate-800 truncate max-w-[200px]" title={row.address}>
                          {row.address}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.claimTime != null
                            ? new Date(row.claimTime * 1000).toLocaleString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 mr-1"
                            onClick={() => copyAddress(row.address)}
                          >
                            复制
                          </button>
                          <a
                            href={`${EXPLORER_URL}/address/${row.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                          >
                            浏览器
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 点击钱包后的售后详情弹窗 */}
      {detailReader && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setDetailReader(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">售后信息</h2>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700 text-2xl leading-none"
                onClick={() => setDetailReader(null)}
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-slate-500 font-mono mb-3 break-all">{detailReader}</p>
              {detailLoading && <p className="text-sm text-slate-600">加载中…</p>}
              {!detailLoading && detailDeadlines && !detailDeadlines.ok && (
                <p className="text-sm text-slate-600">{detailDeadlines.error || "暂无售后数据（需通过扫码领取才有记录）"}</p>
              )}
              {!detailLoading && detailDeadlines?.ok && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">领取时间</p>
                    <p className="text-sm font-medium text-slate-800">{detailDeadlines.claim_time ?? "—"}</p>
                  </div>
                  <div
                    className={`rounded-xl border-2 p-3 ${
                      freeReplacementExpired === true
                        ? "border-slate-300 bg-slate-100/80"
                        : "border-emerald-200 bg-emerald-50/50"
                    }`}
                  >
                    <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">免费换新截止</p>
                    <p className="text-sm font-medium text-slate-800 mb-2">{detailDeadlines.free_replacement_deadline ?? "—"}</p>
                    {freeReplacementExpired === true && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-slate-200 text-slate-600 border border-slate-300">
                        已过保
                      </span>
                    )}
                    {freeReplacementExpired === false && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">
                        未过保
                      </span>
                    )}
                  </div>
                  <div
                    className={`rounded-xl border-2 p-3 ${
                      warrantyExpired === true
                        ? "border-slate-300 bg-slate-100/80"
                        : "border-emerald-200 bg-emerald-50/50"
                    }`}
                  >
                    <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">保修截止</p>
                    <p className="text-sm font-medium text-slate-800 mb-2">{detailDeadlines.warranty_deadline ?? "—"}</p>
                    {warrantyExpired === true && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-slate-200 text-slate-600 border border-slate-300">
                        已过保
                      </span>
                    )}
                    {warrantyExpired === false && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300">
                        未过保
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
