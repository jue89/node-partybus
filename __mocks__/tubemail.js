const EventEmitter = require('events');

module.exports = jest.fn(() => {
	module.exports.__realm = new EventEmitter();
	module.exports.__realm.send = jest.fn();
	return Promise.resolve(module.exports.__realm);
});
