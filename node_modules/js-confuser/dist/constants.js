"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.variableFunctionName = exports.reservedObjectPrototype = exports.reservedNodeModuleIdentifiers = exports.reservedKeywords = exports.reservedIdentifiers = exports.placeholderVariablePrefix = exports.noRenameVariablePrefix = exports.WITH_STATEMENT = exports.UNSAFE = exports.SKIP = exports.PREDICTABLE = exports.NO_RENAME = exports.NO_REMOVE = exports.MULTI_TRANSFORM = exports.GEN_NODE = exports.FN_LENGTH = void 0;
/**
 * A function is 'unsafe' if it requires 'eval', 'arguments' or 'this'
 *
 * Transformations will generally not touch unsafe functions.
 */
var UNSAFE = exports.UNSAFE = Symbol("unsafe");

/**
 * A function is 'predictable' if the invoking parameter lengths are guaranteed to be known.
 *
 * ```js
 * a(1,2,3) // predictable
 * a(...[1,2,3]) // unpredictable
 * ```
 */
var PREDICTABLE = exports.PREDICTABLE = Symbol("predictable");

/**
 * A node is marked as 'skip' if it should not be transformed.
 *
 * Preserved throughout transformations, so be careful with this.
 */
var SKIP = exports.SKIP = Symbol("skip");

/**
 * Saves the original length of a function.
 */
var FN_LENGTH = exports.FN_LENGTH = Symbol("fnLength");
var NO_RENAME = exports.NO_RENAME = Symbol("noRename");

/**
 * This Identifier is used for a hexadecimal number or escaped string.
 */
var GEN_NODE = exports.GEN_NODE = Symbol("genNode");

/**
 * This function is used to mark functions that when transformed will most likely cause a maximum call stack error.
 *
 * Examples: Native Function Check
 */
var MULTI_TRANSFORM = exports.MULTI_TRANSFORM = Symbol("multiTransform");

/**
 * The function contains a `with` statement.
 *
 * OR
 *
 * This identifier is used for a `with` statement.
 *
 * Tells Pack not to globally transform the node.
 */
var WITH_STATEMENT = exports.WITH_STATEMENT = Symbol("withStatement");

/**
 * Tells minify to not remove the node.
 */
var NO_REMOVE = exports.NO_REMOVE = Symbol("noRemove");

/**
 * Symbols describe precomputed semantics of a node, allowing the obfuscator to make the best choices for the node.
 */

/**
 * Allows the user to grab the variable name of a renamed variable.
 */
var variableFunctionName = exports.variableFunctionName = "__JS_CONFUSER_VAR__";
var noRenameVariablePrefix = exports.noRenameVariablePrefix = "__NO_JS_CONFUSER_RENAME__";
var placeholderVariablePrefix = exports.placeholderVariablePrefix = "__p_";

/**
 * Identifiers that are not actually variables.
 */
var reservedIdentifiers = exports.reservedIdentifiers = new Set(["undefined", "null", "NaN", "Infinity", "eval", "arguments"]);

/**
 * Reserved Node.JS module identifiers.
 */
var reservedNodeModuleIdentifiers = exports.reservedNodeModuleIdentifiers = new Set(["module", "exports", "require"]);
var reservedObjectPrototype = exports.reservedObjectPrototype = new Set(["toString", "valueOf", "constructor", "__proto__", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"]);

/**
 * For Zero Width generator - Mangled variable names
 */
var reservedKeywords = exports.reservedKeywords = ["if", "in", "do", "for", "let", "new", "try", "var", "case", "else", "null", "with", "break", "catch", "class", "const", "super", "throw", "while", "yield", "delete", "export", "import", "public", "return", "switch", "default", "finally", "private", "continue", "debugger", "function", "arguments", "protected", "instanceof", "await", "async",
// new key words and other fun stuff :P
"NaN", "undefined", "true", "false", "typeof", "this", "static", "void", "of"];