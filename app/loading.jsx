export default function Loading() {
  return (
    <main className="site-server-page-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="site-server-page-loading-card">
        <span className="site-server-page-loading-mark" aria-hidden="true">S</span>
        <span className="site-server-page-loading-copy">
          <small>SERVER RESPONSE</small>
          <strong>Preparing your page</strong>
          <span>Loading verified content from Situla</span>
        </span>
        <span className="site-server-page-loading-spinner" aria-hidden="true" />
      </div>
    </main>
  );
}
