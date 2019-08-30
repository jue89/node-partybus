const tubemail = require('tubemail');

const SUBSCRIBE = 0;
const UNSUBSCRIBE = 1;
const EVENT = 2;

const encode = (type, id, payload) => {
	if (payload !== undefined) {
		// Dirty hack to convert Date to object instead of a string
		/* eslint no-extend-native: ["error", { "exceptions": ["Date"] }] */
		const backupToJSON = Date.prototype.toJSON;
		Date.prototype.toJSON = function () {
			return { type: 'Date', data: this.toISOString() };
		};
		payload = JSON.stringify(payload);
		Date.prototype.toJSON = backupToJSON;
	} else {
		payload = '';
	}

	return Buffer.concat([
		Buffer.from([type]),
		id,
		Buffer.from(payload)
	]);
};

const decode = (msg) => {
	const type = msg[0];
	const id = msg.slice(1, 5);
	const payload = msg.slice(5).toString();
	return {
		type: type,
		id: id,
		payload: payload.length === 0 ? undefined : JSON.parse(payload, (key, value) => {
			if (typeof value === 'object' && value) {
				if (value.type === 'Buffer' && value.data instanceof Array) {
					return Buffer.from(value.data);
				} else if (value.type === 'Date' && typeof value.data === 'string') {
					return new Date(value.data);
				}
			}
			return value;
		})
	};
};

function Partybus (hood) {
	this.cbs = {};
	this.remoteEvents = [];
	this.localEvents = [];
	this.observers = [];
	this.cnt = 0;
	this.hood = hood.on('foundNeigh', (neigh) => {
		// Register all events at new neighbour
		this.localEvents.forEach((event) => {
			neigh.send(encode(SUBSCRIBE, event.id, event.eventNameRegexp));
		});
	}).on('lostNeigh', (neigh) => {
		// Remove all events related to neigh
		this.remoteEvents = this.remoteEvents.filter((e) => {
			const keep = e.neigh !== neigh;
			if (!keep) this._updateObservers(e, -1);
			return keep;
		});
	}).on('message', (msg, neigh) => {
		try {
			if (msg.length < 5) return;
			msg = decode(msg);
			if (msg.type === SUBSCRIBE) {
				const event = {
					id: msg.id,
					eventNameRegexp: msg.payload,
					eventName: new RegExp(msg.payload),
					neigh: neigh
				};
				this.remoteEvents.push(event);
				this._updateObservers(event, 1);
			} else if (msg.type === UNSUBSCRIBE) {
				this.remoteEvents = this.remoteEvents.filter((e) => {
					const keep = !(e.neigh === neigh && Buffer.compare(e.id, msg.id) === 0);
					if (!keep) this._updateObservers(e, -1);
					return keep;
				});
			} else if (msg.type === EVENT) {
				this._callListener(
					msg.id,
					msg.payload.shift(),
					neigh,
					msg.payload
				);
			}
		} catch (e) {}
	});
}

Partybus.prototype._callListener = function (id, eventName, source, args) {
	process.nextTick(() => this.cbs[id.toString('hex')].apply({
		event: eventName,
		source: source
	}, args));
};

const eventNameOn = /^[0-9a-zA-Z$.:_+#-]*$/;
Partybus.prototype.on = function (eventNameSelector, listener) {
	if (!eventNameOn.test(eventNameSelector)) {
		throw new Error('Disallowed character in event name. Allowed: 0-9 a-z A-Z $ . : _ - + #');
	}
	if (typeof listener !== 'function') {
		throw new Error('Event handler must be of type function');
	}

	// The ID identifies the event listener
	// In combination with the tubemail ID it is unique
	const id = Buffer.alloc(4);
	id.writeUInt32BE(this.cnt++, 0);

	// Store listener and create a handle
	const eventNameRegexp = '^' + eventNameSelector
		.replace(/\./g, '\\.')
		.replace(/\$/g, '\\$')
		.replace(/\+/g, '[^\\.]*')
		.replace(/#/g, '.*') + '$';
	const event = {
		id: id,
		eventNameSelector: eventNameSelector,
		eventNameRegexp: eventNameRegexp,
		eventName: new RegExp(eventNameRegexp),
		listener: listener
	};
	this.localEvents.push(event);
	this.cbs[id.toString('hex')] = listener;
	this._updateObservers(event, 1);

	// Notify other peers about new event listener
	this.hood.send(encode(SUBSCRIBE, id, event.eventNameRegexp));

	return this;
};

Partybus.prototype._removeListener = function (removeTest) {
	// Remove all matching event
	this.localEvents = this.localEvents.filter((e) => {
		// Skip non-matching evnets
		if (!removeTest(e)) return true;

		// Remove event from all other peers
		this.hood.send(encode(UNSUBSCRIBE, e.id));

		// Remove event listener
		delete this.cbs[e.id.toString('hex')];

		// Update observers
		this._updateObservers(e, -1);

		return false;
	});
};

Partybus.prototype.removeListener = function (eventNameSelector, listener) {
	const removeTest = (e) => e.eventNameSelector === eventNameSelector && e.listener === listener;
	this._removeListener(removeTest);
	return this;
};

Partybus.prototype.removeAllListeners = function (eventNameSelector) {
	const removeTest = eventNameSelector === undefined
		? (e) => true
		: (e) => e.eventNameSelector === eventNameSelector;
	this._removeListener(removeTest);
	return this;
};

const eventNameEmit = /^[0-9a-zA-Z$.:_-]*$/;
function checkEventNameEmit (eventName) {
	if (!eventNameEmit.test(eventName)) {
		throw new Error('Disallowed character in event name. Allowed: 0-9 a-z A-Z $ . : _ -');
	}
};

Partybus.prototype.emit = function (eventName) {
	checkEventNameEmit(eventName);

	const args = Array.prototype.slice.call(arguments);

	const localJobs = this.localEvents
		.filter((e) => e.eventName.test(eventName))
		.map((e) => this._callListener(e.id, eventName, this.hood, args.slice(1)));

	const remoteJobs = this.remoteEvents
		.filter((e) => e.eventName.test(eventName))
		.map((e) => e.neigh.send(encode(EVENT, e.id, args)));

	return Promise.all(remoteJobs).then(() => localJobs.length + remoteJobs.length);
};

Partybus.prototype.listeners = function (eventName) {
	checkEventNameEmit(eventName);
	const l = this.localEvents.filter((e) => e.eventName.test(eventName)).map(() => this.hood);
	const r = this.remoteEvents.filter((e) => e.eventName.test(eventName)).map((e) => e.neigh);
	return l.concat(r);
};

Partybus.prototype.listenerCount = function (eventName) {
	return this.listeners(eventName).length;
};

Partybus.prototype.observeListenerCount = function (eventName, cb) {
	let count = this.listenerCount(eventName);
	const observer = {eventName, count, cb};
	this.observers.push(observer);
	cb(count);
	return () => {
		this.observers = this.observers.filter((o) => o !== observer);
	};
};

Partybus.prototype._updateObservers = function (e, diff) {
	this.observers.forEach((o) => {
		if (!e.eventName.test(o.eventName)) return;
		o.count += diff;
		o.cb(o.count);
	});
};

module.exports = (opts) => tubemail(opts).then((hood) => new Partybus(hood));
