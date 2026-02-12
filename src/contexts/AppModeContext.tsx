import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from 'react';

type AppMode = 'mock' | 'dev';

interface AppModeContextType {
  mode: AppMode;
  isMockMode: boolean;
  isDevMode: boolean;
  toggleMode: () => void;
  setMode: (mode: AppMode) => void;
  apiBaseUrl: string;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

export const AppModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ✅ 默认 dev；只有明确保存为 mock 才进入 mock
  const [mode, setModeState] = useState<AppMode>(() => {
    const saved = localStorage.getItem('app-mode');
    return (saved === 'mock' ? 'mock' : 'dev') as AppMode;
  });

  // ✅ 防止历史脏值
  useEffect(() => {
    const saved = localStorage.getItem('app-mode');
    if (saved !== 'mock' && saved !== 'dev') {
      localStorage.setItem('app-mode', 'dev');
    }
  }, []);

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode);
    localStorage.setItem('app-mode', newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'mock' ? 'dev' : 'mock');
  }, [mode, setMode]);

  const value: AppModeContextType = {
    mode,
    isMockMode: mode === 'mock',
    isDevMode: mode === 'dev',
    toggleMode,
    setMode,
    apiBaseUrl: '', // 你现在是同域部署，这里保持空字符串即可
  };

  return (
    <AppModeContext.Provider value={value}>
      {children}
    </AppModeContext.Provider>
  );
};

export const useAppMode = (): AppModeContextType => {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within AppModeProvider');
  }
  return context;
};
