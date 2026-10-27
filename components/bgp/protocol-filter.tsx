import type { BGPProtocol } from "@/lib/bgp-explorer";

interface ProtocolFilterProps {
  value: BGPProtocol;
  onChange: (protocol: BGPProtocol) => void;
}

const options = [
  { value: "both", label: "全部" },
  { value: "ipv4", label: "IPv4" },
  { value: "ipv6", label: "IPv6" },
] as const;

export default function ProtocolFilter({ value, onChange }: ProtocolFilterProps) {
  return <div className="bgp-segmented" role="group" aria-label="筛选邻接协议">
    {options.map(option => <button
      key={option.value}
      type="button"
      aria-pressed={value === option.value}
      onClick={() => value !== option.value && onChange(option.value)}
    >{option.label}</button>)}
  </div>;
}
