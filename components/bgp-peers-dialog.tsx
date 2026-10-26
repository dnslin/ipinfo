"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Network, RefreshCw, X } from "lucide-react";
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
  return <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
    <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }} className="flex h-[calc(100dvh_-_1rem)] w-[calc(100vw_-_1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-0 text-[rgb(var(--color-text-primary))] sm:h-[min(780px,90dvh)] sm:w-[calc(100vw_-_3rem)] sm:max-w-5xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[rgb(var(--color-border))] p-4 sm:px-6">
        <div className="min-w-0 space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg"><Network className="h-4 w-4 shrink-0 text-[rgb(var(--color-text-secondary))]" />BGP 邻接关系</DialogTitle>
          <p className="break-words text-sm text-[rgb(var(--color-text-secondary))]"><span className="font-mono font-medium text-[rgb(var(--color-text-primary))]">AS{asn}</span>{asnName ? ` · ${asnName}` : ""}</p>
          <DialogDescription className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))]">RIPE RIS 公开路由观测，不代表实时 BGP 会话状态。</DialogDescription>
        </div>
        <DialogClose asChild><button type="button" className="ui-button ui-icon-button shrink-0" aria-label="关闭 BGP 邻接关系"><X className="h-4 w-4" /></button></DialogClose>
      </header>
      {isOpen ? <BGPPeersContent key={asn} asn={asn} /> : null}
    </DialogContent>
  </Dialog>;
}

function BGPPeersContent({ asn }: { asn: number }) {
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

  if (isLoading) return <div className="ui-empty-state flex flex-col items-center justify-center min-h-0 flex-1 gap-3 p-6 text-center" role="status">
    <Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-text-secondary))]" />
    <p className="text-sm">正在获取相邻网络…</p>
  </div>;

  if (error) return <div className="ui-empty-state flex flex-col items-center justify-center min-h-0 flex-1 gap-3 overflow-y-auto p-6 text-center" role="alert">
    <AlertCircle className="h-6 w-6 text-[rgb(var(--color-text-secondary))]" />
    <p className="font-medium">暂时无法获取邻接网络</p>
    <p className="max-w-md break-words text-sm text-[rgb(var(--color-text-secondary))]">{error}</p>
    <button type="button" className="ui-button" onClick={() => {
      setError(null);
      setIsLoading(true);
      setRetryCount(count => count + 1);
    }}><RefreshCw className="h-4 w-4" />重新加载</button>
  </div>;

  return data ? <NeighborExplorer data={data} /> : null;
}
