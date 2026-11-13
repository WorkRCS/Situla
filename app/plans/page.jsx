import PlansPage from "./plans-page.jsx";
import { SiteWorkspace } from "../components/site-sidebar.jsx";

export const metadata = {
  title: "Plans & Access",
  description: "Compare Situla Guest, Free, and Premium access plans."
};

export default function PlansRoute() {
  return <SiteWorkspace><PlansPage /></SiteWorkspace>;
}
