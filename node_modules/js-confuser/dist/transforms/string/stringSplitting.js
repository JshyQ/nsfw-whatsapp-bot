"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _randomUtils = require("../../utils/random-utils");
var _types = require("@babel/types");
var _assert = require("assert");
var _order = require("../../order");
var _astUtils = require("../../utils/ast-utils");
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var _default = exports["default"] = function _default(_ref) {
  var Plugin = _ref.Plugin;
  var me = Plugin(_order.Order.StringSplitting, {
    changeData: {
      strings: 0
    }
  });
  return {
    visitor: {
      StringLiteral: {
        exit: function exit(path) {
          var object = path.node;

          // Don't change module imports
          if ((0, _astUtils.isModuleImport)(path)) return;
          var size = Math.round(Math.max(6, object.value.length / (0, _randomUtils.getRandomInteger)(3, 8)));
          if (object.value.length <= size) {
            return;
          }
          var chunks = (0, _randomUtils.splitIntoChunks)(object.value, size);
          if (!chunks || chunks.length <= 1) {
            return;
          }
          if (!me.computeProbabilityMap(me.options.stringSplitting, object.value)) {
            return;
          }
          var binExpr;
          var parent;
          var last = chunks.pop();
          chunks.forEach(function (chunk, i) {
            if (i == 0) {
              parent = binExpr = (0, _types.binaryExpression)("+", (0, _types.stringLiteral)(chunk), (0, _types.stringLiteral)(""));
            } else {
              binExpr.left = (0, _types.binaryExpression)("+", _objectSpread({}, binExpr.left), (0, _types.stringLiteral)(chunk));
              (0, _assert.ok)(binExpr);
            }
          });
          parent.right = (0, _types.stringLiteral)(last);
          me.changeData.strings++;
          (0, _astUtils.ensureComputedExpression)(path);
          path.replaceWith(parent);
          path.skip();
        }
      }
    }
  };
};