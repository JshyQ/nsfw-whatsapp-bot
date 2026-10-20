"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SetFunctionLengthTemplate = void 0;
var _template = _interopRequireDefault(require("./template"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
var SetFunctionLengthTemplate = exports.SetFunctionLengthTemplate = new _template["default"]("\n  function {fnName}(fn, length = 1){\n    Object[\"defineProperty\"](fn, \"length\", {\n      \"value\": length,\n      \"configurable\": false\n    });\n    return fn;\n  }\n");