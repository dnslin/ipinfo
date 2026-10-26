import { Fragment } from "react";

export function IPAddress({ value, className = "" }: { value: string; className?: string }) {
  const groups = value.match(/[^:]*:+|[^:]+$/g) || [value];
  return (
    <span className={`font-mono font-medium leading-snug tracking-tight ${className}`}>
      {groups.map((group, index) => <Fragment key={index}><span className="inline-block">{group}</span>{index < groups.length - 1 && <wbr />}</Fragment>)}
    </span>
  );
}
