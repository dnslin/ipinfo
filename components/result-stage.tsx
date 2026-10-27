import type { ReactNode } from "react";

// 首屏舞台的前景层：地图在页面级背景里常驻，这里只摆身份卡和右下角的状态说明。
export function ResultStage({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <section className="stage">
      <div className="stage-identity">{children}</div>
      {note && <p className="stage-note">{note}</p>}
    </section>
  );
}
