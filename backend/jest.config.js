export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Unit tests use Node's built-in runner (`node:test`); Jest runs HTTP integration tests only.
  testMatch: ['**/__tests__/{kyc,wallet}.test.js'],
  collectCoverageFrom: [
    'server.js',
    'lib/**/*.js',
    'middleware/**/*.js',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
  ],
  testTimeout: 30000,
};
