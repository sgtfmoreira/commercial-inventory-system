process.env.NODE_ENV = 'test';

module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/scripts/operational-structure-jest.setup.js'],
  testMatch: [
    '<rootDir>/src/components/SidebarLayout.test.js',
    '<rootDir>/src/pages/OperationalStructure.test.js',
  ],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-react-app'] }] },
  moduleNameMapper: {
    '^react-router-dom$': '<rootDir>/../../node_modules/react-router-dom/dist/index.js',
    '^react-router/dom$': '<rootDir>/../../node_modules/react-router/dist/development/dom-export.js',
    '^react-router$': '<rootDir>/../../node_modules/react-router/dist/development/index.js',
  },
};
