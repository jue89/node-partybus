# Party Bus 🎉🚌

A distributed event bus across networks. Yes, including the Internet.


# Protocol Design

Subscribe:
-> <00> <aa bb cc dd> ["eventnameRegExp"]

Remove subscription:
-> <01> <aa bb cc dd>

Event:
-> <02> <aa bb cc dd> ["eventname", args...]
