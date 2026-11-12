import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import Script from "next/script";
import SiteFooter from "./components/site-footer.jsx";
import PresenceTracker from "./components/presence-tracker.jsx";

const extensionAttributeCleanup = `(function () {
  var isInjectedAttribute = function (name) {
    return name === "bis_skin_checked" ||
      name === "bis_register" ||
      name === "data-temp-mail-org" ||
      name.indexOf("__processed_") === 0;
  };
  var cleanElement = function (element) {
    if (!element || element.nodeType !== 1 || !element.attributes) return;
    var tempMailInjected = element.hasAttribute("data-temp-mail-org");
    var injectedEmailIcon = element.tagName === "INPUT" && element.type === "email" &&
      element.style && /data:image\\//i.test(element.style.backgroundImage || "");
    if (tempMailInjected || injectedEmailIcon) element.removeAttribute("style");
    for (var i = element.attributes.length - 1; i >= 0; i -= 1) {
      var attributeName = element.attributes[i].name;
      if (isInjectedAttribute(attributeName)) element.removeAttribute(attributeName);
    }
  };
  var cleanTree = function (root) {
    cleanElement(root);
    if (!root || !root.querySelectorAll) return;
    var elements = root.querySelectorAll("*");
    for (var i = 0; i < elements.length; i += 1) cleanElement(elements[i]);
  };
  cleanTree(document.documentElement);
  if (window.MutationObserver && document.documentElement) {
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i += 1) {
        if (records[i].type === "attributes") cleanElement(records[i].target);
        else {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j += 1) cleanTree(added[j]);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["bis_skin_checked", "bis_register", "data-temp-mail-org"]
    });
  }
})();`;

export const metadata = {
  metadataBase: new URL("https://situla.vercel.app"),
  title: {
    default: "Situla — Discover & Watch",
    template: "%s | Situla"
  },
  description: "Discover movies, TV series, and anime on Situla.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  },
  formatDetection: { telephone: false }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090e"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <Script
          id="situla-clean-extension-attributes"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: extensionAttributeCleanup }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <PresenceTracker />
        <SiteFooter />
      </body>
    </html>
  );
}
