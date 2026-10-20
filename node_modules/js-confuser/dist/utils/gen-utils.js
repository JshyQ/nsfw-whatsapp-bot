"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.alphabeticalGenerator = alphabeticalGenerator;
exports.createZeroWidthGenerator = createZeroWidthGenerator;
var _constants = require("../constants");
var _randomUtils = require("./random-utils");
function alphabeticalGenerator(index) {
  var name = "";
  while (index > 0) {
    var t = (index - 1) % 52;
    var thisChar = t >= 26 ? String.fromCharCode(65 + t - 26) : String.fromCharCode(97 + t);
    name = thisChar + name;
    index = (index - t) / 52 | 0;
  }
  if (!name) {
    name = "_";
  }
  return name;
}
function createZeroWidthGenerator() {
  var maxSize = 0;
  var currentKeyWordsArray = [];
  function generateArray() {
    var result = _constants.reservedKeywords.map(function (keyWord) {
      return keyWord + "\u200C".repeat(Math.max(maxSize - keyWord.length, 1));
    }).filter(function (craftedVariableName) {
      return craftedVariableName.length == maxSize;
    });
    if (!result.length) {
      ++maxSize;
      return generateArray();
    }
    return (0, _randomUtils.shuffle)(result);
  }
  function getNextVariable() {
    if (!currentKeyWordsArray.length) {
      ++maxSize;
      currentKeyWordsArray = generateArray();
    }
    return currentKeyWordsArray.pop();
  }
  return {
    generate: getNextVariable
  };
}