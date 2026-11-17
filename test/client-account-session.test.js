import test from "node:test";
import assert from "node:assert/strict";
import {
  getCachedAccountUser,
  resolveAccountUserRefresh,
  setCachedAccountUser
} from "../src/client-account-session.js";

test("account cache keeps the last server-confirmed user during temporary API failures", () => {
  const user = { id: "member-1", name: "Situla Member", email: "member@example.com" };
  setCachedAccountUser(user);
  assert.equal(getCachedAccountUser(), user);

  const afterServerError = resolveAccountUserRefresh(
    { ok: false, status: 503 },
    { code: "DATABASE_UNAVAILABLE" },
    getCachedAccountUser()
  );
  const afterNetworkError = resolveAccountUserRefresh(
    null,
    null,
    getCachedAccountUser()
  );

  assert.equal(afterServerError, user);
  assert.equal(afterNetworkError, user);
  assert.equal(getCachedAccountUser(), user);
});

test("account cache clears only after a confirmed unauthenticated response", () => {
  const user = { id: "member-2", name: "Another Member" };
  assert.equal(resolveAccountUserRefresh({ ok: false, status: 401 }, { code: "UNAUTHENTICATED" }, user), null);
  assert.equal(resolveAccountUserRefresh({ ok: false, status: 401 }, { code: "AUTH_SESSION_INVALID" }, user), null);
  assert.equal(resolveAccountUserRefresh({ ok: false, status: 403 }, { code: "ACCOUNT_SUSPENDED" }, user), user);
  assert.equal(resolveAccountUserRefresh({ ok: true, status: 200 }, { user }, null), user);
  setCachedAccountUser(null);
  assert.equal(getCachedAccountUser(), null);
});
