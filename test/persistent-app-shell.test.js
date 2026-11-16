import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all catalog routes share one persistent Situla app shell", async () => {
  const layout = await read("../app/layout.jsx");
  const router = await read("../app/components/persistent-situla-app.jsx");
  const app = await read("../app/components/situla-app.jsx");

  assert.ok(layout.includes("<PersistentSitulaApp>{children}</PersistentSitulaApp>"));
  assert.ok(router.includes("usePathname"));
  assert.ok(router.includes("useSearchParams"));
  assert.ok(router.includes('"/": "home"'));
  assert.ok(router.includes('"/movies": "movies"'));
  assert.ok(router.includes('"/tv": "tv"'));
  assert.ok(router.includes('"/anime": "anime"'));
  assert.ok(router.includes('"/cartoons/movies": "cartoonMovies"'));
  assert.ok(router.includes('"/cartoons/tv": "cartoonTv"'));
  assert.doesNotMatch(router, /<SitulaApp[^>]*\bkey=/);
  assert.equal((app.match(/<SiteSidebar\b/g) || []).length, 1);
  assert.ok(app.includes("active={navigationTab}"));
  assert.ok(app.includes("setSearchInput(nextQuery)"));
});
