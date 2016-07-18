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
    
    var EventBus = function() {
        this.subscribers = {};
    };

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
    
    var ResolverMux = function(resolvers) {
        this.resolvers = resolvers;
    };

    ResolverMux.prototype.checkFamily = function(cmd) {
        var self = this;
        var supported = false;
        for(var i = 0; i < self.resolvers.length; i++) {
            supported = supported || self.resolvers[i].checkFamily(cmd);
        }
        return supported;
    };

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
                        message: msg},"invalid_message");
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

    Wrapper.prototype.isConnected = function() {
        var self = this;
        return self.tappy.isConnected();
    };

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

    Wrapper.prototype.sendMessage = function(msg) {
        var self = this;
        self.tappy.sendMessage(msg);
        self.eb.publish({
            message: msg
        },"sent");
    };

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

    Wrapper.prototype.writeUrl = function() {
        var self = this;
        self.writeUri.apply(self,arguments);
    };

    Wrapper.prototype.writeUri = function(uri,lock) {
        var self = this;
        uri = typeof uri === "string" ? uri : "";
        lock = typeof lock === "boolean" ? lock : false;
        
        var parsed = Ndef.Utils.resolveUriToPrefix(uri);
        var msg = new NfcFamily.Commands.WriteNdefUri(0,lock,parsed.content,parsed.prefixCode);
        self.sendMessage(msg);
    };

    Wrapper.prototype.writeText = function(text,lock) {
        var self = this;
        text = typeof text === "string" ? text : "";
        lock = typeof lock === "boolean" ? lock : false;

        msg = new NfcFamily.Commands.WriteNdefText(0x00,lock,text);
        self.sendMessage(msg);
    };

    Wrapper.prototype.writeNdef = function(data,lock) {
        var self = this;
        lock = typeof lock === "boolean" ? lock : false;

        var msg = new NfcFamily.Commands.WriteNdefCustom(0x00,lock,data);
        self.sendMessage(msg);
    };

    Wrapper.prototype.lockTag = function(uid) {
        var self = this;
        uid = uid || null;

        var msg = new NfcFamily.Commands.LockTag(0x00,uid);
        self.sendMessage(msg);
    };

    Wrapper.prototype.stop = function() {
        var self = this;
        var msg = new NfcFamily.Commands.Stop();

        self.sendMessage(msg);
    };

    /**
     * Set a listener for an event, each event
     * can only have one listener at a time
     *
     * 'connect' when the Tappy connects
     * 'disconnect' when the Tappy disconnects
     * 'sent' when any message is sent to the tappy
     * 'received' when any message is received from the tappy
     *
     * 'error_message' when a known error message is received
     * 'tag_written' when a tag is written
     * 'tag_found' when a tag is found (not sent when ndef found)
     * 'ndef_found' when an ndef tag is found
     *
     * 'invalid_message' when a valid frame is received, but the payload format is wrong
     * 'invalid_ndef' when an ndef_found is received, but the ndef message doesn't parse
     * 'driver_error' when the tappy driver encounters an error
     */
    Wrapper.prototype.on = function(ev,callback) {
        var self = this;
        self.eb.setSubscriber(ev,callback);
    };

    return Wrapper;
}));
