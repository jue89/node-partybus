const EventEmitter = require('events');

module.exports = jest.fn(() => {
	module.exports.__hood = new EventEmitter();
	module.exports.__hood.send = jest.fn();
	return Promise.resolve(module.exports.__hood);
});
