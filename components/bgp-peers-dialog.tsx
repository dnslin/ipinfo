'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { fetchBGPPeers, ProcessedBGPData } from '@/lib/bgp-api';
import BGPNetworkChart from '@/components/bgp-network-chart';
import { Loader2, AlertCircle, Network, Globe, Hash, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface BGPPeersDialogProps {
  asn: number;
  asnName?: string;
  isOpen: boolean;
  onClose: () => void;
}

type ProtocolType = 'ipv4' | 'ipv6' | 'both';

export default function BGPPeersDialog({ 
  asn, 
  asnName, 
  isOpen, 
  onClose 
}: BGPPeersDialogProps) {
  const [protocolType, setProtocolType] = useState<ProtocolType>('both');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[95vw] w-full max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text-primary))] p-4 md:p-6 sm:!max-w-[95vw]">
        <BGPPeersContent
          key={asn}
          asn={asn}
          asnName={asnName}
          protocolType={protocolType}
          setProtocolType={setProtocolType}
        />
      </DialogContent>
    </Dialog>
  );
}

function BGPPeersContent({
  asn,
  asnName,
  protocolType,
  setProtocolType,
}: Pick<BGPPeersDialogProps, 'asn' | 'asnName'> & {
  protocolType: ProtocolType;
  setProtocolType: (protocol: ProtocolType) => void;
}) {
  const [bgpData, setBgpData] = useState<ProcessedBGPData | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(asn));
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!asn) return;

    let cancelled = false;
    fetchBGPPeers(asn).then((data) => {
      if (cancelled) return;
      setBgpData(data);
      
      toast.success("BGP 数据获取成功", {
        description: `找到 ${data.allPeers.length} 个邻接关系`,
        duration: 1000,
      });
    }).catch((err) => {
      if (cancelled) return;
      const errorMessage = err instanceof Error ? err.message : 'BGP 数据获取失败';
      setError(errorMessage);
      
      toast.error("BGP 数据获取失败", {
        description: errorMessage,
        duration: 4000,
      });
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [asn, retryCount]);

  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    setRetryCount((count) => count + 1);
  };

  return (
    <>
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle className="flex items-center space-x-2">
            <Network className="w-5 h-5 text-blue-500" />
            <span>BGP 邻接关系</span>
          </DialogTitle>
          <DialogDescription className="break-words text-[rgb(var(--color-text-secondary))]">
            AS{asn} {asnName && `(${asnName})`} 的 BGP 邻接关系。数据为 RIPE RIS 观测到的相邻网络。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto">
          {/* 加载状态 */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="text-lg font-medium text-[rgb(var(--color-text-primary))]">
                  正在获取 BGP 数据...
                </p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-1">
                  请稍候，这可能需要几秒钟时间
                </p>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="text-center space-y-2">
                <p className="text-lg font-medium text-[rgb(var(--color-text-primary))]">
                  数据获取失败
                </p>
                <p className="text-sm text-[rgb(var(--color-text-secondary))] max-w-md">
                  {error}
                </p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 text-sm font-medium"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {/* 数据展示 */}
          {bgpData && !isLoading && !error && (
            <div className="space-y-6">
              {/* 统计信息 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
                  <div className="flex items-center space-x-2">
                    <Hash className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">目标 ASN</span>
                  </div>
                  <p className="text-lg font-bold text-[rgb(var(--color-text-primary))] mt-1">
                    AS{bgpData.centerAsn}
                  </p>
                </div>
                
                <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">
                      {protocolType === 'ipv4' ? 'IPv4 邻接' :
                       protocolType === 'ipv6' ? 'IPv6 邻接' : '总邻接数'}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-[rgb(var(--color-text-primary))] mt-1">
                    {protocolType === 'ipv4' ? bgpData.ipv4Peers.length :
                     protocolType === 'ipv6' ? bgpData.ipv6Peers.length :
                     bgpData.allPeers.length}
                  </p>
                </div>
                
                <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">IPv4 邻接</span>
                  </div>
                  <p className="text-lg font-bold text-[rgb(var(--color-text-primary))] mt-1">
                    {bgpData.ipv4Peers.length}
                  </p>
                </div>
                
                <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">IPv6 邻接</span>
                  </div>
                  <p className="text-lg font-bold text-[rgb(var(--color-text-primary))] mt-1">
                    {bgpData.ipv6Peers.length}
                  </p>
                </div>
              </div>

              {/* 网络关系图 */}
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-2">
                    <Globe className="w-5 h-5 text-green-500" />
                    <h3 className="text-lg font-semibold text-[rgb(var(--color-text-primary))]">
                      网络拓扑图
                    </h3>
                  </div>
                  
                  {/* 协议切换控件 */}
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">协议类型:</span>
                    <div className="flex bg-[rgb(var(--color-surface-hover))] rounded-lg p-1 border border-[rgb(var(--color-border))]">
                      <button
                        onClick={() => setProtocolType('ipv4')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${
                          protocolType === 'ipv4'
                            ? 'bg-blue-500 text-white'
                            : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))]'
                        }`}
                      >
                        IPv4
                      </button>
                      <button
                        onClick={() => setProtocolType('ipv6')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${
                          protocolType === 'ipv6'
                            ? 'bg-purple-500 text-white'
                            : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))]'
                        }`}
                      >
                        IPv6
                      </button>
                      <button
                        onClick={() => setProtocolType('both')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${
                          protocolType === 'both'
                            ? 'bg-emerald-500 text-white'
                            : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))]'
                        }`}
                      >
                        全部
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[rgb(var(--color-surface))] rounded-lg p-4 border border-[rgb(var(--color-border))] transition-colors duration-300">
                  <BGPNetworkChart 
                    data={bgpData}
                    protocolType={protocolType}
                    className="min-h-[400px]"
                  />
                </div>
                
                <div className="text-xs text-[rgb(var(--color-text-muted))] space-y-1">
                  <p>• 拖拽画布可以平移图表，滚轮或按钮可以缩放</p>
                  <p>• 鼠标悬停在节点上查看详细信息</p>
                  <p>• 不同颜色的连线表示不同类型的邻接关系</p>
                  <p>• 蓝色实线表示IPv4连接，紫色虚线表示IPv6连接</p>
                </div>
              </div>

              {/* 邻接节点列表 */}
              {bgpData.allPeers.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-[rgb(var(--color-text-primary))]">
                      邻接节点列表
                    </h3>
                    <span className="text-sm text-[rgb(var(--color-text-secondary))]">
                      {protocolType === 'ipv4' ? `IPv4: ${bgpData.ipv4Peers.length} 个节点` :
                       protocolType === 'ipv6' ? `IPv6: ${bgpData.ipv6Peers.length} 个节点` :
                       `共 ${bgpData.allPeers.length} 个节点`}
                    </span>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {(protocolType === 'ipv4' ? bgpData.ipv4Peers :
                      protocolType === 'ipv6' ? bgpData.ipv6Peers :
                      bgpData.allPeers).slice(0, 20).map((peer) => (
                      <div 
                        key={peer.asn}
                        className="flex items-center justify-between p-3 bg-[rgb(var(--color-surface-hover))] rounded-lg border border-[rgb(var(--color-border))] transition-colors duration-300"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex items-center space-x-2">
                            {/* 类型指示器 */}
                            <div className={`w-3 h-3 rounded-full ${
                              protocolType === 'both' && bgpData.ipv4Peers.some(p => p.asn === peer.asn) && 
                              bgpData.ipv6Peers.some(p => p.asn === peer.asn) 
                                ? 'bg-emerald-500' 
                                : protocolType === 'both' && bgpData.ipv6Peers.some(p => p.asn === peer.asn)
                                  ? 'bg-purple-500'
                                  : protocolType === 'both' && bgpData.ipv4Peers.some(p => p.asn === peer.asn)
                                    ? 'bg-blue-500'
                                    : protocolType === 'ipv4'
                                      ? 'bg-blue-500'
                                      : 'bg-purple-500'
                            }`}></div>
                            
                            <span className="font-mono text-sm font-medium text-[rgb(var(--color-text-primary))]">
                              AS{peer.asn}
                            </span>
                          </div>
                          
                          <div className="flex min-w-0 flex-col break-words">
                            <span className="text-sm font-medium text-[rgb(var(--color-text-primary))]">
                              {peer.name}
                            </span>
                            <span className="text-xs text-[rgb(var(--color-text-secondary))]">
                              {peer.description}
                            </span>
                          </div>
                        </div>
                        
                        {peer.country_code && peer.country_code !== 'XX' && (
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-[rgb(var(--color-text-muted))] font-mono">
                              {peer.country_code}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {(protocolType === 'ipv4' ? bgpData.ipv4Peers.length :
                      protocolType === 'ipv6' ? bgpData.ipv6Peers.length :
                      bgpData.allPeers.length) > 20 && (
                      <div className="text-center py-2">
                        <span className="text-sm text-[rgb(var(--color-text-muted))]">
                          还有 {(protocolType === 'ipv4' ? bgpData.ipv4Peers.length :
                                protocolType === 'ipv6' ? bgpData.ipv6Peers.length :
                                bgpData.allPeers.length) - 20} 个节点未显示...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </>
  );
}
