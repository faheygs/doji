module.exports = {
  init: jest.fn(),
  wrap: jest.fn(<T>(component: T): T => component),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
};
