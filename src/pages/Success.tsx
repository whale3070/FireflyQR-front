//src/pages/Success.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  ShieldCheck,
  ExternalLink,
  Loader2,
  Users,
  LineChart,
  MapPin,
  Globe,
  RefreshCw,
  Clock,
  AlertCircle,
  MessageCircle,
} from 'lucide-react';
import { useAppMode } from '../contexts/AppModeContext';
import { EXPLORER_URL } from '../config/chain';
import { mockDelay, MOCK_REGIONS, getRandomBook } from '../data/mockData';
import { useApi } from '../hooks/useApi';

type TxStatus = 'pending' | 'syncing' | 'success' | 'failed';

interface TxData {
  status: string;
  tokenId: string;
  reader: string;
  contract: string;
  txHash: string;
  cached?: boolean;
  blockNumber?: number | string;
  blockTimestamp?: number | string;
  from?: string;
  to?: string;
}

// --- Helpers ---
const isHexAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test((s || '').trim());

const pickFirst = (...vals: Array<string | undefined | null>) => {
  for (const v of vals) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
};

const Success: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isMockMode } = useAppMode();
  const { queryTransaction } = useApi();

  const txHash = (searchParams.get('txHash') || '').trim();

  // ✅ Do NOT default to a fake address; keep empty if not provided.
  const userAddress = (searchParams.get('address') || '').trim().toLowerCase();

  // 红包信息
  const redPacketInfo = useMemo(() => {
    const raw = (searchParams.get('location') || '').split('|')[0] || '';
    const location = (raw === 'Unknown' || !raw) ? '未知' : raw;
    return {
      rewardAmount: parseFloat(searchParams.get('reward_amount') || '0'),
      location,
      firstScanTime: searchParams.get('first_scan_time') || '',
      scanCount: parseInt(searchParams.get('scan_count') || '0', 10),
    };
  }, [searchParams]);

  const initialStatus = (searchParams.get('status') as TxStatus) || 'pending';

  const [txStatus, setTxStatus] = useState<TxStatus>(initialStatus);
  const [txData, setTxData] = useState<TxData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalMinted, setTotalMinted] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [mintedBook] = useState(getRandomBook());
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // ✅ contract fallback from URL (supports contract/book_addr/book_address)
  const contractFromUrl = useMemo(() => {
    return pickFirst(
      searchParams.get('contract'),
      searchParams.get('book_addr'),
      searchParams.get('book_address'),
    );
  }, [searchParams]);

  // ✅ effective contract: txData first, then URL fallback; normalize to lower-case safely
  const effectiveContract = useMemo(() => {
    const c = pickFirst(txData?.contract, contractFromUrl);
    return c ? c.toLowerCase() : '';
  }, [txData?.contract, contractFromUrl]);

  const explorerTxUrl = useMemo(() => {
    if (!txHash) return '';
    return `${EXPLORER_URL}/tx/${txHash}`;
  }, [txHash]);

  const openTxInExplorer = useCallback(() => {
    if (!explorerTxUrl) return;
    window.open(explorerTxUrl, '_blank', 'noopener,noreferrer');
  }, [explorerTxUrl]);

  // 查询交易状态
  const checkTxStatus = useCallback(async () => {
    if (!txHash) return;

    setIsRefreshing(true);
    setTxStatus('syncing');

    try {
      const result = await queryTransaction(txHash);
      setLastChecked(new Date());

      if (result?.ok && result?.data) {
        const d: any = result.data;

        // ✅ be tolerant to field names returned by backend
        const resolvedContract = pickFirst(d.contract, d.bookAddr, d.book_address, d.bookAddress);
        const resolvedReader = pickFirst(d.reader, userAddress);

        setTxData({
          status: String(d.status || ''),
          tokenId: String(d.tokenId || '0'),
          reader: resolvedReader ? resolvedReader.toLowerCase() : '',
          contract: resolvedContract ? resolvedContract.toLowerCase() : '',
          txHash: String(d.txHash || txHash),
          cached: Boolean(d.cached),
          blockNumber: d.blockNumber,
          blockTimestamp: d.blockTimestamp,
          from: d.from ? String(d.from).toLowerCase() : '',
          to: d.to ? String(d.to).toLowerCase() : '',
        });

        const upper = String(d.status || '').toUpperCase();
        if (upper === 'SUCCESS') {
          setTxStatus('success');

          // ✅ demo-only extra data (avoid "fake" numbers in real mode)
          if (isMockMode) {
            await mockDelay(300);
            setTotalMinted(Math.floor(Math.random() * 5000) + 1000);
            const randomLocation = MOCK_REGIONS[Math.floor(Math.random() * MOCK_REGIONS.length)];
            setUserLocation(randomLocation.name);
          } else {
            setTotalMinted(null);
            setUserLocation(null);
          }
        } else if (upper === 'FAILED') {
          setTxStatus('failed');
        } else {
          setTxStatus('pending');
        }
      } else {
        // If API returns not-ok, stay pending
        setTxStatus('pending');
      }
    } catch (e: any) {
      console.error('查询交易状态失败:', e);
      setTxStatus('pending');
    } finally {
      setIsRefreshing(false);
    }
  }, [txHash, queryTransaction, userAddress, isMockMode]);

  // 初始化
  useEffect(() => {
    setTxStatus(initialStatus || 'pending');
  }, [initialStatus]);

  // 进入页面时查一次
  useEffect(() => {
    if (!txHash) return;
    if (initialStatus === 'pending') checkTxStatus();
  }, [txHash, initialStatus, checkTxStatus]);

  // pending 时每 3 秒自动轮询，确认后回显交易详情
  useEffect(() => {
    if (txStatus !== 'pending' && txStatus !== 'syncing') return;
    if (!txHash) return;
    const t = setInterval(() => checkTxStatus(), 3000);
    return () => clearInterval(t);
  }, [txStatus, txHash, checkTxStatus]);

  /**
   * Load Conflux Faucet Plugin
   * Fix:
   * - data-contract must match the real minted contract (effectiveContract)
   * - When contract changes, re-inject script (do not just setAttribute)
   */
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const SCRIPT_ID = 'conflux-faucet-plugin';

    // Only inject when we have a valid-looking contract address
    if (!effectiveContract || !isHexAddress(effectiveContract)) {
      // If contract becomes invalid, clean up any existing plugin script
      const old = document.getElementById(SCRIPT_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }

    // Remove old script to ensure plugin reads new data-attrs
    const existing = document.getElementById(SCRIPT_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const script = document.createElement('script');
    script.id = SCRIPT_ID;

    // Site is http today; if you migrate to https later, update these to https (or use same-protocol logic).
    //script.src = 'http://47.76.50.74/conflux-faucet-plugin.js';
	script.src = '/conflux-faucet-plugin.js';
    script.async = true;

    script.setAttribute('data-contract', effectiveContract);
    script.setAttribute('data-server', 'http://whale3070.com:3000');
    script.setAttribute('data-position', 'bottom-right');
    script.setAttribute('data-text', 'Get Free CFX');
    script.setAttribute('data-color', '#1a2980');

    document.body.appendChild(script);

    return () => {
      const el = document.getElementById(SCRIPT_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }, [effectiveContract]);

  const displayTokenId =
    txData?.tokenId && txData.tokenId !== '0' ? `#${txData.tokenId}` : '#---';

  // ---------- Pending / Syncing (RWA 防二次灌装) ----------
  if (txStatus === 'pending' || txStatus === 'syncing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center py-8 px-4">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center py-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">RWA 防二次灌装 · 正品确权</p>
          </div>

          <div className="text-center space-y-3">
            <div className="flex justify-center relative">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
              </div>
            </div>
            <h2 className="text-xl font-black text-slate-800">交易已提交</h2>
            <p className="text-slate-500 text-sm">区块链确认后，将显示红包 0.1 USDT</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className={`w-5 h-5 text-amber-600 ${txStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <div>
                <p className="text-sm font-bold text-slate-800">等待区块确认</p>
                <p className="text-xs text-slate-500">通常需要 1-5 分钟完成铸造并通知所有节点</p>
              </div>
            </div>

            {txHash && (
              <div className="bg-white rounded-xl p-4 border border-amber-100">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-1">交易哈希</p>
                <p className="text-xs text-slate-600 font-mono break-all">{txHash}</p>
              </div>
            )}

            {lastChecked && (
              <p className="text-xs text-slate-400 text-center">上次检查: {lastChecked.toLocaleTimeString()}</p>
            )}
          </div>

          <button
            onClick={checkTxStatus}
            disabled={isRefreshing || !txHash}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold text-sm uppercase tracking-widest hover:from-indigo-600 hover:to-purple-600 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? '正在查询...' : '刷新状态'}
          </button>

          <button
            onClick={openTxInExplorer}
            disabled={!explorerTxUrl}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            链上哈希核验
          </button>

          <div className="text-center space-y-2">
            <button
              onClick={() => navigate('/bookshelf')}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest"
            >
              返回书架
            </button>
            <p className="text-xs text-slate-400 uppercase tracking-widest">RWA 防二次灌装 · No Refill</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Failed ----------
  if (txStatus === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center py-8 px-4">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center py-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">RWA 防二次灌装 · 正品确权</p>
          </div>
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-slate-800">交易失败</h2>
            <p className="text-slate-500 text-sm">链上交易未能成功执行</p>
          </div>

          {txHash && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-xs text-slate-400 uppercase font-semibold mb-1">交易哈希</p>
              <p className="text-xs text-slate-600 font-mono break-all">{txHash}</p>
            </div>
          )}

          {explorerTxUrl && (
            <button
              onClick={openTxInExplorer}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              打开区块浏览器
            </button>
          )}

          <button
            onClick={() => navigate('/bookshelf')}
            className="w-full py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            返回书架
          </button>
          <p className="text-center text-xs text-slate-400 uppercase tracking-widest pt-4">RWA 防二次灌装 · No Refill</p>
        </div>
      </div>
    );
  }

  // ---------- Success (RWA 防二次灌装) ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center py-8 px-4">
      <div className="max-w-md w-full space-y-6">
        {/* RWA 防二次灌装 品牌条 */}
        <div className="text-center py-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">RWA 防二次灌装 · 正品确权</p>
        </div>

        {/* 恭喜获得红包 - 主提示 */}
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl p-6 text-center shadow-lg border border-amber-300">
          <p className="text-amber-900/90 text-sm font-medium mb-2">恭喜你，获得红包</p>
          <p className="text-3xl font-black text-white">0.1 USDT</p>
          <p className="text-amber-100 text-xs mt-2">本码已核销，防二次灌装</p>
        </div>

        <div className="text-center space-y-3">
          <div className="flex justify-center relative">
            <CheckCircle className="w-14 h-14 text-emerald-500" />
            <ShieldCheck className="w-5 h-5 text-white bg-emerald-500 rounded-full absolute bottom-0 right-1/2 translate-x-8 border-2 border-slate-50" />
          </div>
          <h2 className="text-xl font-black text-slate-800">确权成功</h2>
          <p className="text-slate-500 text-xs">NFT 存证已上链，不可篡改</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-soft">
          <img
            src={mintedBook.coverImage}
            alt={mintedBook.title}
            className="w-16 h-24 object-cover rounded-lg"
            onError={(e) => {
              e.currentTarget.src = 'https://placehold.co/100x150/e2e8f0/6366f1?text=NFT';
            }}
          />
          <div>
            <p className="text-slate-800 font-bold">{mintedBook.title}</p>
            <p className="text-xs text-slate-400">{mintedBook.author}</p>
            <div
              className={`mt-2 inline-block px-2 py-1 rounded text-[10px] font-bold uppercase ${
                mintedBook.verificationStatus === 'Verified Genuine'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-red-100 text-red-600'
              }`}
            >
              {mintedBook.verificationStatus}
            </div>
          </div>
        </div>

        {totalMinted !== null && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-3xl p-6 text-center space-y-3">
            <p className="text-xs text-indigo-600 uppercase font-semibold tracking-widest">🎉 恭喜你成为</p>
            <p className="text-5xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              第 {totalMinted} 位
            </p>
            <p className="text-slate-500 text-xs">全球领取此书 NFT 存证的读者</p>
            {userLocation && (
              <div className="flex items-center justify-center gap-2 mt-2 text-emerald-600">
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">{userLocation} 已点亮 !</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-soft">
          <div className="flex justify-between items-end border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold">勋章编号</span>
              <p className="text-xl font-black text-indigo-600">{displayTokenId}</p>
            </div>
            <p className="text-xs text-emerald-600 font-semibold uppercase">Verified</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-400 uppercase font-semibold">绑定地址</span>
            <p className="text-xs text-slate-500 font-mono break-all">
              {txData?.reader || userAddress || '—'}
            </p>
          </div>

          {effectiveContract && (
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-semibold">合约地址</span>
              <p className="text-xs text-slate-500 font-mono break-all">{effectiveContract}</p>
              {!isHexAddress(effectiveContract) && (
                <p className="text-[10px] text-amber-600">⚠️ 合约地址格式看起来不正确，faucet 插件不会加载。</p>
              )}
            </div>
          )}

          {txData?.cached && (
            <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded inline-block">⚡ 缓存数据</div>
          )}
        </div>

        {/* 链上交易详情（确认成功后回显） */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">链上交易详情</p>
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-slate-500 shrink-0">Transaction Hash:</dt>
              <dd className="font-mono text-slate-800 break-all">{txHash || '—'}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="text-slate-500 shrink-0">Status:</dt>
              <dd className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Success
              </dd>
            </div>
            {txData?.blockNumber != null && (
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="text-slate-500 shrink-0">Block:</dt>
                <dd className="font-mono text-slate-800">{String(txData.blockNumber)}</dd>
              </div>
            )}
            {txData?.blockTimestamp != null && (
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="text-slate-500 shrink-0">Timestamp:</dt>
                <dd className="text-slate-800">
                  {new Date(Number(txData.blockTimestamp) * 1000).toLocaleString('zh-CN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  (UTC)
                </dd>
              </div>
            )}
            {txData?.from && (
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="text-slate-500 shrink-0">From:</dt>
                <dd className="font-mono text-slate-800 break-all">{txData.from}</dd>
              </div>
            )}
            {txData?.to && (
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="text-slate-500 shrink-0">To:</dt>
                <dd className="font-mono text-slate-800 break-all">{txData.to}</dd>
              </div>
            )}
            {effectiveContract && (
              <div className="flex flex-wrap items-baseline gap-2">
                <dt className="text-slate-500 shrink-0">Created:</dt>
                <dd className="font-mono text-slate-800 break-all">{effectiveContract}</dd>
              </div>
            )}
          </dl>
          {explorerTxUrl && (
            <button
              type="button"
              onClick={openTxInExplorer}
              className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200"
            >
              <ExternalLink className="w-4 h-4" />
              在区块浏览器中查看
            </button>
          )}
        </div>

        {/* 红包信息 */}
        {redPacketInfo.rewardAmount > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-3xl p-6 space-y-4 shadow-soft">
            <div className="text-center space-y-2">
              <span className="text-3xl">🧧</span>
              <h3 className="text-lg font-bold text-red-600">红包领取成功</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-white rounded-2xl p-4 border border-red-100">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-1">红包金额</p>
                <p className="text-2xl font-black text-red-500">¥{redPacketInfo.rewardAmount.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-red-100">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-1">扫码次数</p>
                <p className="text-2xl font-black text-orange-500">第 {redPacketInfo.scanCount} 次</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="w-4 h-4 text-red-400" />
                <span>{redPacketInfo.location}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="w-4 h-4 text-red-400" />
                <span>{redPacketInfo.firstScanTime || '刚刚'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest text-center mb-1">
            下一步行动计划
          </p>

          <button
            onClick={() => navigate('/Heatmap')}
            className="flex items-center gap-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 p-4 rounded-2xl hover:from-indigo-100 hover:to-purple-100 transition-all group text-left"
          >
            <div className="bg-indigo-100 p-3 rounded-xl">
              <Globe className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">查看全球读者热力图</h4>
              <p className="text-xs text-indigo-600">你的地区已被点亮！</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/reward')}
            className="flex items-center gap-4 bg-white border border-slate-200 p-4 rounded-2xl hover:bg-slate-50 transition-all group text-left"
          >
            <div className="bg-emerald-100 p-3 rounded-xl">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">推荐 5 位新用户</h4>
              <p className="text-xs text-slate-500">邀请好友激活，赚取节点分成收益</p>
            </div>
          </button>

          <a
            href="https://matrix.to/#/!jOcJpAxdUNYvaMZuqJ:matrix.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 p-4 rounded-2xl hover:from-pink-100 hover:to-rose-100 transition-all group text-left"
          >
            <div className="bg-pink-100 p-3 rounded-xl">
              <MessageCircle className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">加入读者俱乐部</h4>
              <p className="text-xs text-pink-600">和作者、其他读者一起在线分享读书感想</p>
            </div>
          </a>

          <button
            onClick={() => navigate('/bookshelf')}
            className="flex items-center gap-4 bg-gradient-to-r from-indigo-500 to-purple-500 p-4 rounded-2xl hover:from-indigo-600 hover:to-purple-600 transition-all group text-left shadow-md"
          >
            <div className="bg-white/20 p-3 rounded-xl">
              <LineChart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">进入&quot;终焉大盘系统&quot;</h4>
              <p className="text-xs text-white/80">预判销量第一的爆款书籍</p>
            </div>
          </button>
        </div>

        <div className="pt-4 text-center space-x-4">
          {txHash && (
            <button
              onClick={checkTxStatus}
              disabled={isRefreshing}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5 uppercase tracking-widest disabled:opacity-50"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  查询中...
                </>
              ) : (
                <>
                  刷新交易状态 <RefreshCw className="w-3 h-3" />
                </>
              )}
            </button>
          )}

          {explorerTxUrl && (
            <button
              onClick={openTxInExplorer}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5 uppercase tracking-widest"
            >
              链上哈希核验 <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 uppercase tracking-widest pt-4">
          RWA 防二次灌装 · No Refill
        </p>
      </div>
    </div>
  );
};

export default Success;
