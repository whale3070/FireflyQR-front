import React from "react";
import { useOutletContext } from "react-router-dom";
import type { PublisherOutletContext } from "./PublisherAdminLayout";

export default function QrCodePage() {
  const {
    envMode,
    bookSales,
    contractAddr,
    setContractAddr,

    // 下拉框列表（real 模式）
    bookListForDropdown,
    bookListLoading,
    fetchBookListForDropdown,

    selectedBook,
    setSelectedBook,
    shortenAddress,

    // batch
    count,
    setCount,
    opLoading,
    handleGenerateBatch,
  } = useOutletContext<PublisherOutletContext>();

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl shadow-soft border border-slate-100 p-8">
        <h2 className="text-lg font-bold text-slate-800 mb-6">🔗 批量生成二维码</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">
              选择已部署的书籍合约
            </label>

            {envMode === "mock" ? (
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
                value={contractAddr || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setContractAddr(v || null);
                  setSelectedBook(null);
                }}
              >
                <option value="">-- 选择合约 --</option>
                {bookSales.map((book) => (
                  <option key={book.address} value={book.address}>
                    {book.symbol} - {book.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
                    value={contractAddr || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setContractAddr(v || null);
                      const item = bookListForDropdown.find((b) => (b.bookAddr || "").toLowerCase() === (v || "").toLowerCase());
                      setSelectedBook(item || null);
                    }}
                    disabled={bookListLoading}
                  >
                    <option value="">-- 选择已部署的书籍合约 --</option>
                    {bookListForDropdown.map((b) => {
                      const addr = (b.bookAddr || "").toString();
                      const label = [b.symbol, b.name].filter(Boolean).join(" - ") || shortenAddress(addr);
                      return (
                        <option key={addr} value={addr}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={fetchBookListForDropdown}
                    disabled={bookListLoading}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 disabled:opacity-50"
                    title="刷新列表"
                  >
                    {bookListLoading ? (
                      <span className="inline-block w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
                {bookListLoading && <p className="text-xs text-slate-500">加载书籍列表中...</p>}
                {!bookListLoading && bookListForDropdown.length === 0 && (
                  <p className="text-sm text-slate-500">暂无已部署的商品，请先在「部署商品」中部署</p>
                )}
                {selectedBook && contractAddr ? (
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                    已选择：《{selectedBook.name || "未命名"}》 (
                    {(selectedBook.symbol || "").toString()} /{" "}
                    {(selectedBook.serial || "").toString()})
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2 uppercase font-semibold">
              生成数量
            </label>
            <input
              type="number"
              placeholder="100"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 100)}
            />
          </div>

          <button
            onClick={handleGenerateBatch}
            disabled={opLoading || !contractAddr}
            className="w-full mt-4 py-4 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 transition-all shadow-md"
          >
            {opLoading ? "生成中..." : `生成 ${count} 个二维码`}
          </button>
        </div>
      </div>
    </div>
  );
}
