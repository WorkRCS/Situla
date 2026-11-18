"use strict";

if (typeof globalThis.DOMException !== "function") {
  throw new Error("Situla requires the native Node.js DOMException implementation.");
}

module.exports = globalThis.DOMException;
