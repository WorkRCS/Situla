// Server requests are now combined with route navigation in RouteProgress.
// Keep this compatibility component inert so the old floating activity card
// cannot be reintroduced accidentally by a legacy layout import.
export default function ServerActivityLoader() {
  return null;
}
