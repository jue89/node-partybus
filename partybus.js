const tubemail = require('tubemail');

const SUBSCRIBE = 0;
// const UNSUBSCRIBE = 1;
const EVENT = 2;

const encode = (type, id, payload) => {
	// Dirty hack to convert Date to object instead of a string
	/* eslint no-extend-native: ["error", { "exceptions": ["Date"] }] */
	const backupToJSON = Date.prototype.toJSON;
	Date.prototype.toJSON = function () {
		return { type: 'Date', data: this.toISOString() };
	};
	payload = JSON.stringify(payload);
	Date.prototype.toJSON = backupToJSON;

	return Buffer.concat([
		Buffer.from([type]),
		id,
		Buffer.from(payload)
	]);
};

const decode = (msg) => ({
	type: msg[0],
	id: msg.slice(1, 5),
	payload: JSON.parse(msg.slice(5).toString(), (key, value) => {
		if (typeof value === 'object' && value) {
			if (value.type === 'Buffer' && value.data instanceof Array) {
				return Buffer.from(value.data);
			} else if (value.type === 'Date' && typeof value.data === 'string') {
				return new Date(value.data);
			}
		}
		return value;
	})
});

function Partybus (realm) {
	this.listeners = {};
	this.remoteEvents = [];
	this.localEvents = [];
	this.cnt = 0;
	this.realm = realm.on('foundNeigh', (neigh) => {
		// Register all events at new neighbour
		this.localEvents.forEach((event) => {
			neigh.send(encode(SUBSCRIBE, event.id, event.eventNameRegexp));
		});
	}).on('lostNeigh', (neigh) => {
		// Remove all events related to neigh
		this.remoteEvents = this.remoteEvents.filter((e) => e.neigh !== neigh);
	}).on('message', (msg, neigh) => {
		// TODO: Check message length
		msg = decode(msg);
		switch (msg.type) {
			case SUBSCRIBE:
				this.remoteEvents.push({
					id: msg.id,
					eventNameRegexp: msg.payload,
					eventName: new RegExp(msg.payload),
					neigh: neigh
				});
				break;
			case EVENT:
				this._callListener(
					msg.id,
					msg.payload.shift(),
					neigh,
					msg.payload
				);
				break;
			default:
				// TODO
		}
	});
}

Partybus.prototype._callListener = function (id, eventName, source, args) {
	// TODO: Check if listener exists
	this.listeners[id.toString('hex')].apply({
		event: eventName,
		source: source
	}, args);
};

Partybus.prototype.on = function (eventNameRegexp, listener) {
	// TODO: Check args

	// The ID identifies the event listener
	// In combination with the tubemail ID it is unique
	const id = Buffer.alloc(4);
	id.writeUInt32BE(this.cnt++, 0);

	// Store listener and create a handle
	eventNameRegexp = eventNameRegexp
		.replace(/\./g, '\\.')
		.replace(/\$/g, '\\$')
		.replace(/\+/g, '[^\\.]*')
		.replace(/#/g, '.*');
	eventNameRegexp = `^${eventNameRegexp}$`;
	const event = {
		id: id,
		eventNameRegexp: eventNameRegexp,
		eventName: new RegExp(eventNameRegexp)
	};
	this.localEvents.push(event);
	this.listeners[id.toString('hex')] = listener;

	// Notify other peers about new event listener
	this.realm.send(encode(SUBSCRIBE, id, event.eventNameRegexp));

	return this;
};

Partybus.prototype.emit = function (eventName) {
	// TODO: Check args

	const args = Array.prototype.slice.call(arguments);

	this.localEvents
		.filter((e) => e.eventName.test(eventName))
		.forEach((e) => this._callListener(e.id, eventName, this.realm, args.slice(1)));

	this.remoteEvents
		.filter((e) => e.eventName.test(eventName))
		.forEach((e) => e.neigh.send(encode(EVENT, e.id, args)));
};

module.exports = (opts) => tubemail(opts).then((realm) => new Partybus(realm));
