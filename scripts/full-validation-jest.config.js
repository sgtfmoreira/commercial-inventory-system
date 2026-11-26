process.env.NODE_ENV = 'test';

module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/scripts/full-validation-jest.setup.js'],
  testMatch: [
    '<rootDir>/src/App.test.js',
    '<rootDir>/src/components/SidebarLayout.test.js',
    '<rootDir>/src/context/LoadingContext.test.js',
    '<rootDir>/src/pages/ChecklistApprovals.test.js',
    '<rootDir>/src/pages/ChecklistExecution.test.js',
    '<rootDir>/src/pages/ChecklistReports.test.js',
    '<rootDir>/src/pages/ChecklistRuns.test.js',
    '<rootDir>/src/pages/ChecklistTemplates.test.js',
    '<rootDir>/src/pages/Events.test.js',
    '<rootDir>/src/pages/OperationalStructure.test.js',
    '<rootDir>/src/pages/PurchaseSuggestions.test.js',
    '<rootDir>/src/pages/StockMovement.test.js',
    '<rootDir>/src/pages/TableReservations.test.js',
    '<rootDir>/src/pages/Users.test.js',
    '<rootDir>/src/styles/theme.test.js',
    '<rootDir>/src/utils/portioningProducts.test.js',
  ],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-react-app'] }] },
  moduleNameMapper: {
    '^react-router-dom$': '<rootDir>/../../node_modules/react-router-dom/dist/index.js',
    '^react-router/dom$': '<rootDir>/../../node_modules/react-router/dist/development/dom-export.js',
    '^react-router$': '<rootDir>/../../node_modules/react-router/dist/development/index.js',
  },
};
