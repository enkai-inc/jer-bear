// CJS shim so Jest (CommonJS) can import the ESM-only uuid v14 package.
let counter = 0;
const v4 = () => `mock-uuid-${++counter}`;
module.exports = { v4 };
