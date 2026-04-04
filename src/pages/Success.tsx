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
import { ethers } from 'ethers';
import { useAppMode } from '../contexts/AppModeContext';
import { EXPLORER_URL, RPC_URL, BOOK_NFT_ABI } from '../config/chain';
import { mockDelay, MOCK_REGIONS } from '../data/mockData';
import { useApi } from '../hooks/useApi';
import { normalizeAssetUrl, parseJsonDataUri } from '../lib/nftAssetUrl';

type TxStatus = 'pending' | 'syncing' | 'success' | 'failed';

interface TxData {
  status: string;
  tokenId: string;
  reader: string;
  contract: string;
  txHash: string;
  imageUrl?: string;
  metadataUrl?: string;
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
  const { queryTransaction, getSecondaryActivateReceiver, secondaryActivate } = useApi();

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
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // 售后截止日期（领取成功后按 code_hash 拉取）
  const codeHashForApi = useMemo(() => {
    const raw = (searchParams.get('codeHash') || searchParams.get('code_hash') || '').trim();
    return raw.startsWith('0x') ? raw.slice(2) : raw;
  }, [searchParams]);
  const [deadlines, setDeadlines] = useState<{
    free_replacement_deadline: string;
    warranty_deadline: string;
    claim_time?: string;
  } | null>(null);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);
  const [listForSaleLoading, setListForSaleLoading] = useState(false);
  const [listForSaleError, setListForSaleError] = useState<string | null>(null);
  const [listForSaleTxHash, setListForSaleTxHash] = useState<string | null>(null);
  const [listedForSale, setListedForSale] = useState<boolean | null>(null);
  const [showResaleRuleModal, setShowResaleRuleModal] = useState(false);
  const [nftCertificateImage, setNftCertificateImage] = useState<string>('');
  const [nftMeta, setNftMeta] = useState<{ name: string; description: string } | null>(null);

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

  const nftImageFromUrl = useMemo(() => {
    return pickFirst(searchParams.get('nft_image'), searchParams.get('image'), searchParams.get('image_url'));
  }, [searchParams]);

  // 二次激活：唤起钱包 → 向子合约转 1.1 PAS → 成功后后端为该钱包铸造新 NFT（无需挂售/非持有者等条件）
  const handleListForSale = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth) {
      setListForSaleError('请安装 MetaMask 或其它钱包扩展后重试');
      return;
    }
    setListForSaleLoading(true);
    setListForSaleError(null);
    setListForSaleTxHash(null);
    try {
      await eth.request({ method: 'eth_requestAccounts' });
      const contractAddr = effectiveContract?.startsWith('0x') ? effectiveContract : effectiveContract ? `0x${effectiveContract}` : '';
      if (!contractAddr || !isHexAddress(contractAddr)) {
        setListForSaleError('缺少子合约地址，请确认交易已上链且页面已加载合约信息');
        return;
      }
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const walletAddr = (await signer.getAddress()).toLowerCase();
      // 1. 从后端获取收款地址（须为当前链 EOA，否则会 missing revert data）
      const receiverRes = await getSecondaryActivateReceiver();
      const paymentTo = receiverRes?.ok && receiverRes?.payment_receiver && isHexAddress(receiverRes.payment_receiver)
        ? receiverRes.payment_receiver
        : '';
      if (!paymentTo) {
        setListForSaleError((receiverRes as { error?: string })?.error ?? '无法获取收款地址，请确认后端已配置 TREASURY_ADDRESS 且为当前链的 EOA');
        return;
      }
      const tx = await signer.sendTransaction({
        to: paymentTo,
        value: ethers.parseEther('1.1'),
        data: '0x',
      });
      const rec = await tx.wait();
      const paymentHash = rec?.hash ?? tx?.hash;
      if (!paymentHash) {
        setListForSaleError('转账成功但未获取到交易哈希');
        return;
      }
      setListForSaleTxHash(paymentHash);
      // 2. 通知后端：校验该笔转账并为当前钱包铸造新 NFT
      const apiRes = await secondaryActivate(contractAddr, paymentHash, walletAddr);
      if (apiRes?.ok && apiRes?.data?.tx_hash) {
        setListedForSale(true);
        setListForSaleError(null);
      } else {
        setListForSaleError((apiRes as { error?: string })?.error ?? '后端铸造 NFT 失败');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setListForSaleError(msg || '二次激活失败');
    } finally {
      setListForSaleLoading(false);
    }
  }, [effectiveContract, getSecondaryActivateReceiver, secondaryActivate]);

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
        const resolvedImage = pickFirst(d.imageUrl, d.image_url, d.image);
        const resolvedMetadata = pickFirst(d.metadataUrl, d.metadata_url);

        setTxData({
          status: String(d.status || ''),
          tokenId: String(d.tokenId || '0'),
          reader: resolvedReader ? resolvedReader.toLowerCase() : '',
          contract: resolvedContract ? resolvedContract.toLowerCase() : '',
          txHash: String(d.txHash || txHash),
          imageUrl: resolvedImage,
          metadataUrl: resolvedMetadata,
          cached: Boolean(d.cached),
          blockNumber: d.blockNumber,
          blockTimestamp: d.blockTimestamp,
          from: d.from ? String(d.from).toLowerCase() : '',
          to: d.to ? String(d.to).toLowerCase() : '',
        });

        const upper = String(d.status || '').toUpperCase();
        const hasValidContract = isHexAddress(resolvedContract);
        const hasValidReader = isHexAddress(resolvedReader);
        const hasTokenId = d.tokenId !== undefined && d.tokenId !== null && String(d.tokenId).trim() !== '';

        if (upper === 'SUCCESS' && hasValidContract && hasValidReader && hasTokenId) {
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

  // 确权成功后可选：查询当前 NFT 是否已挂售（只读）
  useEffect(() => {
    if (txStatus !== 'success' || !effectiveContract || !txData?.tokenId) return;
    const addr = effectiveContract.startsWith('0x') ? effectiveContract : `0x${effectiveContract}`;
    if (!isHexAddress(addr)) return;
    const provider = new ethers.JsonRpcProvider(RPC_URL || '');
    const c = new ethers.Contract(addr, BOOK_NFT_ABI as ethers.InterfaceAbi, provider);
    c.listedForSale(txData.tokenId).then((v: boolean) => setListedForSale(v)).catch(() => {});
  }, [txStatus, effectiveContract, txData?.tokenId]);

  // 确权成功后拉取售后截止日期（免费换新 / 保修）
  useEffect(() => {
    if (txStatus !== 'success' || !codeHashForApi) return;
    let cancelled = false;
    setDeadlinesLoading(true);
    fetch(
      `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/sku-deadlines?code_hash=${encodeURIComponent(codeHashForApi)}`,
      { method: 'GET' }
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setDeadlines({
          free_replacement_deadline: data.free_replacement_deadline || '',
          warranty_deadline: data.warranty_deadline || '',
          claim_time: data.claim_time,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDeadlinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [txStatus, codeHashForApi]);

  // Resolve certificate image:
  // 1) explicit URL param (nft_image/image/image_url)
  // 2) on-chain tokenURI -> metadata.image
  // 3) inline SVG fallback
  useEffect(() => {
    let cancelled = false;

    const fallbackSvg = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#312e81" />
          </linearGradient>
        </defs>
        <rect width="1200" height="760" fill="url(#g)" />
        <rect x="28" y="28" width="1144" height="704" rx="24" fill="none" stroke="#94a3b8" stroke-opacity="0.4" stroke-width="2" />
        <text x="80" y="130" fill="#a5b4fc" font-family="Arial, sans-serif" font-size="24" letter-spacing="4">WHALE VAULT</text>
        <text x="80" y="220" fill="#ffffff" font-family="Arial, sans-serif" font-size="64" font-weight="700">NFT CERTIFICATE</text>
        <text x="80" y="300" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="28">Token ${displayTokenId}</text>
        <text x="80" y="360" fill="#e2e8f0" font-family="Arial, sans-serif" font-size="20">Owner: ${(txData?.reader || userAddress || 'N/A').slice(0, 16)}...</text>
        <text x="80" y="405" fill="#e2e8f0" font-family="Arial, sans-serif" font-size="20">Contract: ${effectiveContract ? effectiveContract.slice(0, 16) : 'N/A'}...</text>
        <text x="80" y="660" fill="#94a3b8" font-family="Arial, sans-serif" font-size="18">On-chain proof. Tamper-resistant.</text>
      </svg>`
    )}`;

    const resolveImage = async () => {
      if (txStatus !== 'success') {
        setNftCertificateImage('');
        setNftMeta(null);
        return;
      }

      if (nftImageFromUrl) {
        setNftMeta(null);
        setNftCertificateImage(normalizeAssetUrl(nftImageFromUrl));
        return;
      }

      if (txData?.imageUrl) {
        setNftMeta(null);
        setNftCertificateImage(normalizeAssetUrl(txData.imageUrl));
        return;
      }

      const tokenIdRaw = txData?.tokenId;
      if (!effectiveContract || tokenIdRaw === undefined || tokenIdRaw === null || String(tokenIdRaw).trim() === '' || !isHexAddress(effectiveContract)) {
        setNftMeta(null);
        setNftCertificateImage(fallbackSvg);
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL || '');
        const c = new ethers.Contract(effectiveContract, BOOK_NFT_ABI as ethers.InterfaceAbi, provider);
        const tokenUri: string = await c.tokenURI(tokenIdRaw);
        if (cancelled) return;
        if (!tokenUri) {
          setNftMeta(null);
          setNftCertificateImage(fallbackSvg);
          return;
        }

        let meta: Record<string, unknown> | null = null;
        const inlineMeta = parseJsonDataUri(tokenUri);
        if (inlineMeta) {
          meta = inlineMeta;
        } else {
          const metaUrl = normalizeAssetUrl(tokenUri);
          const resp = await fetch(metaUrl, { method: 'GET' });
          if (resp.ok) {
            meta = (await resp.json()) as Record<string, unknown>;
          }
        }
        if (cancelled) return;

        const name = typeof meta?.name === 'string' ? meta.name : '';
        const description = typeof meta?.description === 'string' ? meta.description : '';
        if (name || description) {
          setNftMeta({ name, description });
        } else {
          setNftMeta(null);
        }

        const img = normalizeAssetUrl(String(meta?.image ?? meta?.image_url ?? ''));
        setNftCertificateImage(img || fallbackSvg);
      } catch {
        if (!cancelled) {
          setNftMeta(null);
          setNftCertificateImage(fallbackSvg);
        }
      }
    };

    resolveImage();
    return () => {
      cancelled = true;
    };
  }, [txStatus, nftImageFromUrl, txData?.imageUrl, txData?.tokenId, txData?.reader, userAddress, effectiveContract, displayTokenId]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col items-center py-6 px-4">
      <div className="w-full max-w-4xl">
        {/* 顶部：品牌 + 确权成功 */}
        <header className="text-center mb-8">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">RWA 防二次灌装 · 正品确权</p>
          <div className="flex justify-center items-center gap-4 mt-4">
            <div className="flex justify-center relative">
              <CheckCircle className="w-12 h-12 text-emerald-500" />
              <ShieldCheck className="w-5 h-5 text-white bg-emerald-500 rounded-full absolute -bottom-0.5 -right-1 border-2 border-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">确权成功</h1>
              <p className="text-slate-500 text-sm">NFT 存证已上链，不可篡改</p>
            </div>
          </div>
        </header>

        {/* 主内容：两栏（大屏） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 左栏：勋章存证 + 二次激活 */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">勋章存证</span>
                <span className="text-[10px] text-emerald-600 font-semibold uppercase">Verified</span>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 mb-4">
                <img
                  src={nftCertificateImage || ''}
                  alt={nftMeta?.name || 'NFT certificate'}
                  className="w-full h-52 object-cover"
                />
              </div>
              {(nftMeta?.name || nftMeta?.description) && (
                <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  {nftMeta.name ? (
                    <p className="text-sm font-bold text-slate-900 leading-snug">{nftMeta.name}</p>
                  ) : null}
                  {nftMeta.description ? (
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed line-clamp-5">{nftMeta.description}</p>
                  ) : null}
                </div>
              )}
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">Token</p>
                  <p className="text-indigo-600 font-bold text-base">{displayTokenId}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">绑定地址</p>
                  <p className="text-slate-600 font-mono break-all text-xs">{txData?.reader || userAddress || '—'}</p>
                </div>
                {effectiveContract && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-medium mb-0.5">合约地址</p>
                    <p className="text-slate-600 font-mono break-all text-xs">{effectiveContract}</p>
                    {!isHexAddress(effectiveContract) && (
                      <p className="text-[10px] text-amber-600 mt-1">⚠️ 合约地址格式异常</p>
                    )}
                  </div>
                )}
              </div>
              {txData?.cached && (
                <p className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded mt-3 inline-block">⚡ 缓存数据</p>
              )}
            </section>

            {txStatus === 'success' && effectiveContract && (
              <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowResaleRuleModal(true)}
                  className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 hover:text-indigo-600 transition-colors cursor-pointer text-left"
                >
                  二手流转
                </button>
                {listedForSale === true ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold">该 NFT 已二次激活，新 NFT 已铸造至您的钱包</span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={listForSaleLoading}
                      onClick={handleListForSale}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-sm"
                    >
                      {listForSaleLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> 二次激活中…</>
                      ) : (
                        '二次激活NFT'
                      )}
                    </button>
                    <p className="text-[10px] text-slate-400 mt-1.5">连接钱包后向子合约转账 1.1 PAS，成功后将为您铸造新 NFT</p>
                  </>
                )}
                {listForSaleError && <p className="mt-1.5 text-xs text-red-600">{listForSaleError}</p>}
                {listForSaleTxHash && (
                  <button
                    type="button"
                    onClick={() => window.open(`${EXPLORER_URL}/tx/${listForSaleTxHash}`, '_blank')}
                    className="mt-1.5 text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    查看二次激活交易 <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </section>
            )}

            {/* 二手流转说明弹框 */}
            {showResaleRuleModal && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onClick={() => setShowResaleRuleModal(false)}
              >
                <div
                  className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-slate-700 leading-relaxed">
                    当转账押金 X+1 元金额后，即可二次激活 NFT，上一任用户的押金 X 元可以申请退还。
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowResaleRuleModal(false)}
                    className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors"
                  >
                    知道了
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 右栏：售后保障 + 第 N 位 + 红包 */}
          <div className="space-y-4">
            <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center mb-3">售后保障</p>
              <div className="flex items-center justify-center gap-4">
                <div className="hourglass-wrap flex-shrink-0" style={{ width: 48, height: 60 }}>
                  <svg width="48" height="60" viewBox="0 0 64 80" className="text-amber-500 w-full h-full" fill="currentColor" aria-hidden>
                    <path d="M32 4 L60 40 L32 76 L4 40 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M4 40 L32 40 L60 40" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                    <path d="M8 36 L28 8 L32 4 L36 8 L56 36" fill="currentColor" opacity="0.9" className="hourglass-sand-top" />
                    <path d="M8 44 L28 72 L32 76 L36 72 L56 44" fill="currentColor" opacity="0.25" className="hourglass-sand-bottom" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  {deadlinesLoading && <p className="text-xs text-slate-400">加载中…</p>}
                  {!deadlinesLoading && deadlines && (deadlines.free_replacement_deadline || deadlines.warranty_deadline) && (
                    <div className="space-y-1.5 text-sm">
                      {deadlines.free_replacement_deadline && (
                        <div>
                          <p className="text-[10px] text-slate-400">免费换新截止</p>
                          <p className="font-semibold text-slate-800">{deadlines.free_replacement_deadline}</p>
                        </div>
                      )}
                      {deadlines.warranty_deadline && (
                        <div>
                          <p className="text-[10px] text-slate-400">保修截止</p>
                          <p className="font-semibold text-slate-800">{deadlines.warranty_deadline}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {!deadlinesLoading && (!deadlines || (!deadlines.free_replacement_deadline && !deadlines.warranty_deadline)) && codeHashForApi && (
                    <p className="text-xs text-slate-400">暂无该码的售后期限</p>
                  )}
                </div>
              </div>
            </section>

            {totalMinted !== null && (
              <section className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5 shadow-sm">
                <p className="text-[10px] text-indigo-600 uppercase font-semibold tracking-wider mb-1">🎉 恭喜你成为</p>
                <p className="text-3xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  第 {totalMinted} 位
                </p>
                <p className="text-slate-500 text-xs mt-0.5">全球领取此书 NFT 存证的读者</p>
                {userLocation && (
                  <div className="flex items-center gap-1.5 mt-2 text-emerald-600 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>{userLocation} 已点亮</span>
                  </div>
                )}
              </section>
            )}

            {redPacketInfo.rewardAmount > 0 && (
              <section className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🧧</span>
                  <h3 className="text-base font-bold text-red-600">红包领取成功</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/80 rounded-xl p-3 border border-red-100">
                    <p className="text-[10px] text-slate-500 uppercase">红包金额</p>
                    <p className="text-xl font-black text-red-500">¥{redPacketInfo.rewardAmount.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/80 rounded-xl p-3 border border-red-100">
                    <p className="text-[10px] text-slate-500 uppercase">扫码次数</p>
                    <p className="text-xl font-black text-orange-500">第 {redPacketInfo.scanCount} 次</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-red-400" />{redPacketInfo.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-red-400" />{redPacketInfo.firstScanTime || '刚刚'}</span>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* 下一步：四宫格 */}
        <section className="mb-8">
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest text-center mb-3">下一步</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => navigate('/Heatmap')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-indigo-200 hover:shadow transition-all text-center"
            >
              <div className="bg-indigo-100 p-2.5 rounded-xl"><Globe className="w-5 h-5 text-indigo-600" /></div>
              <span className="text-xs font-bold text-slate-800 leading-tight">全球热力图</span>
            </button>
            <button
              onClick={() => navigate('/reward')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-emerald-200 hover:shadow transition-all text-center"
            >
              <div className="bg-emerald-100 p-2.5 rounded-xl"><Users className="w-5 h-5 text-emerald-600" /></div>
              <span className="text-xs font-bold text-slate-800 leading-tight">推荐新用户</span>
            </button>
            <a
              href="https://matrix.to/#/!jOcJpAxdUNYvaMZuqJ:matrix.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-pink-200 hover:shadow transition-all text-center"
            >
              <div className="bg-pink-100 p-2.5 rounded-xl"><MessageCircle className="w-5 h-5 text-pink-600" /></div>
              <span className="text-xs font-bold text-slate-800 leading-tight">官方售后群</span>
            </a>
            <button
              onClick={() => navigate('/bookshelf')}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-indigo-500 border border-indigo-600 shadow-sm hover:bg-indigo-600 transition-all text-center"
            >
              <div className="bg-white/20 p-2.5 rounded-xl"><LineChart className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-bold text-white leading-tight">商家与销量</span>
            </button>
          </div>
        </section>

        {/* 底部操作 + 品牌 */}
        <footer className="flex flex-wrap items-center justify-center gap-4 py-4 border-t border-slate-200/60">
          {txHash && (
            <button
              onClick={checkTxStatus}
              disabled={isRefreshing}
              className="text-xs text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              刷新状态
            </button>
          )}
          {explorerTxUrl && (
            <button onClick={openTxInExplorer} className="text-xs text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> 链上核验
            </button>
          )}
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">RWA 防二次灌装 · No Refill</span>
        </footer>
      </div>
    </div>
  );
};

export default Success;
