"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPin, RefreshCw } from "lucide-react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("地图组件错误:", error, info); }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <section className="ui-card ui-empty-state">
        <MapPin className="mx-auto mb-3 h-7 w-7 text-[rgb(var(--color-text-muted))]" />
        <h2 className="text-sm font-medium text-[rgb(var(--color-text-primary))]">地图暂时无法显示</h2>
        <p className="mb-5 mt-2 text-sm">其他 IP 信息仍可查看，请重试加载地图。</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="ui-button"><RefreshCw className="h-4 w-4" />重新加载</button>
        {process.env.NODE_ENV === "development" && <details className="mt-4 text-left text-xs"><summary>错误详情</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{this.state.error.message}</pre></details>}
      </section>
    );
  }
}
