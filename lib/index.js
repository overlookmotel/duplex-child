/* --------------------
 * duplex-child module
 * ------------------*/

'use strict';

// Modules
const {spawn} = require('child_process'),
	{Duplex} = require('stream'),
	{inherits} = require('util');

// Imports
const {ENDED, DONE} = require('./symbols');
const writable = require('./writable'),
	readable = require('./readable'),
	stderr = require('./stderr');

// Symbols
const STREAM = Symbol(),
	OPTIONS = Symbol(),
	ERRORED = Symbol(),
	DESTROYED = Symbol(),
	EXITED = Symbol();

// Exports
module.exports = DuplexChild;

/**
 * Constructor
 * @param {Object} [options] - Options object (optional)
 * @param {boolean} [options.allowHalfOpen] - Passed to Duplex constructor
 * @param {number} [options.highWaterMark] - Passed to Duplex constructor
 * @param {number} [options.readableHighWaterMark] - Passed to Duplex constructor
 * @param {number} [options.writableHighWaterMark] - Passed to Duplex constructor
 * @param {number} [options.killSignal] - If stream destroyed, signal to send to process
 */
function DuplexChild(options) {
	// Call super constructor
	options = Object.assign({}, options);
	const streamOptions = {};
	for (let opt of ['allowHalfOpen', 'highWaterMark', 'readableHighWaterMark', 'writableHighWaterMark']) {
		if (options[opt] != null) streamOptions[opt] = options[opt];
	}

	Duplex.call(this, streamOptions);

	logEvents('duplex', this);

	// Save options
	options.killSignal = options.killSignal == null ? 'SIGTERM' : options.killSignal + '';
	this[OPTIONS] = options;

	// Init
	this.process = null;
	this[ERRORED] = false;
	this[EXITED] = false;
	this[DESTROYED] = false;

	// Init writable and readable sides + stderr
	writable.init(this);
	readable.init(this);
	stderr.init(this);
}

inherits(DuplexChild, Duplex);

/**
 * `DuplexChild.spawn` convenience method
 * Create `DuplexChild` and spawn child process within it
 * @param {string} command
 * @param {Array} [args]
 * @param {Object} [options]
 * @returns {DuplexChild}
 */
DuplexChild.spawn = function(command, args, options) {
	return new DuplexChild().spawn(command, args, options);
};

/**
 * `.spawn()` prototype method
 * Spawn child process within `DuplexChild`
 * @param {string} command
 * @param {Array} [args]
 * @param {Object} [options]
 * @returns {DuplexChild}
 */
DuplexChild.prototype.spawn = function(command, args, options) {
	// If already destroyed, throw
	if (this[DESTROYED]) throw new Error('Cannot spawn after stream destroyed');

	// Spawn process
	const process = this.process = spawn(command, args, options);
	process[STREAM] = this;

	logEvents('process', process);
	logEvents('stdin', process.stdin);
	logEvents('stdout', process.stdout);
	logEvents('stderr', process.stderr);

	// Process handlers
	process.on('error', onError);
	process.on('exit', onExit);
	process.on('close', onClose);

	// Prepare writable and readable sides + stderr
	writable.spawn(this);
	readable.spawn(this);
	stderr.spawn(this);

	// Return `DuplexChild` object for chaining
	return this;
};

// Process error handler
function onError(err) {
	// Spawn failed
	// TODO Also handle error in killing process
	const duplex = this[STREAM]; // jshint ignore:line
	duplex[ERRORED] = true;
	duplex.emit('error', err);
}

// Process exit handler
function onExit(code, signal) {
	// jshint validthis:true
	const duplex = this[STREAM];

	// Flag as exited
	duplex[EXITED] = true;

	// If exited abnormally, emit error
	const stderrOutput = stderr.getOutput(duplex);
	if (code || signal || stderrOutput.length > 0) {
		// Process exited abnormally or wrote to stderr
		// TODO Wait for stderr to close/error
		const err = new Error(`Process exited with ${code ? `code ${code}` : `signal ${signal}`}: '${stderrOutput}'`);
		duplex[ERRORED] = true;
		duplex.emit('error', err);

		// TODO Refactor these out into readable/writable/stderr files?
		this.stdin.destroy();
		this.stdout.destroy();
		this.stderr.destroy();

		return;
	}

	// End
	duplex[DONE]();
}

function onClose() {
	// jshint validthis:true
	const duplex = this[STREAM];
	cleanup(duplex);
	duplex.emit('close');
}

DuplexChild.prototype[DONE] = function end() {
	// Wait until process exited and stdout ended
	if (!this[ENDED] || !this[EXITED] || this[ERRORED]) return;

	// End stream
	this.push(null);
	// TODO Check all data emitted before pushing `null`
};

/*
 * Writable side
 */
DuplexChild.prototype._write = writable._write;
DuplexChild.prototype._final = writable._final;

/*
 * Readable side
 */
DuplexChild.prototype._read = readable._read;

/*
 * Destroy hander
 */
DuplexChild.prototype._destroy = function(err, cb) {
	console.log('_destroy()');
	// If destroy already called or process exited, do nothing
	if (this[DESTROYED] || this[EXITED]) return;

	// Flag as destroyed
	this[DESTROYED] = true;

	// If process not spawned yet, exit
	if (!this.process) {
		cleanup(this);
		return cb(err);
		// TODO Fix this: Should it emit error?
	}

	// Kill process
	const {process} = this;
	process.stdin.destroy();
    process.stdout.destroy();
    process.stderr.destroy();

    process.kill(this[OPTIONS].killSignal);

	// TODO Need to emit error?
};

// Add `.destroy()` method if not present (prior to Node 8.0.0)
if (!DuplexChild.prototype.destroy) {
	DuplexChild.prototype.destroy = function(err) {
		// TODO Fix this: should it always emit error?
		if (!err) err = new Error('Destroyed');
		this._destroy(err, err => {
			this.emit('error', err);
		});
	};
}

/*
 * Clean up when finished
 */
function cleanup(duplex) {
	// Cleanup writable and readable sides + stderr
	writable.cleanup(duplex);
	readable.cleanup(duplex);
	stderr.cleanup(duplex);

	// Remove process event listeners
	const {process} = duplex;
	if (!process) return;
	process.removeListener('error', onError);
	process.removeListener('exit', onExit);
	process.removeListener('close', onClose);

	// NB Leave `.process` attached as user may want to access it
}

/*
 * Debugging
 */
function logEvents(name, emitter) {
	const original = emitter.emit;
	emitter.emit = function(event) {
		console.log(`> Emitted on ${name}: ${event}`);
		original.apply(this, arguments);
	};
}
