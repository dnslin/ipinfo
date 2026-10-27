import Link from "next/link";
import { ListChecks } from "lucide-react";
import IPQueryForm from "./ip-query-form";
import VersionSwitcher from "./version-switcher";
import ThemeToggle from "./theme-toggle";

export default function SiteNav() {
  return (
    <header className="site-nav">
      <p className="site-brand"><span className="site-brand-mark" aria-hidden="true" />IP Search</p>
      <div className="site-nav-query"><IPQueryForm /></div>
      <div className="site-nav-end"><VersionSwitcher /><Link href="/batch" className="ui-button ui-icon-button" aria-label="批量查询" title="批量查询"><ListChecks className="h-4 w-4" /></Link><ThemeToggle /></div>
    </header>
  );
}
