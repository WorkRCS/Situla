import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Admin member directory renders readable responsive member cards", async () => {
  const dashboard = await read("../app/components/admin-dashboard.jsx");
  const styles = await read("../app/globals.css");

  assert.match(dashboard, /className="admin-user-list"/);
  assert.match(dashboard, /className="admin-user-card"/);
  assert.match(dashboard, /View full profile/);
  assert.match(dashboard, /user\.membership\.durationMonths/);
  assert.match(dashboard, /user\.browser/);
  assert.match(dashboard, /user\.suspensionReason/);
  assert.doesNotMatch(dashboard, /<th>#<\/th><th>Member<\/th>/);
  assert.match(dashboard, /Email verified/);
  assert.match(dashboard, /loginMethod/);
  assert.match(dashboard, /BILLING CYCLE/);
  assert.match(dashboard, /USER ID/);

  assert.match(styles, /\.admin-user-list\s*\{/);
  assert.match(styles, /\.admin-user-card-facts\s*\{/);
  assert.match(styles, /\.admin-user-detail-summary\s*\{/);
  assert.match(styles, /@media\(max-width:640px\)/);
});
