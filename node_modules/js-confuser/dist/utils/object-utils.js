"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createObject = createObject;
/**
 * Creates an object from the given keys and values arrays.
 * @param keys
 * @param values
 */
function createObject(keys, values) {
  if (keys.length !== values.length) {
    throw new Error("length mismatch");
  }
  var newObject = {};
  keys.forEach(function (x, i) {
    newObject[x] = values[i];
  });
  return newObject;
}