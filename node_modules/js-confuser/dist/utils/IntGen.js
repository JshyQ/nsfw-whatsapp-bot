"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IntGen = void 0;
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var IntGen = exports.IntGen = /*#__PURE__*/function () {
  function IntGen() {
    var min = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : -250;
    var max = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 250;
    _classCallCheck(this, IntGen);
    this.min = min;
    this.max = max;
    this.generatedInts = new Set();
  }
  return _createClass(IntGen, [{
    key: "getRandomInt",
    value: function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }, {
    key: "generate",
    value: function generate() {
      var randomInt;

      // Keep generating until we find a unique integer
      do {
        randomInt = this.getRandomInt(this.min, this.max);

        // Expand the range if most integers in the current range are exhausted
        if (this.generatedInts.size >= 0.8 * (this.max - this.min)) {
          this.min -= 100;
          this.max += 100;
        }
      } while (this.generatedInts.has(randomInt));
      this.generatedInts.add(randomInt);
      return randomInt;
    }
  }]);
}();