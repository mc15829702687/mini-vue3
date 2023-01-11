const isObject = (v) => {
  return v !== null && typeof v === "object";
};

const isString = (v) => typeof v === "string";

const isArray = Array.isArray;

const _toString = Object.prototype.toString;

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
function isPlainObject(v) {
  return _toString.call(v) === "[object Object]";
}
