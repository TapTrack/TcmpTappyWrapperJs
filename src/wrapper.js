(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(["tappy-tcmp","ndef","tappy-systemfamily","tappy-basicnfcfamily"], factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        var tappy = null;
        try {
            tappy = require('@taptrack/tappy');
        } catch (e1) {
            tappy = require('tappy-tcmp');
        }
        
        var ndef = null;
        try {
            ndef = require('@taptrack/ndef');
        } catch (e1) {
            ndef = require('ndef');
        }

        var systemFamily = null;
        try {
            systemFamily = require('@taptrack/tappy-systemfamily');
        }
        catch (e1) {
            systemFamily = require('tappy-systemfamily');
        }
        
        var nfcFamily = null;
        try {
            nfcFamily = require('@taptrack/tappy-basicnfcfamily');
        }
        catch (e1) {
            nfcFamily = require('tappy-basicnfcfamily');
        }
        module.exports = factory(tappy,ndef,systemFamily,nfcFamily);
    } else {
        // Browser globals (root is window)
        root.TappyWrapper = factory(root.Tappy,root.Ndef,root.TappySystemFamily,root.TappyBasicNfcFamily);
    }
}(this, function (Tappy,Ndef,SystemFamily,NfcFamily) {
    /**
     * Internal function, converts Uint8Array to
     * a hexadecimal string notation
     *
     * @param {Uint8Array} data binary data
     * @return {string} hexadecimal representation
     */
    var arrToHex = function(data) {
        var hexString = "";
        for(var x = 0; x < data.length; x++) {
            var hexValue = data[x].toString(16).toUpperCase();
            if(data[x] <= 15) {
                // gives zero padding to hex values less than 16
                hexString = hexString.concat("0" + hexValue);
            }
            else {
                hexString = hexString.concat(hexValue);
            }
        }
        return hexString;
    };
   
    /**
     * Basic publish/subcribe
     * event bus
     *
     * @constructor
     */
    var EventBus = function() {
        this.subscribers = {};
    };

    /**
     * Publish a message to any subscribers 
     * for a variadic number of topics
     *
     * @param {object} message data to publish
     * @param {...string} topic topics to publish to
     */
    EventBus.prototype.publish = function(message){
        var self = this;
        if(typeof message === "undefined") {
            throw new Error("Must specify a message to publish");
        }
        if(arguments.length <= 1) {
            throw new Error("Must specify one message and one or more topics");
        }

        for(var i = 1; i < arguments.length; i++) {
            if(typeof arguments[i] !== "string") {
                throw new Error("Invalid argument specified, must be a string topic");
            }

            if(typeof self.subscribers[arguments[i]] === "function") {
                self.subscribers[arguments[i]](message);
            }
        }
    };

    /**
     * Sets the subscriber for a topic. 
     * Note each topic can only have one subscriber at a time,
     * if you want to send the message to multiple subscribers, 
     * the subscriber has to handle that itself.
     *
     * @param {string} topic to subscribe to
     * @param {function} subscriber function that takes a message as its parameter
     */
    EventBus.prototype.setSubscriber = function(topic,subscriber) {
        var self = this;
        if(typeof subscriber !== "function") {
            throw new Error("Subscriber must be a function");
        }

        if(typeof topic !== "string") {
            throw new Error("Must subscribe to a string subject");
        }

        self.subscribers[topic] = subscriber;
    };
   
    /**
     * Internal object for multiplexing command family resolvers
     *
     * @param {array[CommandFamilyResolver]} the resolvers to mux between
     */
    var ResolverMux = function(resolvers) {
        this.resolvers = resolvers;
    };

    /**
     * Detemine if one of the resolvers in this ResolverMux
     * will match the given command's command family.
     *
     * @param {TcmpMessage} message to check for command family matching
     * @return {boolean} true if the family is supported, false otherwise
     */
    ResolverMux.prototype.checkFamily = function(cmd) {
        var self = this;
        var supported = false;
        for(var i = 0; i < self.resolvers.length; i++) {
            supported = supported || self.resolvers[i].checkFamily(cmd);
        }
        return supported;
    };

    /**
     * Resolves a command into its concrete type using
     * the appropriate command family resolver
     *
     * @throws If the command cannot be resolved
     * @param {TcmpMessage} command to resolve
     * @return {TcmpMessage} resolved TCMP command
     */
    ResolverMux.prototype.resolveCommand = function(cmd) {
        var self = this;
        for(var i = 0; i < self.resolvers.length; i++) {
            var resolver = self.resolvers[i];
            if(resolver.checkFamily(cmd)) {
                return resolver.resolveCommand(cmd);
            }
        }
        throw new Error("Unsupported command type");
    };
    
    /**
     * Resolves a response into its concrete type using the
     * appropriate command family resolver
     *
     * @throws If the response cannot be resolved
     * @param {TcmpMessage} response to resolve
     * @return {TcmpMessage} resolved TCMP response
     */
    ResolverMux.prototype.resolveResponse = function(cmd) {
        var self = this;
        for(var i = 0; i < self.resolvers.length; i++) {
            var resolver = self.resolvers[i];
            if(resolver.checkFamily(cmd)) {
                return resolver.resolveResponse(cmd);
            }
        }
        throw new Error("Unsupported response type");
    };
    

    /**
     * Tappy Wrapper
     *
     * Wraps a TCMP Tappy to provide a simpler and easier
     * way to interact with Tappy devices for some common
     * workflows.
     *
     * @constructor
     * @param {object} if a 'tappy' property is present, wraps 
     * that Tappy, else is directly passed to construct a Tappy internally.
     */
    var Wrapper = function(params) {
        var self = this;
        if(typeof params.tappy === "object" &&
                params.tappy !== null) {
            self.tappy = params.tappy;
        } else {
            self.tappy = new Tappy(params);
        }
        self.eb = new EventBus();

        var resolverMux = new ResolverMux(
            [new NfcFamily.Resolver(), new SystemFamily.Resolver()]);

        self.tappy.setMessageListener(function(msg) {
            self.eb.publish({message: msg},"received");

            if(resolverMux.checkFamily(msg)) {
                var resolved = null;
                try {
                    resolved = resolverMux.resolveResponse(msg);
                    
                } catch (err) {
                    //ignore
                    self.eb.publish({
                        message: msg,
                        error: err},"invalid_message");
                }
                if(resolved === null) {
                    return;
                }
                
                var nfcResp = NfcFamily.Responses;
                var sysResp = SystemFamily.Responses;
                if(nfcResp.TagFound.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        tagTypeCode: msg.getTagType(),
                        tagType: Tappy.resolveTagType(msg.getTagType()),
                        tagCode: msg.getTagCode(),
                        tagCodeStr: arrToHex(msg.getTagCode())},"tag_found");
                } else if (nfcResp.TagWritten.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        tagTypeCode: msg.getTagType(),
                        tagType: Tappy.resolveTagType(msg.getTagType()),
                        tagCode: msg.getTagCode(),
                        tagCodeStr: arrToHex(msg.getTagCode())},"tag_written");
                } else if (nfcResp.NdefFound.isTypeOf(resolved)) {
                    var rawNdefMessage = msg.getMessage();
                    var parsedNdefMessage = null;
                    try {
                        parsedNdefMessage = Ndef.Message.fromBytes(rawNdefMessage);
                    } catch (err) { 
                        self.eb.publish({
                            message: msg,
                            resolved: resolved,
                            tagTypeCode: msg.getTagType(),
                            tagType: Tappy.resolveTagType(msg.getTagType()),
                            tagCode: msg.getTagCode(),
                            tagCodeStr: arrToHex(msg.getTagCode()),
                            rawNdef: rawNdefMessage,
                            error: err
                        },"invalid_ndef");
                        return;
                    }
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        tagTypeCode: msg.getTagType(),
                        tagType: Tappy.resolveTagType(msg.getTagType()),
                        tagCode: msg.getTagCode(),
                        tagCodeStr: arrToHex(msg.getTagCode()),
                        rawNdef: rawNdefMessage,
                        ndef: parsedNdefMessage},"ndef_found");
                } else if (nfcResp.TagLocked.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        tagTypeCode: msg.getTagType(),
                        tagType: Tappy.resolveTagType(msg.getTagType()),
                        tagCode: msg.getTagCode(),
                        tagCodeStr: arrToHex(msg.getTagCode())
                        },"tag_locked");
                } else if (nfcResp.ApplicationError.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: resolved.getErrorMessage()},"error_message");
                } else if (sysResp.LcsMismatch.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: "LCS Mismatch"},"error_message");
                } else if (sysResp.LengthMismatch.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: "Message length mismatch"},"error_message");
                } else if (sysResp.ImproperMessageFormat.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: "Improper message format"},"error_message");
                } else if (sysResp.CrcMismatch.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: "CRC mismatch"},"error_message");
                } else if (sysResp.SystemError.isTypeOf(resolved)) {
                    self.eb.publish({
                        message: msg,
                        resolved: resolved,
                        description: resolved.getErrorMessage()},"error_message");
                }
            }

        });

        self.tappy.setErrorListener(function(errorType,data) {
            var description = "Unknown error";
            switch(errorType) {
            case Tappy.ErrorType.NOT_CONNECTED:
                description = "Tappy not connected";
                break;
            case Tappy.ErrorType.CONNECTION_ERROR:
                description = "Connection error";
                break;
            case Tappy.ErrorType.INVALID_HDLC:
                description = "Received invalid frame";
                break;
            case Tappy.ErrorType.INVALID_TCMP:
                description = "Received invalid packet";
                break;
            }
            self.eb.publish({
                errorType: errorType,
                data: data,
                description: description
            }, 'driver_error');
        });
    };

    /**
     * Check if the Tappy is connected
     *
     * @return {boolean} connection status
     */
    Wrapper.prototype.isConnected = function() {
        var self = this;
        return self.tappy.isConnected();
    };

    /**
     * Connect to the Tappy
     *
     * @param {?function} callback to call after connection completes
     */
    Wrapper.prototype.connect = function(cb) {
        var self = this;
        return self.tappy.connect(function() {
            if(typeof cb === "function") {
                cb.apply(this,arguments);
            }

            self.eb.publish({
                args: arguments
            },"connect");
        });
    };

    /**
     * Disconnect from the Tappy
     *
     * @param {?function} callback to call after disconnecting
     */
    Wrapper.prototype.disconnect = function(cb) {
        var self = this;
        return self.tappy.disconnect(function() {
            if(typeof cb === "function") {
                cb.apply(this,arguments);
            }

            self.eb.publish({
                args: arguments
            },"disconnect");
        });
    };

    /**
     * Passthrough to the Tappy's sendMessage function
     *
     * @param {TcmpMessage} message to send
     */
    Wrapper.prototype.sendMessage = function(msg) {
        var self = this;
        self.tappy.sendMessage(msg);
        self.eb.publish({
            message: msg
        },"sent");
    };

    /**
     * Informs the Tappy to scan for tags in its vicinity
     *
     * @param {?boolean} continuous determines if the Tappy
     * should stop after detecting a tag or continue, default false
     */
    Wrapper.prototype.detectTag = function(continuous) {
        var self = this;
        continuous = typeof continuous === "boolean" ? continuous : false;

        var msg = null;
        if(continuous) {
            msg = new NfcFamily.Commands.StreamTags(
                    0x00,
                    NfcFamily.PollingModes.GENERAL);
        } else {
            msg = new NfcFamily.Commands.ScanTag(
                    0x00,
                    NfcFamily.PollingModes.GENERAL);
        }
        
        self.sendMessage(msg);
    };

    /**
     * Informs the Tappy to scan for ndef-containing tags in its vicinity
     *
     * @param {?boolean} continuous determines if the Tappy
     * should stop after detecting a tag or continue, default false
     */
    Wrapper.prototype.detectNdef = function(continuous) {
        var self = this;
        continuous = typeof continuous === "boolean" ? continuous : false;

        var msg = null;
        if(continuous) {
            msg = new NfcFamily.Commands.StreamNdef(
                    0x00,
                    NfcFamily.PollingModes.GENERAL);
        } else {
            msg = new NfcFamily.Commands.ScanNdef(
                    0x00,
                    NfcFamily.PollingModes.GENERAL);
        }
        
        self.sendMessage(msg);
    };

    /**
     * Alias for writeUri
     */
    Wrapper.prototype.writeUrl = function() {
        var self = this;
        self.writeUri.apply(self,arguments);
    };

    /**
     * Informs the Tappy to write an NdefMessage containing
     * a single uri record to the next tag it encounters
     *
     * @param {string} uri the uri to write
     * @param {?boolean} lock true to lock the tag after writing, default false
     */
    Wrapper.prototype.writeUri = function(uri,lock) {
        var self = this;
        uri = typeof uri === "string" ? uri : "";
        lock = typeof lock === "boolean" ? lock : false;
        
        var parsed = Ndef.Utils.resolveUriToPrefix(uri);
        var msg = new NfcFamily.Commands.WriteNdefUri(0,lock,parsed.content,parsed.prefixCode);
        self.sendMessage(msg);
    };

    /**
     * Informs the Tappy to write an NdefMessage containing
     * a single text record to the next tag it encounters
     *
     * @param {string} text the text to write
     * @param {?boolean} lock true to lock the tag after writing, default false
     */
    Wrapper.prototype.writeText = function(text,lock) {
        var self = this;
        text = typeof text === "string" ? text : "";
        lock = typeof lock === "boolean" ? lock : false;

        msg = new NfcFamily.Commands.WriteNdefText(0x00,lock,text);
        self.sendMessage(msg);
    };

    /**
     * Informs the Tappy to write a custom ndef message to
     * the next tag it encounters
     *
     * @param {data} Uint8Array the binary representation of the NDEF message
     * @param {?boolean} lock true to lock the tag after writing, default false
     */
    Wrapper.prototype.writeNdef = function(data,lock) {
        var self = this;
        lock = typeof lock === "boolean" ? lock : false;

        var msg = new NfcFamily.Commands.WriteNdefCustom(0x00,lock,data);
        self.sendMessage(msg);
    };

    /**
     * Informs the Tappy to lock the next tag it encounters with
     * optional uid filtering
     *
     * @param {?Uint8Array} uid of the tag to lock if one specific tag is encountered,
     * if not specified whatever tag is next presented will be locked
     */
    Wrapper.prototype.lockTag = function(uid) {
        var self = this;
        uid = uid || null;

        var msg = new NfcFamily.Commands.LockTag(0x00,uid);
        self.sendMessage(msg);
    };

    /**
     * Informs the Tappy to stop whatever it is currently doing
     *
     * Note: In general, you should always issue this before disconnecting
     * as otherwise the Tappy will continue doing whatever you told it to
     * do last until power cycled or a fatal error occurs. While this
     * is generally innocuous, if you have issued a 'lockTag()' command, 
     * the Tappy will lock every lockable tag that enters its range.
     */
    Wrapper.prototype.stop = function() {
        var self = this;
        var msg = new NfcFamily.Commands.Stop();

        self.sendMessage(msg);
    };

    /**
     * Connect message
     *
     * Published on the 'connect' topic when the Tappy connects
     *
     * @object
     * @name ConnectMessage
     * @property {array} args Whatever arguments the Tappy and its communicator
     * passed to the connect callback
     */
    
    /**
     * Disconnect message
     *
     * Published on the 'disconnect' topic when the Tappy disconnects
     *
     * @object
     * @name DisconnectMessage
     * @property {array} args Whatever arguments the Tappy and its communicator
     * passed to the disconnect callback
     */

    /**
     * Sent message
     *
     * Published on the 'sent' topic when a message is sent to the Tappy
     *
     * @object
     * @name SentMessage
     * @property {TcmpMessage} message Raw message that was sent to the Tappy 
     */
    
    /**
     * Received message
     *
     * Published on the 'received' topic when a message is received from the Tappy
     *
     * @object
     * @name SentMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     */
    
    /**
     * Error message
     *
     * Published on the 'error_message' topic when a message indicating an error
     * is received from the Tappy
     *
     * @object
     * @name ErrorMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     */
    
    /**
     * Tag written message
     *
     * Published on the 'tag_written' topic when a TagWritten response is received
     * from the Tappy
     *
     * @object
     * @name TagWrittenMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     * @property {integer} tagTypeCode Tappy tag type identifier code
     * @property {Tappy~TagType} tagType Object describing the tag type's properties
     * @property {Uint8Array} tagCode binary representation of the tag's unique
     * identifier code
     * @property {string} tagCodeStr tagCode represented as a hexadecimal string
     */
    
    /**
     * Tag locked message
     *
     * Published on the 'tag_locked' topic when a TagLocked response is received
     * from the Tappy
     *
     * @object
     * @name TagWrittenMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     * @property {integer} tagTypeCode Tappy tag type identifier code
     * @property {Tappy~TagType} tagType Object describing the tag type's properties
     * @property {Uint8Array} tagCode binary representation of the tag's unique
     * identifier code
     * @property {string} tagCodeStr tagCode represented as a hexadecimal string
     */
    
    /**
     * Tag found message
     *
     * Published on the 'tag_found' topic when a TagFound response is received
     * from the Tappy
     *
     * @object
     * @name TagFoundMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     * @property {integer} tagTypeCode Tappy tag type identifier code
     * @property {Tappy~TagType} tagType Object describing the tag type's properties
     * @property {Uint8Array} tagCode binary representation of the tag's unique
     * identifier code
     * @property {string} tagCodeStr tagCode represented as a hexadecimal string
     */
    
    /**
     * Ndef found message
     *
     * Published on the 'ndef_found' topic when an NdefFound response is received
     * from the Tappy with a valid parsable NdefMessage
     *
     * @object
     * @name NdefFoundMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     * @property {integer} tagTypeCode Tappy tag type identifier code
     * @property {Tappy~TagType} tagType Object describing the tag type's properties
     * @property {Uint8Array} tagCode binary representation of the tag's unique
     * identifier code
     * @property {string} tagCodeStr tagCode represented as a hexadecimal string
     * @property {Uint8Array} rawNdef Raw bytes for NDEF message 
     * @property {NdefMesssage} ndef Ndef message parsed into an NdefMessage object
     */
    
    /**
     * Invalid ndef message
     *
     * Published on the 'invalid_ndef' topic when a NdefFound response is received
     * from the Tappy with an invalid unparsable NdefMessage
     *
     * @object
     * @name InvalidNdefMessage
     * @property {TcmpMessage} message Raw message that was received from the Tappy 
     * @property {TcmpMessage} resolved Resolved form of message 
     * @property {integer} tagTypeCode Tappy tag type identifier code
     * @property {Tappy~TagType} tagType Object describing the tag type's properties
     * @property {Uint8Array} tagCode binary representation of the tag's unique
     * identifier code
     * @property {string} tagCodeStr tagCode represented as a hexadecimal string
     * @property {Uint8Array} rawNdef Raw bytes for NDEF message 
     * @property {error} error Error thrown by the NDEF parser
     */
    
    /**
     * Invalid message message
     *
     * Published on the 'invalid_message' topic when a response is received
     * from the Tappy on the System or Basic NFC command families with a 
     * payload that doesn't parse
     *
     * @object
     * @name InvalidMessageMessage
     * @property {TcmpMessage} message raw message that was received from the Tappy 
     * @property {error} error exception thrown while attempting to parse message 
     */
    
    /**
     * Driver error message
     *
     * Published on the 'driver_error' topic when a response is received
     * from the Tappy on the system or basic nfc command families with a 
     * payload that doesn't parse
     *
     * @object
     * @name invalidmessagemessage
     * @property {integer} errorType Tappy errorType 
     * @property {object} data passed by Tappy error callback
     * @property {string} description human readable description of error 
     */

    /**
     * Set a listener for an event, each event
     * can only have one listener at a time
     *
     * 'connect' when the Tappy connects see: ConnectMessage
     * 'disconnect' when the Tappy disconnects see: DisconnectMessage
     * 'sent' when any message is sent to the Tappy
     * 'received' when any message is received from the Tappy
     *
     * 'error_message' when a known error message is received
     * 'tag_written' when a tag is written
     * 'tag_found' when a tag is found (not sent when ndef found)
     * 'ndef_found' when an ndef tag is found
     *
     * 'invalid_message' when a valid frame is received, but the payload format is wrong
     * 'invalid_ndef' when an ndef_found is received, but the ndef message doesn't parse
     * 'driver_error' when the Tappy driver encounters an error
     */
    Wrapper.prototype.on = function(ev,callback) {
        var self = this;
        self.eb.setSubscriber(ev,callback);
    };

    return Wrapper;
}));
