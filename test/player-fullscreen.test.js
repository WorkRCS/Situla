import test from "node:test";
import assert from "node:assert/strict";
import { attachFullscreenLandscapeLock } from "../src/player-fullscreen.js";

function createDocumentMock() {
  const listeners = new Set();
  return {
    fullscreenElement: null,
    addEventListener(name, callback) {
      if (name === "fullscreenchange") listeners.add(callback);
    },
    removeEventListener(name, callback) {
      if (name === "fullscreenchange") listeners.delete(callback);
    },
    dispatchFullscreenChange() {
      for (const callback of [...listeners]) callback();
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

test("locks landscape when the player iframe enters fullscreen and unlocks on exit", async () => {
  const frame = {};
  const documentRef = createDocumentMock();
  const calls = [];
  const screenRef = {
    orientation: {
      lock(value) {
        calls.push(["lock", value]);
        return Promise.resolve();
      },
      unlock() {
        calls.push(["unlock"]);
      }
    }
  };

  const detach = attachFullscreenLandscapeLock(frame, { documentRef, screenRef });
  assert.equal(documentRef.listenerCount(), 1);
  documentRef.fullscreenElement = frame;
  documentRef.dispatchFullscreenChange();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [["lock", "landscape"]]);

  documentRef.fullscreenElement = null;
  documentRef.dispatchFullscreenChange();
  assert.deepEqual(calls, [["lock", "landscape"], ["unlock"]]);

  detach();
  assert.equal(documentRef.listenerCount(), 0);
});

test("does not lock for another fullscreen element or when the API is unsupported", async () => {
  const frame = {};
  const documentRef = createDocumentMock();
  const otherElement = {};
  let lockCalls = 0;
  const detach = attachFullscreenLandscapeLock(frame, {
    documentRef,
    screenRef: { orientation: { lock() { lockCalls += 1; return Promise.resolve(); }, unlock() {} } }
  });
  documentRef.fullscreenElement = otherElement;
  documentRef.dispatchFullscreenChange();
  assert.equal(lockCalls, 0);
  detach();

  const unsupportedDetach = attachFullscreenLandscapeLock(frame, {
    documentRef,
    screenRef: { orientation: {} }
  });
  documentRef.fullscreenElement = frame;
  documentRef.dispatchFullscreenChange();
  assert.equal(lockCalls, 0);
  unsupportedDetach();
});

test("rejected orientation locks do not break fullscreen or playback", async () => {
  const frame = {};
  const documentRef = createDocumentMock();
  const detach = attachFullscreenLandscapeLock(frame, {
    documentRef,
    screenRef: { orientation: { lock: () => Promise.reject(new Error("Not supported")) } }
  });
  documentRef.fullscreenElement = frame;
  assert.doesNotThrow(() => documentRef.dispatchFullscreenChange());
  await Promise.resolve();
  await Promise.resolve();
  detach();
});
