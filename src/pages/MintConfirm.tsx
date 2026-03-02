import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAppMode } from "../contexts/AppModeContext";
import { useApi } from "../hooks/useApi";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";

type TxStatusResult =
  | { ok: true; data: { status: "SUCCESS" | "FAILED" | "PENDING"; tokenId?: string; reader?: string } }
  | { ok: false; error?: string };

export default function MintConfirm() {
  const { hashCode } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isMockMode } = useAppMode();
  const { mintNFT, queryTransaction, getBinding, claimRedPacket } = useApi();

  const [error, setError] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<string>("");
  const [hasStarted, setHasStarted] = useState(false);

  const codeHash = (hashCode || params.get("code") || "").trim();
  const bookIdRaw = params.get("book_id") ?? "1";

  // ✅ 交易轮询（如果你未来要在本页做“确认后再跳转”，可以启用；当前只用于 Success 页自己确认也行）
  const pollTransactionStatus = useCallback(
    async (
      txHash: string,
      maxAttempts = 30
    ): Promise<{
      success: boolean;
      tokenId?: string;
      reader?: string;
    }> => {
      for (let i = 0; i < maxAttempts; i++) {
        setMintStatus(`确认交易中... (${i + 1}/${maxAttempts})`);

        try {
          const result = (await queryTransaction(txHash)) as TxStatusResult;

          if (result?.ok && result.data) {
            if (result.data.status === "SUCCESS") {
              return { success: true, tokenId: result.data.tokenId, reader: result.data.reader };
            }
            if (result.data.status === "FAILED") {
              return { success: false };
            }
          }
        } catch (e: any) {
          console.warn("查询交易状态出错:", e);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      return { success: false };
    },
    [queryTransaction]
  );

  useEffect(() => {
    const performMint = async () => {
      if (!codeHash || hasStarted) return;
      setHasStarted(true);

      // ✅ 你说要删“模拟 mint”，所以：DEMO 模式不允许 mint
      if (isMockMode) {
        setError("MINT_DISABLED_IN_DEMO");
        return;
      }

      // ✅ 更严格的 codeHash 校验（你后端 verify / binding 通常要求 64 hex）
      const hex64 = /^[a-fA-F0-9]{64}$/;
      const normalized = codeHash.startsWith("0x") ? codeHash.slice(2) : codeHash;
      if (!hex64.test(normalized)) {
        setError("INVALID_CODE");
        return;
      }

      try {
        // 1) 获取绑定信息（必须成功）
        setMintStatus("验证读者身份...");
        const bindResult: any = await getBinding(codeHash);
        console.log("[MintConfirm] 绑定信息返回:", bindResult);

        if (!bindResult?.ok) {
          throw new Error(bindResult?.error || "验证失败");
        }

        // 允许 valid / used（used 可能是二次访问确认页）
        if (bindResult.status !== "valid" && bindResult.status !== "used") {
          throw new Error("无效的激活码状态");
        }

        const bookAddress = (bindResult.book_address || "").trim();
        const readerAddress = (bindResult.address || "").trim();

        if (!bookAddress) {
          setError("MISSING_BOOK_ADDRESS");
          return;
        }
        if (!readerAddress) {
          setError("MISSING_READER_ADDRESS");
          return;
        }

        // 2) 发起 mint（必须成功拿到 txHash）
        setMintStatus("正在链上铸造 NFT...");
        const mintResult: any = await mintNFT(bookAddress, readerAddress);

        const txHash = (mintResult?.data?.tx_hash || "").trim();
        if (!mintResult?.ok || !txHash) {
          throw new Error(mintResult?.error || "铸造失败（未返回 tx_hash）");
        }

        // 3) 领取红包
        setMintStatus("正在领取红包...");
        let redPacketInfo = {
          reward_amount: 0,
          location: "",
          first_scan_time: "",
          scan_count: 0,
        };
        try {
          const redPacketResult: any = await claimRedPacket(codeHash, readerAddress);
          if (redPacketResult?.ok && redPacketResult?.data) {
            redPacketInfo = {
              reward_amount: redPacketResult.data.reward_amount || 0,
              location: redPacketResult.data.location || "",
              first_scan_time: redPacketResult.data.first_scan_time || "",
              scan_count: redPacketResult.data.scan_count || 0,
            };
          }
        } catch (e) {
          console.warn("领取红包失败（不影响主流程）:", e);
        }

        setMintStatus("正在跳转...");

        const query = new URLSearchParams({
          book_id: bookIdRaw,
          address: readerAddress,
          codeHash,
          status: "pending",
          txHash,
          // 红包信息
          reward_amount: redPacketInfo.reward_amount.toString(),
          location: redPacketInfo.location,
          first_scan_time: redPacketInfo.first_scan_time,
          scan_count: redPacketInfo.scan_count.toString(),
        });

        navigate(`/success?${query.toString()}`, { replace: true });
      } catch (e: any) {
        console.error("Mint flow error:", e);
        setError(e?.message || "MINT_FAILED");
      }
    };

    performMint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeHash, hasStarted, isMockMode, mintNFT, getBinding, claimRedPacket, pollTransactionStatus, navigate, bookIdRaw]);

  if (error) {
    const getErrorInfo = () => {
      // ✅ 这里统一把 error 文本映射成人类可读信息
      if (error === "MINT_DISABLED_IN_DEMO") {
        return {
          title: "Demo 模式不支持铸造",
          desc: "你已删除模拟 mint 流程。请切换到 REAL/DEV API 模式后再扫码铸造。",
        };
      }
      if (error === "INVALID_CODE") {
        return { title: "无效的二维码", desc: "codeHash 应为 64 位十六进制字符串（可带 0x 前缀）。" };
      }
      if (error === "MISSING_BOOK_ADDRESS") {
        return { title: "缺少书籍合约地址", desc: "无法从绑定信息中获取 book_address。" };
      }
      if (error === "MISSING_READER_ADDRESS") {
        return { title: "缺少读者地址", desc: "无法从绑定信息中获取读者钱包地址。" };
      }
      // 兜底：展示后端/异常信息
      return { title: "铸造失败", desc: String(error) };
    };

    const errorInfo = getErrorInfo();

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-6 shadow-lg">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
            <span className="text-red-500 text-4xl">✕</span>
          </div>

          <h1 className="text-xl font-bold text-slate-800">{errorInfo.title}</h1>
          <p className="text-sm text-slate-500 leading-relaxed break-words">{errorInfo.desc}</p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left">
            <p className="text-xs text-slate-500 font-medium">当前模式</p>
            <p className="mt-1 text-xs font-mono text-slate-700">{isMockMode ? "DEMO" : "DEV API / REAL"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
            >
              重试
            </button>
            <button
              onClick={() => navigate("/bookshelf", { replace: true })}
              className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              返回大盘
            </button>
          </div>
        </div>

        <div className="mt-10 text-xs text-slate-400 uppercase tracking-widest font-medium">
          Whale Vault Protocol <span className="mx-2">•</span> {isMockMode ? "DEMO MODE" : "DEV API"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center">
      <LoadingSpinner message={mintStatus || "正在验证二维码..."} variant="chain" size="lg" />

      <div className="mt-8 max-w-xs text-center">
        <div className={`bg-emerald-50 border-emerald-200 border rounded-xl p-4`}>
          <p className={`text-xs text-emerald-700 font-semibold uppercase tracking-wider`}>🟢 DEV API</p>
          <p className="text-xs text-slate-500 mt-1">正在与后端 API 通信...</p>
        </div>
      </div>
    </div>
  );
}
