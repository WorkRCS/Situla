import { ProfilePage } from "../components/account-pages.jsx";
import { SiteWorkspace } from "../components/site-sidebar.jsx";

export const metadata = {
  title: "Your profile",
  description: "View your Situla account status, membership and Premium benefits."
};

export default function ProfileRoute() {
  return <SiteWorkspace><ProfilePage /></SiteWorkspace>;
}
