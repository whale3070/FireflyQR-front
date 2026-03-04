// Heatmap.tsx (REAL ONLY)
// ✅ 纯真实数据版：
// - 不再使用 MOCK_REGIONS / 不再读取 envMode / publisher_env_mode / isMockMode
// - 只走后端真实接口：useApi().fetchDistribution() -> GET /api/v1/analytics/distribution
// - 失败不降级、不回退 mock：直接显示错误
// - 对 regions 做强过滤，避免 ECharts 因 NaN/越界数据触发压缩报错

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

// ✅ ECharts 按需引入（避免 geo/map 模块被 tree-shaking 导致运行时异常）
import * as echarts from "echarts/core";
import type { ECharts, EChartsOption } from "echarts/core";
import { GeoComponent, TooltipComponent, VisualMapComponent, TitleComponent } from "echarts/components";
import { ScatterChart, EffectScatterChart } from "echarts/charts";
import { CanvasRenderer } from "echarts/renderers";

import { useApi } from "../hooks/useApi";

echarts.use([GeoComponent, TooltipComponent, VisualMapComponent, TitleComponent, ScatterChart, EffectScatterChart, CanvasRenderer]);

const POLL_INTERVAL = 5000; // 5s

type HeatmapNode = { name: string; value: [number, number, number] };

function safeNum(n: any, fallback = NaN) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

async function fetchGeoJSON(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store" });
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();

  if (!res.ok) throw new Error(`无法加载 ${url}：HTTP ${res.status}`);

  const looksJson = text.trim().startsWith("{") || text.trim().startsWith("[");
  if (!ct.includes("application/json") && !looksJson) {
    throw new Error(`${url} 返回的不是 JSON（content-type=${ct}，head=${JSON.stringify(text.slice(0, 80))}）`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch (e: any) {
    throw new Error(`${url} JSON 解析失败：${e?.message || e}`);
  }

  if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`${url} 结构不符合 GeoJSON FeatureCollection（type=${data?.type}）`);
  }

  return data;
}

const Heatmap: React.FC = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);

  // ✅ 真实接口：useApi 里叫 fetchDistribution（你后端已经改好）
  const { fetchDistribution } = useApi();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalReaders, setTotalReaders] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [polling, setPolling] = useState<boolean>(false);

  const modeLabel = "LIVE";

  const calcTotal = (data: HeatmapNode[]) => data.reduce((sum, item) => sum + (Number(item?.value?.[2]) || 0), 0);

  const fetchHeatmapData = useCallback(async (): Promise<HeatmapNode[]> => {
    // 真实接口：GET /api/v1/analytics/distribution
    const result = await fetchDistribution();

    if (!result?.ok || !Array.isArray(result.regions)) {
      throw new Error(result?.error || "后端返回格式不正确（缺少 regions）");
    }

    // ✅ 强过滤：清洗掉 NaN / 越界 / 非法结构，避免 ECharts 内部压缩报错
    const cleaned = result.regions
      .map((r: any) => {
        const name = (r?.name === "Unknown" || !r?.name) ? "未知" : String(r.name);
        const lng = safeNum(r?.value?.[0], NaN);
        const lat = safeNum(r?.value?.[1], NaN);
        const cnt = safeNum(r?.value?.[2], 0);

        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

        const count = Number.isFinite(cnt) ? cnt : 0;
        return { name, value: [lng, lat, count] as [number, number, number] };
      })
      .filter(Boolean) as HeatmapNode[];

    setTotalReaders(calcTotal(cleaned));
    setLastUpdate(new Date());
    setErrorMsg(null);

    // 允许空数据（后端暂时没数据时也不应报错）
    return cleaned;
  }, [fetchDistribution]);

  const setSeriesData = useCallback((data: HeatmapNode[]) => {
    if (!chartInstance.current) return;
    chartInstance.current.setOption({ series: [{ data }, { data }] } as EChartsOption, { notMerge: false });
  }, []);

  const updateChartData = useCallback(async () => {
    if (!chartInstance.current) return;
    setPolling(true);
    try {
      const newData = await fetchHeatmapData();
      setSeriesData(newData);
    } catch (e: any) {
      console.error("获取热力图数据失败:", e);
      setErrorMsg(e?.message || "获取热力图数据失败");
    } finally {
      setPolling(false);
    }
  }, [fetchHeatmapData, setSeriesData]);

  useEffect(() => {
    let alive = true;

    const el = chartRef.current;
    if (!el) return;

    // 容器尺寸保护：避免 0 尺寸 init 导致内部异常
    if (el.clientWidth === 0 || el.clientHeight === 0) {
      setErrorMsg("Heatmap 容器尺寸为 0（请确认父级布局给了高度/宽度）");
      setLoading(false);
      return;
    }

    // re-init for clean state
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }
    chartInstance.current = echarts.init(el);

    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);

    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const worldGeoJson = await fetchGeoJSON("/world.json");
        echarts.registerMap("world", worldGeoJson);

        const heatmapData = await fetchHeatmapData();
        if (!alive || !chartInstance.current) return;

        const option: EChartsOption = {
          backgroundColor: "#0f172a",
          title: {
            text: `🐋 WHALE VAULT - 全球读者回响分布 (${modeLabel})`,
            left: "center",
            top: 40,
            textStyle: { color: "#22d3ee", fontWeight: "lighter", fontSize: 24 },
          },
          tooltip: {
            show: true,
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: "#22d3ee",
            textStyle: { color: "#fff" },
            formatter: (params: any) => {
              const count = params?.value?.[2] ?? 0;
              return `<div style="padding:8px">
                <div style="font-weight:bold;margin-bottom:4px">${params.name}</div>
                <div style="color:#22d3ee">📖 ${count} 位读者已点亮 (${modeLabel})</div>
              </div>`;
            },
          },
          visualMap: {
            min: 0,
            max: 50,
            calculable: true,
            orient: "horizontal",
            left: "center",
            bottom: 50,
            inRange: { color: ["#0c4a6e", "#22d3ee", "#fbbf24", "#ef4444"] },
            textStyle: { color: "#94a3b8" },
          },
          geo: {
            map: "world",
            roam: true,
            emphasis: { itemStyle: { areaColor: "#1e293b" }, label: { show: false } },
            itemStyle: { areaColor: "#111827", borderColor: "#334155", borderWidth: 0.8 },
          },
          series: [
            {
              name: "Readers",
              type: "effectScatter",
              coordinateSystem: "geo",
              data: heatmapData || [],
              symbolSize: (val: any) => Math.max(10, Math.min(30, (val?.[2] || 1) * 3)),
              showEffectOn: "render",
              rippleEffect: { brushType: "stroke", scale: 3, period: 4 },
              itemStyle: { color: "#22d3ee", shadowBlur: 10, shadowColor: "#22d3ee" },
              zlevel: 1,
            },
            {
              name: "ReaderPoints",
              type: "scatter",
              coordinateSystem: "geo",
              data: heatmapData || [],
              symbolSize: (val: any) => Math.max(6, Math.min(20, (val?.[2] || 1) * 2)),
              itemStyle: { color: "#fbbf24", opacity: 0.8 },
              zlevel: 2,
            },
          ],
        };

        try {
          chartInstance.current.setOption(option, { notMerge: true, lazyUpdate: false });
        } catch (e: any) {
          throw new Error(`ECharts setOption 失败：${e?.message || e}`);
        }

        setLoading(false);
      } catch (err: any) {
        console.error("地图渲染异常:", err);
        setErrorMsg(err?.message || "地图渲染异常");
        setLoading(false);
      }
    })();

    // ✅ 纯真实：一直轮询刷新（失败就显示错误，不回退 mock）
    const poll = window.setInterval(() => {
      updateChartData();
    }, POLL_INTERVAL);

    return () => {
      alive = false;
      window.removeEventListener("resize", handleResize);
      window.clearInterval(poll);
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [fetchHeatmapData, updateChartData]);

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-[#0f172a]" style={{ minHeight: "600px" }}>
      {/* Mode 标识（固定 LIVE） */}
      <div className="absolute top-4 left-4 z-20 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-2">
        <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">🟢 Live Mode - Backend Data</p>
      </div>

      {/* 实时统计面板 */}
      <div className="absolute top-4 right-4 z-20 bg-slate-900/80 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-cyan-400">
          <RefreshCw className={`w-4 h-4 ${polling ? "animate-spin" : ""}`} style={{ animationDuration: "1.5s" }} />
          <span className="text-xs uppercase tracking-wider">Live 更新中</span>
          <button
            onClick={updateChartData}
            className="ml-2 text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20"
            title="手动刷新"
          >
            刷新
          </button>
        </div>

        <div className="text-3xl font-black text-white">{totalReaders.toLocaleString()}</div>
        <div className="text-[10px] text-gray-400 uppercase">全球已点亮读者 ({modeLabel})</div>
        {lastUpdate && <div className="text-[9px] text-gray-500">更新于 {lastUpdate.toLocaleTimeString()}</div>}
      </div>

      {loading && (
        <div className="absolute z-10 flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
          <div className="text-cyan-400 animate-pulse font-mono text-sm tracking-widest">正在加载 {modeLabel} 地图数据...</div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute z-20 bg-red-900/20 border border-red-500/50 p-6 rounded-xl text-center max-w-[560px]">
          <p className="text-red-400 mb-2">回响地图加载失败</p>
          <p className="text-xs text-red-300/70 font-mono break-words">{errorMsg}</p>

          <div className="mt-3 text-[11px] text-gray-400 text-left">
            <div className="mb-1">排查建议：</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                确认 <span className="font-mono">/api/v1/analytics/distribution</span> 返回 JSON 且包含{" "}
                <span className="font-mono">{"{ ok:true, regions:[...] }"}</span>
              </li>
              <li>
                确认 <span className="font-mono">/world.json</span> 返回 GeoJSON（FeatureCollection）
              </li>
              <li>
                如果一直失败，点“重试”并查看浏览器 Console 的第一条报错堆栈
              </li>
            </ul>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs bg-red-500/20 px-3 py-1 rounded hover:bg-red-500/40"
          >
            重试
          </button>
        </div>
      )}

      <div
        ref={chartRef}
        className={`w-full h-full transition-opacity duration-1000 ${loading ? "opacity-0" : "opacity-100"}`}
        style={{ minHeight: "600px" }}
      />

      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#0f172a] to-transparent pointer-events-none" />
    </div>
  );
};

export default Heatmap;
