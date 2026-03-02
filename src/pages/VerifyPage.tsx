import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppMode } from '../contexts/AppModeContext';
import { useApi } from '../hooks/useApi';

interface VerifyPageProps {
  onVerify?: (address: string, codeHash: string) => Promise<'publisher' | 'author' | 'reader' | null>;
}

const isHexAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test((v || '').trim());

const VerifyPage: React.FC<VerifyPageProps> = ({ onVerify }) => {
  const navigate = useNavigate();
  const { hash } = useParams<{ hash: string }>();
  const [searchParams] = useSearchParams();
  const { isMockMode } = useAppMode();
  const { verifyCode, getBinding } = useApi();

  // ✅ 不要把 hash 固定进 useState（路由变化时会不同步）
  const codeHash = useMemo(() => (hash || '').trim(), [hash]);

  // ✅ 兼容未来参数名：contract / book_addr / book_address
  const contractFromUrl = useMemo(() => {
    return (searchParams.get('contract') || searchParams.get('book_addr') || searchParams.get('book_address') || '').trim();
  }, [searchParams]);

  // ✅ 可选：透传 book_id
  const bookIdFromUrl = useMemo(() => (searchParams.get('book_id') || '').trim(), [searchParams]);

  const [targetAddress, setTargetAddress] = useState('');
  const [bookAddress, setBookAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'publisher' | 'author' | 'reader' | null>(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [invalidCode, setInvalidCode] = useState(false);

  /**
   * ✅ 修复“必须切 mock 再切回来才自动填充”的根因：
   * - useApi() 里的 verifyCode/getBinding 会随 isMockMode 变化而变化（closure 绑定）
   * - 某些情况下首屏渲染时 isMockMode 还没稳定（或被旧 localStorage 覆盖），导致第一次 verify 用了错误模式
   * - 把 isMockMode 加入依赖，并在 role=publisher/author 时尽可能从 verifyResult 里直接拿地址并写入 localStorage
   */
  useEffect(() => {
    let cancelled = false;

    const initTerminal = async () => {
      setLoading(true);
      setError('');
      setInvalidCode(false);
      setRole(null);

      if (!codeHash) {
        setInvalidCode(true);
        setError('缺少二维码 hash');
        setLoading(false);
        return;
      }

      try {
        // 1) 先 verify，拿 role
        const verifyResult: any = await verifyCode(codeHash);
        if (cancelled) return;

        if (!verifyResult?.ok || verifyResult?.error) {
          setInvalidCode(true);
          setError(verifyResult?.error || '无效的二维码，请购买正版商品');
          setLoading(false);
          return;
        }

        const detectedRole: 'publisher' | 'author' | 'reader' =
          verifyResult.role === 'publisher' ? 'publisher' : verifyResult.role === 'author' ? 'author' : 'reader';

        setRole(detectedRole);

        // 2) ✅ publisher/author：尽量直接从 verifyResult 拿到绑定地址（避免依赖 mock 切换触发的二次渲染）
        // 兼容不同字段名：address / owner / publisher / admin_address
        if (detectedRole === 'publisher' || detectedRole === 'author') {
          const addrCandidate =
            (verifyResult.address ||
              verifyResult.owner ||
              verifyResult.publisher ||
              verifyResult.admin_address ||
              verifyResult.adminAddress ||
              '') as string;

          const addr = (addrCandidate || '').trim();

          if (isHexAddress(addr)) {
            setTargetAddress(addr.toLowerCase());

            // ✅ 关键：直接写入 localStorage，让 /publisher-admin 立刻读到（无需“切换模式”触发）
            localStorage.setItem('vault_pub_auth', addr.toLowerCase());
            localStorage.setItem('vault_user_role', detectedRole);
            localStorage.setItem('vault_code_hash', codeHash);

            // ✅ 通知其它页面（如果有人在监听）
            window.dispatchEvent(new Event('vault-auth-updated'));
          } else {
            // 仍允许用户手工填
            setTargetAddress('');
          }

          setLoading(false);
          return;
        }

        // 3) ✅ reader：才去 getBinding（你的后端设计 publisher/author 可能 404）
        if (detectedRole === 'reader') {
          try {
            const bindResult: any = await getBinding(codeHash);
            if (cancelled) return;

            if (!bindResult?.ok || bindResult?.error) {
              setInvalidCode(true);
              setError(bindResult?.error || '无效的二维码，请购买正版商品');
              setLoading(false);
              return;
            }

            if (bindResult.address) setTargetAddress(String(bindResult.address).trim());

            // 优先用后端返回的 book_address；否则用 URL 兜底
            const ba = String(bindResult.book_address || '').trim();
            if (ba) setBookAddress(ba);
            else if (contractFromUrl) setBookAddress(contractFromUrl);
          } catch (bindError: any) {
            setInvalidCode(true);
            setError(bindError?.message || '无效的二维码，请购买正版商品');
            setLoading(false);
            return;
          }
        }

        setLoading(false);
      } catch (e: any) {
        console.error('验证失败:', e);
        if (cancelled) return;
        setInvalidCode(true);
        setError(e?.message || '无效的二维码，请购买正版商品');
        setLoading(false);
      }
    };

    initTerminal();
    return () => {
      cancelled = true;
    };
  }, [codeHash, verifyCode, getBinding, contractFromUrl, isMockMode]);

  const confirmAndGoToMint = () => {
    const params = new URLSearchParams();

    // reader address
    if (targetAddress) params.set('reader_address', targetAddress);

    // ✅ contract/bookAddress：同时写 3 个名字，避免历史版本不兼容
    const ba = (bookAddress || contractFromUrl || '').trim();
    if (ba) {
      params.set('book_address', ba);
      params.set('book_addr', ba);
      params.set('contract', ba);
    }

    // optional passthrough
    if (bookIdFromUrl) params.set('book_id', bookIdFromUrl);

    // helpful for downstream pages
    params.set('codeHash', codeHash);

    navigate(`/mint/${codeHash}?${params.toString()}`);
  };

  if (invalidCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-6 shadow-lg">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto border border-red-100">
            <span className="text-red-500 text-4xl">✕</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">无效的二维码</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            {error || '该二维码无效或已被使用。请确认您扫描的是正版商品附带的二维码。'}
          </p>
          {isMockMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs text-amber-700 font-medium">⚠️ DEMO 模式：使用 pub_xxx 或 auth_xxx 格式的 hash 进行测试</p>
            </div>
          )}
        </div>
        <div className="mt-10 text-xs text-slate-400 uppercase tracking-widest font-medium">
          Whale Vault Protocol <span className="mx-2">•</span> {isMockMode ? 'DEMO MODE' : 'DEV API'}
        </div>
      </div>
    );
  }

  if (loading && !role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className={`text-sm ${isMockMode ? 'text-amber-600' : 'text-emerald-600'}`}>
          {isMockMode ? 'Mock 验证中...' : '连接后端 API...'}
        </p>
      </div>
    );
  }

  const handleAdminLogin = async () => {
    const addr = (targetAddress || '').trim();
    if (!isHexAddress(addr)) {
      setError('请输入有效的管理钱包地址（0x + 40 hex）');
      return;
    }

    // keep legacy keys
    localStorage.setItem('vault_pub_auth', addr.toLowerCase());
    localStorage.setItem('vault_user_role', role || 'publisher');
    localStorage.setItem('vault_code_hash', codeHash);

    window.dispatchEvent(new Event('vault-auth-updated'));

    if (role === 'publisher' || role === 'author') {
      navigate('/publisher-admin');
    }
  };

  const getRoleStyle = () => {
    switch (role) {
      case 'publisher':
        return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600', label: '出版社' };
      case 'author':
        return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600', label: '作者' };
      case 'reader':
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', label: '读者' };
      default:
        return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-600', label: '未知' };
    }
  };

  const roleStyle = getRoleStyle();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-lg space-y-8">
        {/* 模式标识 */}
        <div
          className={`${isMockMode ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border rounded-xl p-3 text-center`}
        >
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${isMockMode ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {isMockMode ? '🔧 Demo Mode - Mock Data' : '🟢 Dev API - 后端验证'}
          </p>
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-indigo-600 font-bold text-xs uppercase tracking-widest">Identity Terminal</h2>
          <div className="py-6 flex flex-col items-center justify-center space-y-3">
            <div className={`px-4 py-2 rounded-full border text-sm font-bold ${roleStyle.border} ${roleStyle.text} ${roleStyle.bg}`}>
              {roleStyle.label} Detected
            </div>
            <p className="text-slate-400 text-xs font-mono break-all px-4">{codeHash}</p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}

        {role === 'reader' ? (
          <div className="text-center space-y-6">
            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">预设确权地址</p>
              <p className="text-xs font-mono text-slate-600 break-all px-2">{targetAddress || '0x...'}</p>
            </div>

            {(bookAddress || contractFromUrl) && (
              <div className="space-y-1">
                <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">书籍合约地址</p>
                <p className="text-xs font-mono text-indigo-600 break-all">{(bookAddress || contractFromUrl).trim()}</p>
              </div>
            )}

            <button
              onClick={() => setShowDecisionModal(true)}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm uppercase tracking-widest hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md"
            >
              立即领取 NFT 勋章
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div
              className={`p-4 rounded-xl ${
                role === 'publisher' ? 'bg-purple-50 border border-purple-100' : 'bg-orange-50 border border-orange-100'
              }`}
            >
              <p className={`text-sm ${role === 'publisher' ? 'text-purple-700' : 'text-orange-700'}`}>
                {role === 'publisher'
                  ? '📚 出版社管理后台：查看销量、部署新书、生成二维码、热力分析'
                  : '✍️ 作者后台：查看作品销量和读者分布'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-500 uppercase font-semibold ml-1">绑定钱包地址</label>
              <input
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-mono text-center outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                placeholder="0x..."
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {targetAddress
                  ? '已自动填充（可修改）。'
                  : '未能从二维码中解析出地址：请手动输入。若你希望也能自动填充，请让后端 verifyCode 返回 address 字段。'}
              </p>
            </div>

            <button
              onClick={handleAdminLogin}
              className={`w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition-all shadow-md ${
                role === 'publisher'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
              }`}
            >
              进入{role === 'publisher' ? '出版社' : '作者'}后台
            </button>
          </div>
        )}
      </div>

      {/* 读者博弈抉择弹窗 */}
      {showDecisionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-6">
          <div className="max-w-sm w-full bg-white border border-slate-200 rounded-3xl p-8 space-y-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-200">
              <span className="text-amber-500 text-2xl">⚠️</span>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-slate-800">确权博弈提醒</h3>
              <p className="text-sm text-slate-500 leading-relaxed px-2">
                领取 NFT 与金额随机的红包奖励，同时会使该激活码失效。<br />
                <span className="text-amber-600 font-medium">
                  若您有推荐人，请确保其已在系统中登记您的激活码，否则他将无法获得推广奖励。
                </span>
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => setShowDecisionModal(false)}
                className="w-full py-4 rounded-xl bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all"
              >
                等推荐人先登记 (暂不领取)
              </button>
              <button
                onClick={confirmAndGoToMint}
                className="w-full py-4 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                无推荐人 / 已登记，直接领取
              </button>
            </div>

            <button
              onClick={() => setShowDecisionModal(false)}
              className="text-xs text-slate-400 uppercase tracking-widest font-medium hover:text-slate-600 transition-colors"
            >
              取消并退出
            </button>
          </div>
        </div>
      )}

      <div className="mt-12 text-xs text-slate-400 uppercase tracking-widest font-medium text-center">
        Whale Vault Protocol <span className="mx-2">•</span> {isMockMode ? 'DEMO MODE' : 'DEV API'}
      </div>
    </div>
  );
};

export default VerifyPage;
