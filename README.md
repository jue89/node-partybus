# Party Bus 🎉🚌

This is a distributed event bus using [Tube Mail](https://github.com/jue89/node-tubemail) under the hood. This means you can emit events over IP networks of any kind - including the Internet. And all of this is secured by TLS connections. So it is safe to use this over non-trustworthy networks :)

*Party Bus* was initially developed for building distributed microservices on top. But you can use them whenever you want your events to travel across the Node.js process boundaries.


# Example

Don't be scared - but first of all you need a PKI for the TLS stuff. [Tube Mail](https://github.com/jue89/node-tubemail) has a bunch of little helper scripts to do that the easy way:

```sh
npm install -g tubemail tubemail-mdns partybus

mkdir pki

# Create a config for the PKI. You can adjusted these values.
cat > config.sh <<EOF
COUNTRY="VA"
STATE="Fairyland"
LOCALITY="Rainbow"
EOF

# Create a new hood. All the Party Bus people must live in the same hood.
createHood party

# For every party-goer we need a private key and certificate
createPeer party dj
createPeer party raver
```

We need an event emitter. Here it is:

```javascript
const fs = require('fs');

require('partybus')({
	key: fs.readFileSync('./party.dj.key'),
	cert: fs.readFileSync('./party.dj.crt'),
	ca: fs.readFileSync('./party.crt'),
	discovery: require('tubemail-mdns')
}).then((party) => {
	// Make some noise!
	const BPM = 140;
	setInterval(() => party.emit('music', 'utz'), 60 * 1000 / BPM);
});
```

And we need an event consumer:

```javascript
const fs = require('fs');

require('partybus')({
	key: fs.readFileSync('./party.raver.key'),
	cert: fs.readFileSync('./party.raver.crt'),
	ca: fs.readFileSync('./party.crt'),
	discovery: require('tubemail-mdns')
}).then((party) => {
	party.on('music', (beat) => console.log(beat));
});
```

Execute these scripts somewhere on your network. Don't forget to transfer the keys and certificates.

# API

The API is designed to be kind of compatible to the Node.js events library. So you will find some old faces here. The main differences are:
 * The constructor works asynchronous and thus *Party Bus* cannot be inherited into other classes.
 * Since the objects attached to the event are serialised, transmitted and then deserialised, you cannot pass over pointers to some space of your memory. (This happens when you call functions with objects in the arguments.)

Supported instances, that can be transmitted seamlessly with *Party Bus*:
 * Date
 * Buffer

```js
const partybus = require('partybus');
partybus(opts).then((bus) => {...});
```

Joins / create a new event bus. `opts` is an object:
 * `ca`: Hood's certificate. Required.
 * `key`: Peer's private key. Required.
 * `cert`: Peer's certificate. Required.
 * `port`: The port to listen on. Default: `{from: 4816, to: 4819}`. It can be of type:
   * `Number`: Listen on the specified port.
   * `Array`: A list of ports. *Party Bus* will select a free one.
   * `Object`: A port range. First port is specified by item `from`, last one by item `to`.
 * `discovery`: Factory for discovery service.

You do not have to implement the discovery by yourself if you don't want to. Check out the *Tube Mail* discovery libraries - they are fully compatible:
 * [tubemail-mdns](https://github.com/jue89/node-tubemail-mdns): Discovers other peers on the local network using mDNS / DNS-SD.
 * [tubemail-dht](https://github.com/jue89/node-tubemail-dht): (Ab)uses the Bittorrent DHT for discovering peers on the internet. TBH: This feels a little bit magical :) Don't forget to forward the ports if you are forced to have your peer behind some *evil* NAT.

Resolved `bus` is an instance of Bus.

## Class: Bus

### Property: hood

Information about the connection. See [Tube Mail Hood](https://github.com/jue89/node-tubemail#class-hood) for details. But please keep your hands off the `send()` method ;)

### Method: emit

```js
bus.emit(event, [...args]).then((cnt) => {...});
```

Raises `event` and hands over optional `...args` to all listeners. Resolves `cnt` that states the count of called event handlers.

### Method: on

```js
bus.on(selector, callback);
```

With `selector` events to listen on is can be specified. On top it allows for wildcards:
 * `'+'` matches all characters expect from `'.'`. Thus, `'.'` is a predestined delimiter for event grouping.
 * `'#'` matches every character without any exceptions.

The function `callback` is called if an event occurs that matches `selector`. The event's `...args` are the function call's arguments. In the function's scope `this` is an object with the items:
 * `event`: The event name. This is handy if many events would match `selector`.
 * `source`: The source of the event. For details lookup [Tube Mail Peer](https://github.com/jue89/node-tubemail#class-neighbour).


### Method: listenerCount

```js
const count = bus.listenerCount(event);
```

Counts the amount of listeners listening for `event`.

### Method: observeListenerCount

```js
const stop = bus.observeListenerCount(event, (count) => {});
```

Calls the given callback with the `count` of listeners for `event` everytime when `count` changes. The callback will be called with the current `count` after the observer has been registered.

Calling `stop()` will remove the observer.


### Method: removeListener

```js
bus.removeListener(selector, callback);
```

Removes a previously added event listener. Call this with the same arguments you used for the `bus.on(...)` call.


### Method: removeAllListeners

```js
bus.removeAllListeners([selector]);
```

Removes all event listeners, or those of the specified `selector`.
