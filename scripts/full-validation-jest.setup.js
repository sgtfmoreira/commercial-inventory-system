const { TextDecoder, TextEncoder } = require('node:util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

require('@testing-library/jest-dom/extend-expect');
