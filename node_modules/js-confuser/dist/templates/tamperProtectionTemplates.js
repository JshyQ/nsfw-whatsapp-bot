"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createEvalIntegrityTemplate = exports.StrictModeTemplate = exports.NativeFunctionTemplate = exports.IndexOfTemplate = void 0;
var _template = _interopRequireDefault(require("./template"));
var _constants = require("../constants");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
var StrictModeTemplate = exports.StrictModeTemplate = new _template["default"]("\n  (function(){\n    function isStrictMode(){\n      try {\n        var arr = []\n        delete arr[\"length\"]\n      } catch(e) {\n        return true;\n      }\n      return false;\n    }\n\n    if(isStrictMode()) {\n      {countermeasures}\n      {nativeFunctionName} = undefined;\n    }\n  })()\n  ");
var IndexOfTemplate = exports.IndexOfTemplate = new _template["default"]("\nfunction indexOf(str, substr) {\n  const len = str.length;\n  const sublen = substr.length;\n  let count = 0;\n\n  if (sublen > len) {\n    return -1;\n  }\n\n  for (let i = 0; i <= len - sublen; i++) {\n    for (let j = 0; j < sublen; j++) {\n      if (str[i + j] === substr[j]) {\n        count++;\n        if (count === sublen) {\n          return i;\n        }\n      } else {\n        count = 0;\n        break;\n      }\n    }\n  }\n\n  return -1;\n}\n");
var NativeFunctionTemplate = exports.NativeFunctionTemplate = new _template["default"]("\nfunction {nativeFunctionName}() {\n  {IndexOfTemplate}\n\n  function checkFunction(fn) {\n    if (\n      indexOf(\"\" + fn, \"{ [native code] }\") === -1 ||\n      typeof Object.getOwnPropertyDescriptor(fn, \"toString\") !== \"undefined\"\n    ) {\n      {countermeasures}\n\n      return undefined;\n    }\n\n    return fn;\n  }\n\n  var args = arguments;\n  if (args.length === 1) {\n    return checkFunction(args[0]);\n  } else if (args.length === 2) {\n    var object = args[0];\n    var property = args[1];\n\n    var fn = object[property];\n    fn = checkFunction(fn);\n\n    return fn.bind(object);\n  }\n}").addSymbols(_constants.UNSAFE, _constants.MULTI_TRANSFORM);
var createEvalIntegrityTemplate = exports.createEvalIntegrityTemplate = function createEvalIntegrityTemplate(pluginInstance, path) {
  var _pluginInstance$optio;
  if ((_pluginInstance$optio = pluginInstance.options.lock) !== null && _pluginInstance$optio !== void 0 && _pluginInstance$optio.tamperProtection) {
    return new _template["default"]("\n      function {EvalIntegrityName}(){\n        var localVar = false;\n        eval(__JS_CONFUSER_VAR__(localVar) + \" = true\")\n\n        if (!localVar) {\n          // Eval was tampered!\n          {countermeasures}\n\n          return false;\n        }\n\n        return true;\n      }\n    ").addSymbols(_constants.UNSAFE).setDefaultVariables({
      countermeasures: pluginInstance.globalState.lock.createCountermeasuresCode()
    });
  }
  return new _template["default"]("\n    function {EvalIntegrityName}(".concat(_constants.placeholderVariablePrefix, "_flag = true){\n      return ").concat(_constants.placeholderVariablePrefix, "_flag;\n    }\n  "));
};