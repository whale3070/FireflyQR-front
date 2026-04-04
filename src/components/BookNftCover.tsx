import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { RPC_URL } from "../config/chain";
import { normalizeAssetUrl, parseJsonDataUri } from "../lib/nftAssetUrl";

const MIN_ABI = [
  "function totalSales() view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
] as const;

type Props = {
  contractAddress?: string;
  fallbackSrc: string;
  alt: string;
  className?: string;
};

export function BookNftCover({ contractAddress, fallbackSrc, alt, className }: Props) {
  const [src, setSrc] = useState(fallbackSrc);

  useEffect(() => {
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress.trim())) {
      setSrc(fallbackSrc);
      return;
    }
    const addr = contractAddress.trim();
    let cancelled = false;

    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL || "");
        const c = new ethers.Contract(addr, MIN_ABI, provider);
        const total = await c.totalSales();
        if (cancelled) return;
        if (Number(total) === 0) {
          setSrc(fallbackSrc);
          return;
        }
        const uri: string = await c.tokenURI(0);
        if (cancelled) return;

        let meta: Record<string, unknown> | null = parseJsonDataUri(uri);
        if (!meta) {
          const resp = await fetch(normalizeAssetUrl(uri), { method: "GET" });
          if (resp.ok) {
            meta = (await resp.json()) as Record<string, unknown>;
          }
        }
        if (cancelled) return;
        const img = normalizeAssetUrl(String(meta?.image ?? meta?.image_url ?? ""));
        setSrc(img || fallbackSrc);
      } catch {
        if (!cancelled) setSrc(fallbackSrc);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contractAddress, fallbackSrc]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setSrc(fallbackSrc)}
    />
  );
}
