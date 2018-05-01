/* --------------------
 * duplex-child module
 * stderr handling
 * ------------------*/

'use strict';

// Symbols
const STREAM = Symbol(),
	STDERR_OUTPUT = Symbol();

// Exports
module.exports = {
	init,
	spawn,
	cleanup,
	getOutput
};

/**
 * Called within constructor
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function init(duplex) {
	duplex[STDERR_OUTPUT] = undefined;
}

/**
 * Called after spawn
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function spawn(duplex) {
	const {stderr} = duplex.process;
	stderr[STREAM] = duplex;

	duplex[STDERR_OUTPUT] = [];

	// Collect stderr output
	stderr.on('data', onStderr);
	stderr.on('error', noop); // TODO Change this to handle errors
}

/**
 * Called on close
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function cleanup(duplex) {
	const {process} = duplex;
	if (!process) return;

	const {stderr} = process;
	stderr.removeListener('data', onStderr);
	stderr.removeListener('error', noop);

	duplex[STDERR_OUTPUT] = undefined;
}

/**
 * Get stderr data
 */
function getOutput(duplex) {
	const output = duplex[STDERR_OUTPUT];
	if (output.length == 0) return '';

	return Buffer.concat(output).toString('utf8').trim();
}

/**
 * Called when stderr emits data
 */
function onStderr(data) {
	const duplex = this[STREAM]; // jshint ignore:line
	duplex[STDERR_OUTPUT].push(data);
}

function noop() {}
