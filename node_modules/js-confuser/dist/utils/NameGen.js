"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NameGen = void 0;
var _assert = require("assert");
var _genUtils = require("./gen-utils");
var _randomUtils = require("./random-utils");
var _constants = require("../constants");
var _obfuscator = _interopRequireDefault(require("../obfuscator"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { "default": e }; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
/**
 * Generate random names for variables and properties.
 */
var NameGen = exports.NameGen = /*#__PURE__*/function () {
  function NameGen() {
    var identifierGenerator = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "randomized";
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
      avoidReserved: false,
      avoidObjectPrototype: false
    };
    _classCallCheck(this, NameGen);
    _defineProperty(this, "generatedNames", new Set());
    _defineProperty(this, "notSafeForReuseNames", new Set());
    _defineProperty(this, "counter", 1);
    _defineProperty(this, "zeroWidthGenerator", (0, _genUtils.createZeroWidthGenerator)());
    this.identifierGenerator = identifierGenerator;
    this.options = options;
  }
  return _createClass(NameGen, [{
    key: "attemptGenerate",
    value: function attemptGenerate() {
      if (typeof this.identifierGenerator === "function") {
        var value = this.identifierGenerator();
        (0, _assert.ok)(typeof value === "string", "Custom identifier generator must return a string");
        return value;
      }
      var mode = _obfuscator["default"].prototype.computeProbabilityMap(this.identifierGenerator);
      var randomizedLength = (0, _randomUtils.getRandomInteger)(6, 8);
      switch (mode) {
        case "randomized":
          var characters = "_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
          var numbers = "0123456789".split("");
          var combined = [].concat(_toConsumableArray(characters), _toConsumableArray(numbers));
          var result = "";
          for (var i = 0; i < randomizedLength; i++) {
            result += (0, _randomUtils.choice)(i == 0 ? characters : combined);
          }
          return result;
        case "hexadecimal":
          return "_0x" + (0, _randomUtils.getRandomHexString)(randomizedLength);
        case "mangled":
          var mangledName = "";
          do {
            mangledName = (0, _genUtils.alphabeticalGenerator)(this.counter++);
          } while (_constants.reservedKeywords.includes(mangledName));
          return mangledName;
        case "number":
          return "var_" + this.counter++;
        case "zeroWidth":
          return this.zeroWidthGenerator.generate();
        case "chinese":
          return (0, _randomUtils.getRandomChineseString)(randomizedLength);
        default:
          throw new Error("Invalid identifier generator mode: " + this.identifierGenerator);
      }
    }
  }, {
    key: "generate",
    value: function generate() {
      var isSafeForReuse = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;
      var name;
      do {
        name = this.attemptGenerate();

        // Avoid reserved keywords
        if (this.options.avoidReserved && _constants.reservedKeywords.includes(name)) {
          name = "";
          continue;
        }

        // Avoid reserved object prototype properties
        if (this.options.avoidObjectPrototype && _constants.reservedObjectPrototype.has(name)) {
          name = "";
          continue;
        }
      } while (!name || this.generatedNames.has(name));
      this.generatedNames.add(name);
      if (!isSafeForReuse) {
        this.notSafeForReuseNames.add(name);
      }
      return name;
    }
  }]);
}();