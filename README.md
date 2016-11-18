Wrapper for the Tappy driver for Tappys that use the TCMP protocol. If 
you intend to use a lot of advanced commands from different command families,
you should probably use the core Tappy driver, but if you just wish to perform
basic tag detection and NDEF read/write operations, this wrapper can significantly
ease development.

# Installation
NPM
```shell
npm install @taptrack/tappy-wrapper
```

Bower
```
bower install tappy-tcmp-wrapper
```

## Connecting to Tappies
The Tappy wrapper is API-compatible with the core Tappy driver and can
connect the same way:

Node SerialPort (using @taptrack/tappy-nodeserialcommunicator)
```javascript
var communicator = new NodeSerialCommunicator({path: "/dev/ttyUSB0"});
var wrapper = new Wrapper({communicator: communicator});
wrapper.connect(function(){
    console.log("Connected");
    wrapper.disconnect(function() {
        console.log("Disconnected");
    });
});
```

Chrome packaged app using `@taptrack/tappy-chromeserialcommiunicator`(NPM)/
`tappy-chromeserialcommunicator`(Bower)
```javascript
var path = "/dev/ttyUSB0";
var comm = new TappyChromeSerialCommunicator(path);
var wrapper = new Wrapper({communicator: comm});

wrapper.connect(function (){
    console.log("Connected");
    wrapper.disconnect(function() {
        console.log("Disconnected");
    });
});
```

## Commands
The wrapper allows you to still use the same `sendMessage(msg)` command
that the base wrapper provides if you wish to have finer control or use
a command that the wrapper doesn't natively support. However, there are
convenience functions available for some of the most common Tappy uses.

### .detectTag(continuous, timeout)
Detect tag scans for tags entering the Tappy's range. The timeout specifies
how long to wait until the Tappy should give up and can be disabled by 
setting a value of 0. The continuous parameter is a boolean used to determine
if the Tappy should stop scanning after detecting a tag or continue until
the timeout is reached (or indefinitely if the timeout is disabled). If not 
specified, the default values are non-continuous with no timeout.

### .detectNdef(continuous, timeout)
Detect NDEF scans for tags entering the Tappy's range that contain NDEF data. 
The timeout specifies how long to wait until the Tappy should give up and 
can be disabled by setting a value of 0. The continuous parameter is a 
boolean used to determine if the Tappy should stop scanning after detecting 
a tag or continue until the timeout is reached (or indefinitely if the 
timeout is disabled). If not specified, default values are non-continuous 
with no timeout.

### .writeUri(uri, lock, timeout) / .writeUrl(uri, lock, timeout)
Write URI writes an NDEF Message containing a single URI record containing
the specified URI/URL to the next tag the Tappy encounters. If the lock 
flag is set to true and the tag presented supports locking, the tag 
will be permanently and irreversibly locked so its contents cannot be
changed or overwritten. The timeout determines how long the Tappy will
wait for a tag to be presented before giving up (0 disables timeout). 
If not specified, the Tappy will use an indefinite timeout and not lock
tags.

### .writeText(text, lock, timeout) 
Write Text writes an NDEF Message containing a single URI record containing
the specified URI/URL to the next tag the Tappy encounters. If the lock 
flag is set to true and the tag presented supports locking, the tag 
will be permanently and irreversibly locked so its contents cannot be
changed or overwritten. The timeout determines how long the Tappy will
wait for a tag to be presented before giving up (0 disables timeout). 
If not specified, the Tappy will use an indefinite timeout and not lock
tags.

### .writeNdef(message, lock, timeout) 
Write NDEF writes a custom NDEF Message to the next tag the Tappy encounters. 
The message should be a Uint8Array containing the full NDEF message, but
not including any tag technology-specific information (ie do not include
the capability container). If the lock flag is set to true and the tag 
presented supports locking, the tag will be permanently and irreversibly 
locked so its contents cannot be changed or overwritten. The timeout 
determines how long the Tappy will wait for a tag to be presented before 
giving up (0 disables timeout). If not specified, the Tappy will use an 
indefinite timeout and not lock tags.

### .lockTag(uid,timeout)
Lock Tag locks a the next tag presented so that its contents cannot be 
changed or updated. If you wish to lock a specific tag, the 4-, 7-, or
10-byte tag code pertaining to that tag can be specified as a Uint8Array.
A 0-length array will disable uid filtering. Additionally, a timeout
can be specified to limit the amount of time the Tappy will wait for a
tag before cancelling the operation and timing out. If not specified,
no UID filtering will be applied and an indefinite timeout will be used.

### .stop()
Stop will cause the Tappy to stop doing whatever operation it is currently
performing.

## Events
You can use the same `setMessageListener()` and `setErrorListener()` 
that the base Tappy driver has in order tolisten for communication from 
the Tappy, but for the common operations explicitly supported by the 
wrapper, it is often easier to register event listeners.

In order to get register event listeners use the `.on(topic,callback)` 
function. Note, each topic can only have one listener at a time. After 
you have  set a listener, setting it again will replace the previous listener.

All the listeners take a single object representing the message that was
published with variable format depending on the topic the message was
published on.

### Topics

#### connect 
Published when the connect() callback is called.

Message contents:
* `args` Array of the arguments passed to the callback, contents will
vary depending on the communicator used

#### disconnect
Published when the disconnect() callback is called.

Message contents:
* `args` Array of the arguments passed to the callback, contents will
vary depending on the communicator used

#### sent 
Published when wrapper sends a message to the Tappy.

Message contents:
* `message` Message that was sent to the Tappy 

#### received
Published when wrapper receives a message from the Tappy.

Message contents:
* `message` Message that was received from the Tappy 

#### error_message 
Published when the Tappy responds with a message indicating an error 
occured. Note that this topic will only contain errors from the System
and BasicNFC command families. So, if you send a message using sendMessage() 
that comes from a different command family, that command family's error messages 
will not be reported here.

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message 
* `description` Human readable description of error 

#### tag_written 
Published when the Tappy reports that it has written data to a tag.

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message (BasicNfc's TagWritten)
* `tagTypeCode` Tappy tag type identifier code
* `tagType` Object describing the tag type's properties
* `tagCode` Uint8Array representation of the tag's unique identifier code
* `tagCodeStr` Tag code represented as a hexadecimal string

#### tag_found
Published when the Tappy reports that it has detected a tag.

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message (BasicNfc's TagFound) 
* `tagTypeCode` Tappy tag type identifier code
* `tagType` Object describing the tag type's properties
* `tagCode` Uint8Array representation of the tag's unique identifier code
* `tagCodeStr` Tag code represented as a hexadecimal string

#### ndef_found
Published when the Tappy reports that it has detected a tag containing
NDEF data.

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message (BasicNfc's NdefFound) 
* `tagTypeCode` Tappy tag type identifier code
* `tagType` Object describing the tag type's properties
* `tagCode` Uint8Array representation of the tag's unique identifier code
* `tagCodeStr` Tag code represented as a hexadecimal string
* `rawNdef` Uint8Array of raw NDEF message binary data
* `ndef` NDEF message object from @taptrack/ndef (NPM)/ndef (bower) created
by parsing rawNdef

#### timeout_reached
Published when a timeout is reached

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message (BasicNfc's ScanTimeout) 

#### invalid_message 
Published when a message was received that appears to be one of the ones
the wrapper supports natively, but the payload format was not correct.

Message contents:
* `message` Raw message that was received from the Tappy 
* `error` Exception thrown by parser 

#### invalid_ndef
Published when a valid NdefFound message is received, but the 
message contained in it fails to parse correctly

Message contents:
* `message` Raw message that was received from the Tappy 
* `resolved` Resolved form of message (BasicNfc's NdefFound) 
* `tagTypeCode` Tappy tag type identifier code
* `tagType` Object describing the tag type's properties
* `tagCode` Uint8Array representation of the tag's unique identifier code
* `tagCodeStr` Tag code represented as a hexadecimal string
* `rawNdef` Uint8Array of raw NDEF message binary data
* `ndef` Raw Ndef message parsed into an NDEF message object from
@taptrack/ndef (NPM)/ndef (bower)
* `error` Exception that was thrown on parsing
#### driver_error 
Published when an error is reported by the driver itself

Message contents:
* `errorType` The errorType reported by the driver
* `data` The data passed to the Tappy driver's error callback. Contents
varies depending on the communciator in use.
* `description` human readable description of error 
