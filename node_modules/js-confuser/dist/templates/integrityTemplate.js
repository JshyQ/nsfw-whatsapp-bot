"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HashFunction = HashFunction;
exports.HashTemplate = void 0;
var _constants = require("../constants");
var _template = _interopRequireDefault(require("./template"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
/**
 * Hashing Algorithm for Integrity: `cyrb53`
 * @param str
 * @param seed
 */
function HashFunction(str, seed) {
  var h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (var i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// In template form to be inserted into code
var HashTemplate = exports.HashTemplate = new _template["default"]("\n// Must be Function Declaration for hoisting\n// Math.imul polyfill for ES5\nfunction MathImulPolyfill(opA, opB){\n  opB |= 0; // ensure that opB is an integer. opA will automatically be coerced.\n  // floating points give us 53 bits of precision to work with plus 1 sign bit\n  // automatically handled for our convienence:\n  // 1. 0x003fffff /*opA & 0x000fffff*/ * 0x7fffffff /*opB*/ = 0x1fffff7fc00001\n  //    0x1fffff7fc00001 < Number.MAX_SAFE_INTEGER /*0x1fffffffffffff*/\n  var result = (opA & 0x003fffff) * opB;\n  // 2. We can remove an integer coersion from the statement above because:\n  //    0x1fffff7fc00001 + 0xffc00000 = 0x1fffffff800001\n  //    0x1fffffff800001 < Number.MAX_SAFE_INTEGER /*0x1fffffffffffff*/\n  if (opA & 0xffc00000 /*!== 0*/) result += (opA & 0xffc00000) * opB |0;\n  return result |0;\n};\n\nvar {imul} = Math[\"imul\"] || MathImulPolyfill;\n\nfunction {hashingUtilFnName}(str, seed) {\n  var h1 = 0xdeadbeef ^ seed;\n  var h2 = 0x41c6ce57 ^ seed;\n  for (var i = 0, ch; i < str.length; i++) {\n      ch = str.charCodeAt(i);\n      h1 = {imul}(h1 ^ ch, 2654435761);\n      h2 = {imul}(h2 ^ ch, 1597334677);\n  }\n  h1 = {imul}(h1 ^ (h1>>>16), 2246822507) ^ {imul}(h2 ^ (h2>>>13), 3266489909);\n  h2 = {imul}(h2 ^ (h2>>>16), 2246822507) ^ {imul}(h1 ^ (h1>>>13), 3266489909);\n  return 4294967296 * (2097151 & h2) + (h1>>>0);\n};\n\n// Simple function that returns .toString() value with spaces replaced out\nfunction {name}(fnObject, seed, regex={sensitivityRegex}){\n  var fnStringed = fnObject[\"toString\"]()[\"replace\"](regex, \"\");\n  return {hashingUtilFnName}(fnStringed, seed);\n}\n").addSymbols(_constants.SKIP, _constants.MULTI_TRANSFORM);