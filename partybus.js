const tubemail = require('tubemail');

/* const SUBSCRIBE = 0;
const UNSUBSCRIBE = 1;
const EVENT = 2;

const encode = (type, id, payload) => {};
const decode = (msg) => {}; */

function Partybus (realm) {
	// this.listeners = {};
	// this.remoteEvents = [];
	// this.localEvents = [];
	// this.cnt = 0;
	this.realm = realm.on('foundNeigh', (n) => {
		// Register all events
		// this.localEvents.forEach((e) => n.send(encode(SUBSCRIBE, e.id, [ e.eventNameRegexp ])));
	}).on('lostNeigh', (n) => {
		// Remove all events related to n
		// this.remoteEvents.filter((e) => e.neigh !== n);
	}).on('message', (msg, n) => {
		// Handle message
		// msg = decode(msg);
		// switch(msg.type)
		// case SUBSCRIBE: this.remoteEvents.push({id: msg.id, eventNameRegexp: msg.payload[0], neigh: n });
		// case EVENT: this._callListeners(msg.id, msg.payload.shift(), n, msg.payload);
	});
}

Partybus.prototype._callListener = function (id, eventName, origin, args) {
	// this.listeners[id.toString('hex')].call({event: eventName, origin: origin}, args);
};

Partybus.prototype.on = function (eventNameRegexp, listener) {
	// const id = Buffer.alloc(4); Buffer.writeUInt32(this.cnt++);
	// const e = { eventNameRegexp, id };
	// this.listeners[id.toString('hex')] = listener;
	// this.localEvents.push(e);
	// this.realm.send(encode(SUBSCRIBE, id, [ eventNameRegexp ]));
};

Partybus.prototype.emit = function () {
	// arguments = Array.prototype.slice.call(arguments);
	// const eventName = arguments[0];
	// this.localEvents.forEach((e) => { if(e.eventNameRegexp.test(eventName)) this._callListener(e.id, eventName, this.realm, arguments.slice(1))
	// this.remoteEvents.forEach((e) => { if(e.eventNameRegexp.test(eventName)) e.neigh.send(encode(EVENT, e.id, arguements)); })
};

module.exports = (opts) => tubemail(opts).then((realm) => new Partybus(realm));
