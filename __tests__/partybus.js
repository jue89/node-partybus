jest.mock('tubemail');
const tubemail = require('tubemail');

const partybus = require('../partybus.js');

const nextLoop = () => new Promise((resolve) => setImmediate(resolve));

test('return a new Partybus instance', () => {
	const opts = {};
	return partybus(opts).then((p) => {
		expect(tubemail.mock.calls[0][0]).toBe(opts);
		expect(p.hood).toBe(tubemail.__hood);
	});
});

test('create an event id on every on() call and store listeners and event handle', () => {
	return partybus({}).then((p) => {
		const l0 = () => {};
		const l1 = () => {};
		p.on('e0', l0).on('e1', l1);
		expect(p.listeners['00000000']).toBe(l0);
		expect(p.localEvents[0]).toMatchObject({
			id: Buffer.from([0, 0, 0, 0]),
			eventNameRegexp: '^e0$'
		});
		expect(p.listeners['00000001']).toBe(l1);
		expect(p.localEvents[1]).toMatchObject({
			id: Buffer.from([0, 0, 0, 1]),
			eventNameRegexp: '^e1$'
		});
	});
});

test('broadcast new event listener', () => {
	return partybus({}).then((p) => {
		p.on('e0', () => {});
		const msg = Buffer.concat([
			Buffer.from([0]),          // SUBSCRIBE
			Buffer.from([0, 0, 0, 0]), // LISTENER ID
			Buffer.from('"^e0$"')      // EVENT NAME REGEXP
		]).toString('hex');
		expect(tubemail.__hood.send.mock.calls[0][0].toString('hex')).toEqual(msg);
	});
});

test('escape \'.\' and \'$\' in event names', () => {
	return partybus({}).then((p) => {
		p.on('e0.sub0', () => {});
		expect(p.localEvents[0].eventNameRegexp).toEqual('^e0\\.sub0$');
		p.on('e0$sub0', () => {});
		expect(p.localEvents[1].eventNameRegexp).toEqual('^e0\\$sub0$');
	});
});

test('make \'+\' and \'#\' to wildcards', () => {
	return partybus({}).then((p) => {
		p.on('e0.+', () => {});
		expect(p.localEvents[0].eventNameRegexp).toEqual('^e0\\.[^\\.]*$');
		p.on('e0.#', () => {});
		expect(p.localEvents[1].eventNameRegexp).toEqual('^e0\\..*$');
	});
});

test('send new neighs local events', () => {
	return partybus({}).then((p) => {
		const re = ['^a$', '^b$'];
		p.localEvents = re.map((eventNameRegexp, i) => {
			const id = Buffer.alloc(4);
			id.writeUInt32BE(i, 0);
			return { id, eventNameRegexp };
		});
		const msgs = re.map((eventNameRegexp, i) => {
			return Buffer.concat([
				Buffer.from([0]),
				Buffer.from([0, 0, 0, i]),
				Buffer.from(`"${eventNameRegexp}"`)
			]).toString('hex');
		});
		const neigh = { send: jest.fn() };
		tubemail.__hood.emit('foundNeigh', neigh);
		expect(neigh.send.mock.calls[0][0].toString('hex')).toEqual(msgs[0]);
		expect(neigh.send.mock.calls[1][0].toString('hex')).toEqual(msgs[1]);
	});
});

test('react to subscribe messages', () => {
	return partybus({}).then((p) => {
		const neigh = {};
		const re = ['^a$', '^b$'];
		const events = re.map((eventNameRegexp, i) => {
			const id = Buffer.alloc(4);
			id.writeUInt32BE(i, 0);
			return { id, eventNameRegexp, neigh };
		});
		const msgs = re.map((eventNameRegexp, i) => {
			return Buffer.concat([
				Buffer.from([0]),
				Buffer.from([0, 0, 0, i]),
				Buffer.from(`"${eventNameRegexp}"`)
			]);
		});
		msgs.forEach((msg) => {
			tubemail.__hood.emit('message', msg, neigh);
		});
		events.forEach((e, i) => {
			expect(p.remoteEvents[i].id.toString('hex')).toEqual(e.id.toString('hex'));
			expect(p.remoteEvents[i].eventNameRegexp).toEqual(e.eventNameRegexp);
			expect(p.remoteEvents[i].neigh).toBe(neigh);
		});
	});
});

test('call local listeners on emitted event', () => {
	const obj = {};
	let arg;
	return partybus({}).then((p) => {
		p.listeners['00000001'] = (a) => { arg = a; };
		p.listeners['00000002'] = () => { arg = null; };
		p.localEvents = [{
			id: Buffer.from([0, 0, 0, 1]),
			eventNameRegexp: '^a$',
			eventName: /^a$/
		}, {
			id: Buffer.from([0, 0, 0, 2]),
			eventNameRegexp: '^b$',
			eventName: /^b$/
		}];
		p.emit('a', obj);
		return nextLoop();
	}).then(() => {
		expect(arg).toBe(obj);
	});
});

test('store additional info in this context', () => {
	let self;
	return partybus({}).then((p) => {
		p.listeners['00000001'] = function () { self = this; };
		p.localEvents = [{
			id: Buffer.from([0, 0, 0, 1]),
			eventNameRegexp: '^.*$',
			eventName: /^.*$/
		}];
		p.emit('a');
		expect(self).toBeUndefined();
		return nextLoop();
	}).then(() => {
		expect(self.event).toEqual('a');
		expect(self.source).toBe(tubemail.__hood);
	});
});

test('call remote listeners on emitted event', () => {
	return partybus({}).then((p) => {
		p.remoteEvents = [{
			id: Buffer.from([0, 0, 0, 1]),
			eventNameRegexp: '^a$',
			eventName: /^a$/,
			neigh: { send: jest.fn() }
		}, {
			id: Buffer.from([0, 0, 0, 2]),
			eventNameRegexp: '^b$',
			eventName: /^b$/,
			neigh: { send: jest.fn() }
		}];
		const obj = {};
		p.emit('a', obj);
		const msg = Buffer.concat([
			Buffer.from([2]),
			p.remoteEvents[0].id,
			Buffer.from('["a",{}]')
		]).toString('hex');
		expect(p.remoteEvents[0].neigh.send.mock.calls[0][0].toString('hex')).toEqual(msg);
	});
});

test('react to event messages', () => {
	const neigh = {};
	let args;
	let self;
	return partybus({}).then((p) => {
		p.listeners['00000001'] = function () {
			self = this;
			args = Array.prototype.slice.call(arguments);
		};
		const msg = Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 1]),
			Buffer.from('["a",true,null,"hello",5]')
		]);
		tubemail.__hood.emit('message', msg, neigh);
		return nextLoop();
	}).then(() => {
		expect(args[0]).toEqual(true);
		expect(args[1]).toEqual(null);
		expect(args[2]).toEqual('hello');
		expect(args[3]).toEqual(5);
		expect(self.event).toEqual('a');
		expect(self.source).toBe(neigh);
	});
});

test('remove events of disappered neighbours', () => {
	return partybus({}).then((p) => {
		const neighs = [{}, {}];
		p.remoteEvents = neighs.map((n) => ({ neigh: n }));
		tubemail.__hood.emit('lostNeigh', neighs[0]);
		expect(p.remoteEvents.length).toEqual(1);
		expect(p.remoteEvents[0].neigh).toBe(neighs[1]);
	});
});

test('convert buffers to json', () => {
	return partybus({}).then((p) => {
		p.remoteEvents = [{
			neigh: { send: jest.fn() },
			id: Buffer.from('0000'),
			eventName: /^a$/
		}];
		p.emit('a', Buffer.from([0, 1, 2, 3]));
		const msg = p.remoteEvents[0].neigh.send.mock.calls[0][0];
		expect(msg.slice(5).toString()).toEqual('["a",{"type":"Buffer","data":[0,1,2,3]}]');
	});
});

test('convert dates to json', () => {
	return partybus({}).then((p) => {
		p.remoteEvents = [{
			neigh: { send: jest.fn() },
			id: Buffer.from('0000'),
			eventName: /^a$/
		}];
		p.emit('a', new Date('1995-12-17T03:24:00Z'));
		const msg = p.remoteEvents[0].neigh.send.mock.calls[0][0];
		expect(msg.slice(5).toString()).toEqual('["a",{"type":"Date","data":"1995-12-17T03:24:00.000Z"}]');
	});
});

test('convert json to buffers', () => {
	let arg;
	return partybus({}).then((p) => {
		p.listeners['00000000'] = (a) => { arg = a; };
		tubemail.__hood.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 0]),
			Buffer.from('["a",{"type":"Buffer","data":[0,1,2,3]}]')
		]));
		return nextLoop();
	}).then(() => {
		expect(arg).toBeInstanceOf(Buffer);
		expect(arg.toString('hex')).toEqual('00010203');
	});
});

test('convert json to dates', () => {
	let arg;
	return partybus({}).then((p) => {
		p.listeners['00000000'] = (a) => { arg = a; };
		tubemail.__hood.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 0]),
			Buffer.from('["a",{"type":"Date","data":"1995-12-17T03:24:00.000Z"}]')
		]));
		return nextLoop();
	}).then(() => {
		expect(arg).toBeInstanceOf(Date);
		expect(arg.toISOString()).toEqual('1995-12-17T03:24:00.000Z');
	});
});

test('ignore short messages', () => {
	return partybus({}).then((p) => {
		tubemail.__hood.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0])
		]));
	});
});

test('ignore undecodable messages', () => {
	return partybus({}).then((p) => {
		tubemail.__hood.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 0])
		]));
	});
});

test('complain about unallowed chars in event name', () => {
	return partybus({}).then((p) => {
		p.on('(', () => {});
		throw new Error('Failed');
	}).catch((e) => {
		expect(e.message).toEqual('Disallowed character in event name. Allowed: 0-9 a-z A-Z $ . : _ - + #');
	});
});

test('complain about missing event handler', () => {
	return partybus({}).then((p) => {
		p.on('09azAZ$.:_-+#');
		throw new Error('Failed');
	}).catch((e) => {
		expect(e.message).toEqual('Event handler must be of type function');
	});
});

test('complain about unallowed chars in event name', () => {
	return partybus({}).then((p) => {
		p.emit('+');
		throw new Error('Failed');
	}).catch((e) => {
		expect(e.message).toEqual('Disallowed character in event name. Allowed: 0-9 a-z A-Z $ . : _ -');
	});
});

test('react to unsubscribe messages', () => {
	return partybus({}).then((p) => {
		const id1 = Buffer.from([0, 0, 0, 0]);
		const id2 = Buffer.from([0, 0, 0, 1]);
		const neigh = {};
		const event1 = { id: id1, neigh };
		const event2 = { id: id2, neigh };
		p.remoteEvents = [event1, event2];

		const msg = Buffer.concat([
			Buffer.from([1]), // UNSUBSCRIBE
			id1
		]);
		tubemail.__hood.emit('message', msg, neigh);

		expect(p.remoteEvents.length).toEqual(1);
		expect(p.remoteEvents[0]).toBe(event2);
	});
});

test('remove events', () => {
	return partybus({}).then((p) => {
		const id1 = Buffer.from([0, 0, 0, 0]);
		const id2 = Buffer.from([0, 0, 0, 1]);
		const l1 = () => {};
		const l2 = () => {};
		p.listeners[id1.toString('hex')] = l1;
		p.listeners[id2.toString('hex')] = l2;
		const event1 = { id: id1, eventNameSelector: 'a', listener: l1 };
		const event2 = { id: id2, eventNameSelector: 'a', listener: l2 };
		p.localEvents = [event1, event2];

		p.removeListener('a', l1);

		expect(p.localEvents.length).toEqual(1);
		expect(p.localEvents[0]).toBe(event2);
		expect(p.listeners[id1.toString('hex')]).toBeUndefined();
	});
});

test('notify peers about removed events', () => {
	return partybus({}).then((p) => {
		const id = Buffer.from([0, 0, 0, 0]);
		const listener = () => {};
		p.listeners[id.toString('hex')] = listener;
		const event = { id, eventNameSelector: 'a', listener };
		p.localEvents = [event];

		p.removeListener('a', listener);

		const msg = Buffer.concat([
			Buffer.from([1]),
			id
		]);
		expect(tubemail.__hood.send.mock.calls.length).toEqual(1);
		expect(tubemail.__hood.send.mock.calls[0][0].toString()).toEqual(msg.toString());
	});
});

test('remove events by selector', () => {
	return partybus({}).then((p) => {
		const id1 = Buffer.from([0, 0, 0, 0]);
		const id2 = Buffer.from([0, 0, 0, 1]);
		const id3 = Buffer.from([0, 0, 0, 2]);
		const listener = () => {};
		p.listeners[id1.toString('hex')] = listener;
		p.listeners[id2.toString('hex')] = listener;
		p.listeners[id3.toString('hex')] = listener;
		const event1 = { id: id1, eventNameSelector: 'a', listener: listener };
		const event2 = { id: id2, eventNameSelector: 'a', listener: listener };
		const event3 = { id: id2, eventNameSelector: 'b', listener: listener };
		p.localEvents = [event1, event2, event3];

		p.removeAllListeners('a');

		expect(p.localEvents.length).toEqual(1);
		expect(p.localEvents[0]).toBe(event3);
	});
});

test('remove all events', () => {
	return partybus({}).then((p) => {
		const id1 = Buffer.from([0, 0, 0, 0]);
		const id2 = Buffer.from([0, 0, 0, 1]);
		const id3 = Buffer.from([0, 0, 0, 2]);
		const listener = () => {};
		p.listeners[id1.toString('hex')] = listener;
		p.listeners[id2.toString('hex')] = listener;
		p.listeners[id3.toString('hex')] = listener;
		const event1 = { id: id1, eventNameSelector: 'a', listener: listener };
		const event2 = { id: id2, eventNameSelector: 'a', listener: listener };
		const event3 = { id: id2, eventNameSelector: 'b', listener: listener };
		p.localEvents = [event1, event2, event3];

		p.removeAllListeners();

		expect(p.localEvents.length).toEqual(0);
	});
});
