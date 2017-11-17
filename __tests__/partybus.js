jest.mock('tubemail');
const tubemail = require('tubemail');

const partybus = require('../partybus.js');

test('return a new Partybus instance', () => {
	const opts = {};
	return partybus(opts).then((p) => {
		expect(tubemail.mock.calls[0][0]).toBe(opts);
		expect(p.realm).toBe(tubemail.__realm);
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
		expect(tubemail.__realm.send.mock.calls[0][0].toString('hex')).toEqual(msg);
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
		tubemail.__realm.emit('foundNeigh', neigh);
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
			tubemail.__realm.emit('message', msg, neigh);
		});
		events.forEach((e, i) => {
			expect(p.remoteEvents[i].id.toString('hex')).toEqual(e.id.toString('hex'));
			expect(p.remoteEvents[i].eventNameRegexp).toEqual(e.eventNameRegexp);
			expect(p.remoteEvents[i].neigh).toBe(neigh);
		});
	});
});

test('call local listeners on emitted event', () => {
	return partybus({}).then((p) => {
		let arg;
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
		const obj = {};
		p.emit('a', obj);
		expect(arg).toBe(obj);
	});
});

test('store additional info in this context', () => {
	return partybus({}).then((p) => {
		let self;
		p.listeners['00000001'] = function () { self = this; };
		p.localEvents = [{
			id: Buffer.from([0, 0, 0, 1]),
			eventNameRegexp: '^.*$',
			eventName: /^.*$/
		}];
		p.emit('a');
		expect(self.event).toEqual('a');
		expect(self.source).toBe(tubemail.__realm);
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
	return partybus({}).then((p) => {
		let args;
		let self;
		p.listeners['00000001'] = function () {
			self = this;
			args = Array.prototype.slice.call(arguments);
		};
		const msg = Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 1]),
			Buffer.from('["a",true,null,"hello",5]')
		]);
		const neigh = {};
		tubemail.__realm.emit('message', msg, neigh);
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
		tubemail.__realm.emit('lostNeigh', neighs[0]);
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
		p.emit('a', new Date('1995-12-17T03:24:00'));
		const msg = p.remoteEvents[0].neigh.send.mock.calls[0][0];
		expect(msg.slice(5).toString()).toEqual('["a",{"type":"Date","data":"1995-12-17T03:24:00.000Z"}]');
	});
});

test('convert json to buffers', () => {
	return partybus({}).then((p) => {
		let arg;
		p.listeners['00000000'] = (a) => { arg = a; };
		tubemail.__realm.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 0]),
			Buffer.from('["a",{"type":"Buffer","data":[0,1,2,3]}]')
		]));
		expect(arg).toBeInstanceOf(Buffer);
		expect(arg.toString('hex')).toEqual('00010203');
	});
});

test('convert json to dates', () => {
	return partybus({}).then((p) => {
		let arg;
		p.listeners['00000000'] = (a) => { arg = a; };
		tubemail.__realm.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0, 0]),
			Buffer.from('["a",{"type":"Date","data":"1995-12-17T03:24:00.000Z"}]')
		]));
		expect(arg).toBeInstanceOf(Date);
		expect(arg.toISOString()).toEqual('1995-12-17T03:24:00.000Z');
	});
});

test('ignore short messages', () => {
	return partybus({}).then((p) => {
		tubemail.__realm.emit('message', Buffer.concat([
			Buffer.from([2]),
			Buffer.from([0, 0, 0])
		]));
	});
});

test('ignore undecodable messages', () => {
	return partybus({}).then((p) => {
		tubemail.__realm.emit('message', Buffer.concat([
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
