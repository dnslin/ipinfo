"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fetchBGPPeers, type ProcessedBGPData } from "@/lib/bgp-api";
import NeighborExplorer from "@/components/bgp/neighbor-explorer";

interface BGPPeersDialogProps {
  asn: number;
  asnName?: string;
  isOpen: boolean;
  onClose: () => void;
  onReturnFocus: () => void;
}

export default function BGPPeersDialog({ asn, asnName, isOpen, onClose, onReturnFocus }: BGPPeersDialogProps) {
  // 从邻居继续查看它的邻接时记录路径，可逐级返回。
  const [trail, setTrail] = useState([{ asn, name: asnName }]);
  const current = trail[trail.length - 1];

  return <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
    <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }} className="bgp-dialog flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-[18px] p-0 sm:h-[min(860px,92dvh)] sm:w-[calc(100vw-3rem)] sm:max-w-6xl">
      <header className="bgp-dialog-head">
        {trail.length > 1 ? <button type="button" className="ui-button ui-icon-button" aria-label="返回上一个 ASN" onClick={() => setTrail(items => items.slice(0, -1))}><ArrowLeft className="h-4 w-4" /></button> : null}
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-[15px] leading-snug font-semibold">BGP 邻接观测</DialogTitle>
          <DialogDescription className="sr-only">RIPE RIS 公开路由观测，不代表实时 BGP 会话状态，也不等同于商业关系。</DialogDescription>
          {trail.length > 1 ? <nav aria-label="查看路径" className="bgp-trail">
            {trail.map((item, index) => <span key={`${item.asn}-${index}`} className="bgp-trail-item">
              {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
              {index < trail.length - 1
                ? <button type="button" className="font-mono" onClick={() => setTrail(items => items.slice(0, index + 1))}>AS{item.asn}</button>
                : <span className="font-mono" aria-current="page">AS{item.asn}</span>}
            </span>)}
          </nav> : null}
        </div>
        <DialogClose asChild><button type="button" className="ui-button ui-icon-button" aria-label="关闭 BGP 邻接观测"><X className="h-4 w-4" /></button></DialogClose>
      </header>
      {isOpen ? <BGPPeersContent key={current.asn} asn={current.asn} onDrill={(next, name) => setTrail(items => [...items, { asn: next, name }])} /> : null}
    </DialogContent>
  </Dialog>;
}

function BGPPeersContent({ asn, onDrill }: { asn: number; onDrill: (asn: number, name?: string) => void }) {
  const [data, setData] = useState<ProcessedBGPData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchBGPPeers(asn).then(result => {
      if (!cancelled) setData(result);
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "无法获取邻接网络");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [asn, retryCount]);

  if (isLoading) return <div className="bgp-state" role="status">
    <Loader2 className="h-6 w-6 animate-spin" />
    <p>正在获取 AS{asn} 的相邻网络…</p>
  </div>;

  if (error) return <div className="bgp-state" role="alert">
    <AlertCircle className="h-6 w-6" />
    <p className="bgp-state-title">暂时无法获取邻接网络</p>
    <p className="bgp-state-text">{error}</p>
    <button type="button" className="ui-button" onClick={() => {
      setError(null);
      setIsLoading(true);
      setRetryCount(count => count + 1);
    }}><RefreshCw className="h-4 w-4" />重新加载</button>
  </div>;

  return data ? <NeighborExplorer data={data} onDrill={onDrill} /> : null;
}
