process.env.NODE_ENV = 'test';
module.exports = {
  rootDir:'..', roots:['<rootDir>/src'], testEnvironment:'jsdom',
  setupFiles:['<rootDir>/scripts/table-reservations-jest.setup.js'],
  testMatch:['<rootDir>/src/pages/TableReservations.test.js'],
  transform:{'^.+\\.[jt]sx?$':['babel-jest',{presets:['babel-preset-react-app']}]},
  moduleNameMapper:{
    '^react-router-dom$':'<rootDir>/node_modules/react-router-dom/dist/index.js',
    '^react-router/dom$':'<rootDir>/node_modules/react-router/dist/development/dom-export.js',
    '^react-router$':'<rootDir>/node_modules/react-router/dist/development/index.js'
  }
};
