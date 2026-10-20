"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createGetGlobalTemplate = void 0;
var _template = _interopRequireDefault(require("./template"));
var _constants = require("../constants");
var _astUtils = require("../utils/ast-utils");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
var createGetGlobalTemplate = exports.createGetGlobalTemplate = function createGetGlobalTemplate(pluginInstance, path) {
  var _pluginInstance$optio;
  if ((_pluginInstance$optio = pluginInstance.options.lock) !== null && _pluginInstance$optio !== void 0 && _pluginInstance$optio.tamperProtection && !path.find(function (p) {
    return (0, _astUtils.isStrictMode)(p);
  })) {
    return new _template["default"]("\n      function {getGlobalFnName}(){\n        var localVar = false;\n        eval(__JS_CONFUSER_VAR__(localVar) + \" = true\")\n        if (!localVar) {\n          {countermeasures}\n\n          return {};\n        }\n\n        const root = eval(\"this\");\n        return root;\n      }\n    ").addSymbols(_constants.UNSAFE).setDefaultVariables({
      countermeasures: pluginInstance.globalState.lock.createCountermeasuresCode()
    });
  }
  return GetGlobalTemplate;
};
var GetGlobalTemplate = new _template["default"]("\n  function {getGlobalFnName}(){\n    var array = [\n      function (){\n        return globalThis\n      },\n      function (){\n        return global\n      },\n      function (){\n        return window\n      },\n      function (){\n        return new Function(\"return this\")()\n      }\n    ];\n\n    var bestMatch\n    var itemsToSearch = []\n    try {\n      bestMatch = Object\n      itemsToSearch[\"push\"]((\"\")[\"__proto__\"][\"constructor\"][\"name\"])\n    } catch(e) {\n\n    }\n    A: for(var i = 0; i < array[\"length\"]; i++) {\n      try {\n        bestMatch = array[i]()\n        for(var j = 0; j < itemsToSearch[\"length\"]; j++) {\n          if(typeof bestMatch[itemsToSearch[j]] === \"undefined\") continue A;\n        }\n        return bestMatch\n      } catch(e) {}\n    }\n\n\t\treturn bestMatch || this;\n  }\n");