/* --------------------
 * duplex-child module
 * Tests
 * ------------------*/

'use strict';

// Modules
const chai = require('chai'),
	{expect} = chai,
	DuplexChild = require('../lib/');

// Init
chai.config.includeStack = true;

// Tests

/* jshint expr: true */
/* global describe, it */

describe('Tests', function() {
	it.skip('dummy', function() {
		expect(DuplexChild).to.be.ok;
	});

	it('check Readable', function(cb) {
		const {Readable} = require('stream');

		const stream = new Readable();

		let called = false,
			calledTwice = false;
		stream._read = function(size) {
			console.log(`_read() called: ${size} bytes`);

			if (called) {
				calledTwice = true;
				return this.push(null);
			}

			called = true;

			const wantsMore = this.push(Buffer.alloc(1000, 'a'));
			console.log(`wantsMore: ${wantsMore}`);
		};

		stream.resume();

		stream.on('end', () => {
			if (calledTwice) return cb(new Error('_read called again before .push returns false'));
			cb();
		});
	});
});
