// Node.js specific ESLint configuration
module.exports = {
  extends: ['./index.js'],
  env: {
    node: true,
  },
  rules: {
    'no-process-exit': 'error',
    'no-process-env': 'off', // Allow process.env in Node.js
  },
};
