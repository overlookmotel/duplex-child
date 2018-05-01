/* --------------------
 * duplex-child module
 * ------------------*/

'use strict';

// Modules
const {spawn} = require('child_process'),
	{Duplex} = require('stream'),
	{inherits} = require('util');

// Symbols
const OPTIONS = Symbol(),
	STREAM = Symbol(),
	ERRORED = Symbol(),
	EXITED = Symbol(),
	ENDED = Symbol(),
	DESTROYED = Symbol(),
	READING = Symbol(),
	WRITEABLE_BUFFER = Symbol(),
	WRITEABLE_CALLBACK = Symbol(),
	READABLE_REQUESTED = Symbol(),
	STDERR_OUTPUT = Symbol();

// Exports
module.exports = DuplexChild;

// Check if `._final()` supported (introduced in Node v8.0.0)
const shimFinal = new Duplex()._writableState.finalCalled == null;

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

	// Ensure `._final()` called when writable side finishing
	// NB 'prefinish' event only fires once `._write()` has called back
	if (shimFinal) this.on('prefinish', () => this._final(noop));

	logEvents('duplex', this);

	// Save options
	options.killSignal = options.killSignal == null ? 'SIGTERM' : options.killSignal + '';
	this[OPTIONS] = options;

	// Init
	this.process = null;
	this[ERRORED] = false;
	this[EXITED] = false;
	this[ENDED] = false;
	this[DESTROYED] = false;
	this[READING] = false;
	this[WRITEABLE_BUFFER] = undefined;
	this[WRITEABLE_CALLBACK] = undefined;
	this[READABLE_REQUESTED] = undefined;
	this[STDERR_OUTPUT] = [];
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
	const {stdout, stderr} = process;

	logEvents('process', process);
	logEvents('stdin', process.stdin);
	logEvents('stdout', stdout);
	logEvents('stderr', stderr);

	process[STREAM] = this;
	stdout[STREAM] = this;
	stderr[STREAM] = this;

	// Process handlers
	process.on('error', onError);
	process.on('exit', onExit);
	process.on('close', onClose);
	stdout.on('end', onEnd);
	stdout.on('error', onEnd);

	// Collect stderr output
	stderr.on('data', onStderr);
	stderr.on('error', noop);

	// If data written/requested already, write it to stdin/read from stdout
	writeStashedInput(this);
	readStashedOutput(this);

	// Return `DuplexChild` object for chaining
	return this;
};

// Process error handler
function onError(err) {
	// Spawn failed
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
	const stderrOutput = duplex[STDERR_OUTPUT];
	if (code || signal || stderrOutput.length) {
		// Process exited abnormally or wrote to stderr
		// TODO Wait for stderr to close/error
		const stderrText = Buffer.concat(stderrOutput).toString('utf8').trim(),
			err = new Error(`Process exited with ${code ? `code ${code}` : `signal ${signal}`}: '${stderrText}'`);
		duplex[ERRORED] = true;
		duplex.emit('error', err);

		this.stdin.destroy();
		this.stdout.destroy();
		this.stderr.destroy();

		return;
	}

	// If stdout ended, end
	if (duplex[ENDED]) end(duplex);
}

function onEnd() {
	// Called on stdout if 'end' or 'error' event emitted
	const duplex = this[STREAM]; // jshint ignore:line

	// Flag as ended
	duplex[ENDED] = true;

	// If exited, end
	if (duplex[EXITED]) end(duplex);
}

function end(duplex) {
	// Process exited + stdout ended
	duplex.push(null);
	// TODO Check all data emitted before pushing `null`
}

function onClose() {
	// jshint validthis:true
	const duplex = this[STREAM];
	cleanup(duplex);
	duplex.emit('close');
}

function onStderr(data) {
	const duplex = this[STREAM]; // jshint ignore:line
	duplex[STDERR_OUTPUT].push(data);
}

/*
 * Writable side
 */
DuplexChild.prototype._write = function(chunk, encoding, cb) { // jshint ignore:line
	console.log(`_write() called: ${chunk.length} bytes`);

	// If process not spawned yet, cache input and callback
	// Will be fed to stdin once spawned and callback called then
	if (!this.process) return stashInput(this, chunk, cb);

	// Write to stdin
	writeStdin(this, chunk, cb);
};

DuplexChild.prototype._final = function(cb) {
	console.log('_final() called');
	// If process not spawned yet, cache callback
	// Will be fed to stdin once spawned and callback called then
	if (!this.process) return stashInput(this, null, cb);

	// Write to stdin
	endStdin(this, cb);
};

function writeStdin(duplex, chunk, cb) {
	// Write to stdin
	const {stdin} = duplex.process;
	console.log('calling stdin write');
	const keepWriting = stdin.write(chunk);
	console.log('keepWriting:', keepWriting);

	// If stdin happy to receive more, callback
	if (keepWriting) return cb(null);

	// Stdin needs to drain - callback only once drained or stdin errors
	function done(err) {
		stdin.removeListener('drain', done);
		stdin.removeListener('error', done);
		cb(err ? err : null);
	}

	console.log('waiting for stdin drain before writing more');
	stdin.on('drain', done);
	stdin.on('error', done);
}

function endStdin(duplex, cb) {
	console.log('calling stdin end');
	duplex.process.stdin.end();
	cb();
}

function stashInput(duplex, chunk, cb) {
	console.log(`stashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	duplex[WRITEABLE_BUFFER] = chunk;
	duplex[WRITEABLE_CALLBACK] = cb;
}

function writeStashedInput(duplex) {
	const cb = duplex[WRITEABLE_CALLBACK];
	if (!cb) return;

	const chunk = duplex[WRITEABLE_BUFFER];
	console.log(`unstashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	duplex[WRITEABLE_BUFFER] = undefined;
	duplex[WRITEABLE_CALLBACK] = undefined;

	if (chunk) {
		writeStdin(duplex, chunk, cb);
	} else {
		endStdin(duplex, cb);
	}
}

/*
 * Readable side
 */
DuplexChild.prototype._read = function(size) {
	console.log(`_read() called: size ${size}`);

	// If process not started yet, stash read request
	if (!this.process) return stashOutput(this, size);

	// Read from stdout
	readStdout(this, size);
};

function readStdout(duplex, size) {
	console.log('------------');
	console.log(`readStdout() called: size ${size}`);

	// If currently reading, exit
	if (duplex[READING]) {
		console.log('ANOTHER CALL TO READ BEFORE READING COMPLETED');
		return;
	}

	// If stdout ended, exit
	if (duplex[ENDED]) return;

	// Read from stdout until exhausted or readable side doesn't want any more
	duplex[READING] = true;
	const {stdout} = duplex.process;

	while (true) {
		// Read from stdout
		console.log(`calling stdout read: size ${size}`);
		const data = stdout.read(size);
		console.log(`read ${data == null ? data : `${data.length} bytes`}`);

		// No data available - wait for more
		if (!data) break;

		// Data returned - push out of stream
		console.log(`calling duplex push: ${data.length} bytes`);
		const wantsMore = duplex.push(data);
		console.log('wantsMore:', wantsMore);

		// If readable side of stream does not want more, exit
		if (!wantsMore) {
			duplex[READING] = false;
			return;
		}
	}

	duplex[READING] = false;

	// Need more data - wait until readable again
	console.log('listening for stdout readable');
	stdout.once('readable', () => {
		console.log(`stdout readable - reading again: size ${size}`);
		readStdout(duplex, size);
	});
}

function stashOutput(duplex, size) {
	duplex[READABLE_REQUESTED] = size;
}

function readStashedOutput(duplex) {
	const size = duplex[READABLE_REQUESTED];
	if (size === undefined) return;

	duplex[READABLE_REQUESTED] = undefined;

	readStdout(duplex, size);
}

/*
 * Destroy hander
 */
DuplexChild.prototype._destroy = function(err, cb) {
	console.log('_destroy()');
	// If destroy already called or process exited, do nothing
	if (this[DESTROYED] || this[EXITED]) return;

	// Flag as destroyed
	this[DESTROYED] = true;

	// If process not spawned yet, emit error + close
	if (!this.process) {
		cleanupStream(this);
		return cb(err);
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
	// Clean up stream
	cleanupStream(duplex);

	// Remove process event listeners
	const {process} = duplex,
		{stdin, stdout, stderr} = process;
	process.removeAllListeners('exit');
	process.removeAllListeners('error');
	process.removeAllListeners('close');
	stdin.removeAllListeners('drain');
	stdin.removeAllListeners('error');
	stdout.removeAllListeners('end');
	stdout.removeAllListeners('error');
	stderr.removeAllListeners('data');
	stderr.removeAllListeners('error');
}

function cleanupStream(duplex) {
	// Remove event listeners
	duplex.removeAllListeners('prefinish');

	// Discard input buffer
	duplex[WRITEABLE_BUFFER] = undefined;
	duplex[WRITEABLE_CALLBACK] = undefined;
	duplex[STDERR_OUTPUT] = undefined;

	// NB Leave `.process` attached as user may want to access it
}

function noop() {}


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
