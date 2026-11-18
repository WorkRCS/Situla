import { getIframePreconnectTarget } from "../../src/iframe-preconnect.js";

export default function IframeConnectionHints({ src }) {
  const target = getIframePreconnectTarget(src);
  if (!target) return null;
  return (
    <>
      <link rel="dns-prefetch" href={"//" + target.hostname} />
      <link rel="preconnect" href={target.origin} />
    </>
  );
}
