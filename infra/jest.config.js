module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  moduleNameMapper: {
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
    // Force a single copy of the DynamoDB SDK: lambda/src resolves to
    // lambda/node_modules while tests resolve to the root node_modules —
    // aws-sdk-client-mock only intercepts when both share one class identity.
    '^@aws-sdk/client-dynamodb$': '<rootDir>/node_modules/@aws-sdk/client-dynamodb',
    '^@aws-sdk/lib-dynamodb$': '<rootDir>/node_modules/@aws-sdk/lib-dynamodb',
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
};
