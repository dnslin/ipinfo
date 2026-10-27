import IPQueryForm from "./ip-query-form";
import VersionSwitcher from "./version-switcher";
import ThemeToggle from "./theme-toggle";

export default function SiteNav() {
  return (
    <header className="site-nav">
      <p className="site-brand"><span className="site-brand-mark" aria-hidden="true" />IP Search</p>
      <div className="site-nav-query"><IPQueryForm /></div>
      <div className="site-nav-end"><VersionSwitcher /><ThemeToggle /></div>
    </header>
  );
}
