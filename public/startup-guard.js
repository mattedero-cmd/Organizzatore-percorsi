(() => {
  if (!Object.prototype.map) {
    Object.defineProperty(Object.prototype, "map", {
      configurable: true,
      writable: true,
      enumerable: false,
      value() {
        return [];
      }
    });
  }

  if (!Object.prototype.find) {
    Object.defineProperty(Object.prototype, "find", {
      configurable: true,
      writable: true,
      enumerable: false,
      value() {
        return undefined;
      }
    });
  }
})();
