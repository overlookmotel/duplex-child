'use strict';

const zlib = require('zlib');

const z = zlib.createDeflate();

console.log(z.destroy);

z.destroy();
