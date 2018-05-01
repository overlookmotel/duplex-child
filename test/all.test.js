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
});
