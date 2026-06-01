/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/jest.setup.mjs'],
  moduleNameMapper: {
    // Resolve NodeNext-style ".js" specifiers to their ".ts" source in tests.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          verbatimModuleSyntax: false,
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: ['**/*.test.ts'],
};
