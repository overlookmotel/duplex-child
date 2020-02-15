'use strict';

const {Duplex} = require('stream');

const s = new Duplex();

let callback;
s._write = function(chunk, encoding, cb) { // jshint ignore:line
	callback = cb;
};

s.on('prefinish', () => console.log('prefinish'));
s.on('finish', () => console.log('finish'));

s.write(Buffer.from('abcdefg'));
s.end();

setTimeout(() => {
	callback();
}, 1000);
