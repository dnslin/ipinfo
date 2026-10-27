import type { ReactNode } from "react";

// 首屏舞台：地图铺底，身份卡压在左下，状态说明放在右下。
export function ResultStage({ map, note, children }: { map?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="stage">
      <div className="stage-map">{map ?? <div className="stage-map-empty" />}</div>
      <div className="stage-fade" aria-hidden="true" />
      <div className="stage-identity">{children}</div>
      {note && <p className="stage-note">{note}</p>}
    </section>
  );
}
