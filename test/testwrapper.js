var Wrapper = require('../src/wrapper.js');
var SysFam = require('@taptrack/tappy-systemfamily');
var NfcFam = require('@taptrack/tappy-basicnfcfamily');
var Ndef = require('@taptrack/ndef');

// TODO: add anonymizer to tcmp messages

var bytesToString = function(arr) {
    var binstr = Array.prototype.map.call(arr, function (ch) {
        return String.fromCharCode(ch);
    }).join('');

    var escstr = binstr.replace(/(.)/g, function (m, p) {
        var code = p.charCodeAt(0).toString(16).toUpperCase();
        if (code.length < 2) {
            code = '0' + code;
        }
        return '%' + code;
    });
    return decodeURIComponent(escstr);    
};

var NoOpTappy = function() {
    this.connected = false;
    this.messageListener = function(){};
    this.errorListener = function(){};
};

NoOpTappy.prototype = {
    connect: function(cb) {
        if(typeof cb === "function") {
            cb();
        }
        this.connected = true;
    },

    disconnect: function(cb) {
        if(typeof cb === "function") {
            cb();
        }
        this.connected = false;
    },

    isConnected: function() {
        return this.connected;
    },

    sendMessage: function(){},

    reply: function(msg) {
        this.messageListener({
            getCommandFamily: function() {
                return msg.getCommandFamily();
            },
            getCommandCode: function() {
                return msg.getCommandCode();
            },
            getPayload: function() {
                return msg.getPayload();
            }
        });
    },

    error: function(type,info) {
        this.errorListener(type,info);
    },

    setMessageListener: function(listener){
        this.messageListener = listener;
    },

    setErrorListener: function(listener){
        this.errorListener = listener;
    }
};

describe("Connection status and reporting should proxy to internal Tappy:",function(){
    it("Should call connect() to contained Tappy",function(){
        var calledConnect = false;
        var fakeTappy = new NoOpTappy();
        fakeTappy.connect = function() {
            calledConnect = true;
        };

        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.connect();

        expect(calledConnect).toBe(true);
    });
    
    it("Should pass connect cb to contained Tappy",function(){
        var callbackCalled = false;
        var fakeTappy = new NoOpTappy(); 
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.connect(function() {
            callbackCalled = true;   
        });

        expect(callbackCalled).toBe(true);
    });
    
    it("Should emit connect event when connecting",function(){
        var emitted = false;
        var fakeTappy = new NoOpTappy();

        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on('connect',function() {
            emitted = true;
        });
        testWrapper.connect();

        expect(emitted).toBe(true);
    });
    
    it("Should call disconnect() to contained Tappy",function(){
        var calledDisconnect = false;
        var fakeTappy = new NoOpTappy();
        fakeTappy.disconnect = function() {
            calledDisconnect = true;
        };

        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.disconnect();

        expect(calledDisconnect).toBe(true);
    });
    
    it("Should pass disconnect cb to contained Tappy",function(){
        var callbackCalled = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});

        testWrapper.disconnect(function() {
            callbackCalled = true;   
        });

        expect(callbackCalled).toBe(true);
    });
    
    it("Should emit disconnect event when disconnecting",function(){
        var emitted = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        
        testWrapper.on('disconnect',function() {
            emitted = true;
        });
        testWrapper.disconnect();

        expect(emitted).toBe(true);
    });

    it("Should pass connect status check to contained Tappy", function () {
        var connected = false;
        var fakeTappy = new NoOpTappy();
        fakeTappy.isConnected = function() {
            return connected;
        };

        var testWrapper = new Wrapper({tappy: fakeTappy});

        expect(testWrapper.isConnected()).toBe(false);
        connected = true;
        expect(testWrapper.isConnected()).toBe(true);
    });

});

describe("Test raw message sending:",function() {
    it("Should pass raw message on to the wrapped Tappy",function() {
        var messageSent = false;
        var fakeTappy = new NoOpTappy();
        fakeTappy.sendMessage = function(msg) {
            if(SysFam.Commands.Ping.isTypeOf(msg)) {
                messageSent = true;
            }
        };

        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.sendMessage(new SysFam.Commands.Ping());
        expect(messageSent).toBe(true);
    });

    it("Should emit event when message sent", function() {
        var emitted = false;
        var fakeTappy = new NoOpTappy(); 
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(SysFam.Commands.Ping.isTypeOf(data.message)) {
                emitted = true;
            }
        });
        testWrapper.sendMessage(new SysFam.Commands.Ping());
        expect(emitted).toBe(true);
    });
});

describe("Test message send convenience functions:", function() {
    var Cmds = NfcFam.Commands;

    it("Should send a 0 timeout scan tag when non-continuous detect tag is called",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        
        testWrapper.on("sent",function(data) {
            if(Cmds.ScanTag.isTypeOf(data.message)) {
                var cmd = new Cmds.ScanTag();
                cmd.parsePayload(data.message.getPayload());
                
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getPollingMode()).toEqual(NfcFam.PollingModes.GENERAL);
                valid = true;
            }
        });
        testWrapper.detectTag();

        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout stream tag when continuous detect tag is called",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        
        testWrapper.on("sent",function(data) {
            if(Cmds.StreamTags.isTypeOf(data.message)) {
                var cmd = new Cmds.StreamTags();
                cmd.parsePayload(data.message.getPayload());
                
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getPollingMode()).toEqual(NfcFam.PollingModes.GENERAL);
                valid = true;
            }
        });
        testWrapper.detectTag(true);

        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout scan ndef when non-continuous detect ndef is called",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        
        testWrapper.on("sent",function(data) {
            if(Cmds.ScanNdef.isTypeOf(data.message)) {
                var cmd = new Cmds.ScanNdef();
                cmd.parsePayload(data.message.getPayload());
                
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getPollingMode()).toEqual(NfcFam.PollingModes.GENERAL);
                valid = true;
            }
        });
        testWrapper.detectNdef(false);

        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout stream ndef when continuous detect ndef is called",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        
        testWrapper.on("sent",function(data) {
            if(Cmds.StreamNdef.isTypeOf(data.message)) {
                var cmd = new Cmds.StreamNdef();
                cmd.parsePayload(data.message.getPayload());
                
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getPollingMode()).toEqual(NfcFam.PollingModes.GENERAL);
                valid = true;
            }
        });

        testWrapper.detectNdef(true);
        
        expect(valid).toEqual(true);
    });

    it("Should send a 0 timeout write uri with appropriate prefix and no locking when write uri is called", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefUri.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefUri();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(false);
                expect(cmd.getUriCode()).toEqual(Ndef.Record.URI_PRE_HTTPS_WWW);
                expect(cmd.getUri()).toEqual("google.com");
                valid = true;
            }
        });

        testWrapper.writeUri("https://www.google.com");
        
        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout write uri with appropriate prefix and locking when write uri with locking is called", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefUri.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefUri();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(true);
                expect(cmd.getUriCode()).toEqual(Ndef.Record.URI_PRE_HTTP_WWW);
                expect(cmd.getUri()).toEqual("taptrack.com");
                valid = true;
            }
        });

        testWrapper.writeUri("http://www.taptrack.com",true);
        
        expect(valid).toEqual(true);
    });
    
    it("should send a 0 timeout write text with no locking when write text is called", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefText.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefText();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(false);
                expect(cmd.getText()).toEqual("TESTTESTTEST");
                valid = true;
            }
        });

        testWrapper.writeText("TESTTESTTEST");
        
        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout write text with locking when write text is called with locking", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefText.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefText();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(true);
                expect(cmd.getText()).toEqual("TESTTESTTEST");
                valid = true;
            }
        });

        testWrapper.writeText("TESTTESTTEST",true);
        
        expect(valid).toEqual(true);
    });
    
    it("Should send a 0 timeout write text with appropriate text when write text is called with unicode characters", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefText.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefText();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(false);
                expect(cmd.getText()).toEqual("こんにちは世界");
                valid = true;
            }
        });
        testWrapper.writeText("こんにちは世界");
        
        expect(valid).toEqual(true);
    });
    
   it("Should send a 0 timeout write custom ndef with specified content when write ndef is called", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefCustom.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefCustom();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(false);
                expect([].slice.call(cmd.getMessage())).toEqual([0x03,0x04,0x05]);
                valid = true;
            }
        });
        testWrapper.writeNdef([0x03,0x04,0x05]);
        
        expect(valid).toEqual(true);

   });
   
   it("Should send a 0 timeout write custom ndef with locking with specified content when write ndef is called with locking", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.WriteNdefCustom.isTypeOf(data.message)) {
                var cmd = new Cmds.WriteNdefCustom();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect(cmd.getLockFlag()).toEqual(true);
                expect([].slice.call(cmd.getMessage())).toEqual([0x03,0x04,0x05]);
                valid = true;
            }
        });
        testWrapper.writeNdef([0x03,0x04,0x05],true);
        
        expect(valid).toEqual(true);

   });
   
   it("Should send a 0 timeout lock tag when lock tag is called with no uid", function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.LockTag.isTypeOf(data.message)) {
                var cmd = new Cmds.LockTag();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect([].slice.call(cmd.getTagCode())).toEqual([]);
                valid = true;
            }
        });
        testWrapper.lockTag();
        
        expect(valid).toEqual(true);
   });

   it("Should send a 0 timeout lock tag with a uid restriction when a uid is specified",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.LockTag.isTypeOf(data.message)) {
                var cmd = new Cmds.LockTag();
                cmd.parsePayload(data.message.getPayload());
                expect(cmd.getTimeout()).toEqual(0x00);
                expect([].slice.call(cmd.getTagCode())).toEqual([0x03,0x04,0x05]);
                valid = true;
            }
        });
        testWrapper.lockTag([0x03,0x04,0x05],true);
        
        expect(valid).toEqual(true);
   });

   it("Should send a stop when stop is called",function() {
        var valid = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("sent",function(data) {
            if(Cmds.Stop.isTypeOf(data.message)) {
                valid = true;
            }
        });
        testWrapper.stop();
        
        expect(valid).toEqual(true);
   });

});

describe("Test error message forwarding:",function() {
    it("Should emit driver error with appropriate error codes when an error occurs",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("driver_error",function(data) {
            expect(data.errorType).toEqual(5);
            expect(data.data).toEqual("DATA");
            called = true;
        });
        
        fakeTappy.error(5,"DATA");

        expect(called).toEqual(true);
    });
    
    it("Should pass error to listener an error occurs",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.setErrorListener(function(type,data) {
            expect(type).toEqual(5);
            expect(data).toEqual("DATA");
            called = true;
        });
        
        fakeTappy.error(5,"DATA");

        expect(called).toEqual(true);
    });
});

describe("Test received message resolution:", function() {
    it("Should emit received messages on the received callback",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("received",function(data) {
            if(SysFam.Responses.Ping.isTypeOf(data.message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.Ping());

        expect(called).toEqual(true);
    });
    
    it("Should emit received messages on the message listener",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.setMessageListener(function(message) {
            if(SysFam.Responses.Ping.isTypeOf(message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.Ping());

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit TagWrittens on the tag_written channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("tag_written",function(data) {
            if(NfcFam.Responses.TagWritten.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getTagCode).toEqual("function");
                expect([].slice.call(data.tagCode)).toEqual([0x04,0x50,0x51,0x52,0x53,0x54,0x80]);
                expect(data.tagCodeStr).toEqual("04505152535480");
                
                // 4K DESFire
                expect(data.tagTypeCode).toEqual(6);
                expect(data.tagType.forumType).toEqual(4);
                expect(data.tagType.maxCapacity).toEqual(4096);

                called = true;
            }
        });
        fakeTappy.reply(new NfcFam.Responses.TagWritten(new Uint8Array([0x04,0x50,0x51,0x52,0x53,0x54,0x80]),6));

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit TagFounds on the tag_found channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("tag_found",function(data) {
            if(NfcFam.Responses.TagFound.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getTagCode).toEqual("function");
                expect([].slice.call(data.tagCode)).toEqual([0x04,0x50,0x51,0x52,0x53,0x54,0x81]);
                expect(data.tagCodeStr).toEqual("04505152535481");
                
                // NTAG 216
                expect(data.tagTypeCode).toEqual(20);
                expect(data.tagType.forumType).toEqual(2);
                expect(data.tagType.maxCapacity).toEqual(888);

                called = true;
            }
        });
        fakeTappy.reply(new NfcFam.Responses.TagFound(new Uint8Array([0x04,0x50,0x51,0x52,0x53,0x54,0x81]),20));

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit TagLockeds on the tag_locked channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("tag_locked",function(data) {
            if(NfcFam.Responses.TagLocked.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getTagCode).toEqual("function");
                expect([].slice.call(data.tagCode)).toEqual([0x04,0x50,0x51,0x52,0x53,0x54,0x81]);
                expect(data.tagCodeStr).toEqual("04505152535481");
                
                // NTAG 216
                expect(data.tagTypeCode).toEqual(20);
                expect(data.tagType.forumType).toEqual(2);
                expect(data.tagType.maxCapacity).toEqual(888);

                called = true;
            }
        });
        fakeTappy.reply(new NfcFam.Responses.TagLocked(new Uint8Array([0x04,0x50,0x51,0x52,0x53,0x54,0x81]),20));

        expect(called).toEqual(true);
    });

    //TODO: NDEF Found response
    it("Should parse and emit NdefFound on the ndef_found channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        var msg = new Ndef.Message([Ndef.Utils.createTextRecord("TEST","en")]);

        testWrapper.on("ndef_found",function(data) {
            if(NfcFam.Responses.NdefFound.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getMessage).toEqual("function");

                expect([].slice.call(data.tagCode)).toEqual([0x04,0x50,0x51,0x52,0x53,0x54,0x81]);
                expect(data.tagCodeStr).toEqual("04505152535481");
                
                // NTAG 216
                expect(data.tagTypeCode).toEqual(20);
                expect(data.tagType.forumType).toEqual(2);
                expect(data.tagType.maxCapacity).toEqual(888);

                expect([].slice.call(data.rawNdef)).toEqual([].slice.call(msg.toByteArray()));
                var records = data.ndef.getRecords();
                var record = records[0];
                var recordContents = Ndef.Utils.resolveTextRecord(record);
                expect(recordContents.language).toEqual("en");
                expect(recordContents.content).toEqual("TEST");

                called = true;
            }
        });
        fakeTappy.reply(new NfcFam.Responses.NdefFound(new Uint8Array([0x04,0x50,0x51,0x52,0x53,0x54,0x81]),20,msg.toByteArray()));

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit NdefFounds with invalid Ndef messages on the invalid_ndef channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        var msg = new Uint8Array([0x33,0x12]);

        testWrapper.on("invalid_ndef",function(data) {
            if(NfcFam.Responses.NdefFound.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getTagCode).toEqual("function");

                expect([].slice.call(data.tagCode)).toEqual([0x04,0x50,0x51,0x52,0x53,0x54,0x81]);
                expect(data.tagCodeStr).toEqual("04505152535481");
                
                // NTAG 216
                expect(data.tagTypeCode).toEqual(20);
                expect(data.tagType.forumType).toEqual(2);
                expect(data.tagType.maxCapacity).toEqual(888);

                expect([].slice.call(data.rawNdef)).toEqual([].slice.call(msg));

                called = true;
            }
        });

        fakeTappy.reply(new NfcFam.Responses.NdefFound(new Uint8Array([0x04,0x50,0x51,0x52,0x53,0x54,0x81]),20,msg));

        expect(called).toEqual(true);
    });
    
    it("Should resolve and emit LCS Mismatch on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(SysFam.Responses.LcsMismatch.isTypeOf(data.message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.LcsMismatch());

        expect(called).toEqual(true);
    });
    it("Should resolve and emit CRC Mismatch on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(SysFam.Responses.CrcMismatch.isTypeOf(data.message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.CrcMismatch());

        expect(called).toEqual(true);
    }); 

    it("Should resolve and emit improper message format on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(SysFam.Responses.ImproperMessageFormat.isTypeOf(data.message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.ImproperMessageFormat());

        expect(called).toEqual(true);
    }); 

    it("Should resolve and emit LengthMismatch on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(SysFam.Responses.LengthMismatch.isTypeOf(data.message)) {
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.LengthMismatch());

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit BasicNfc ApplicationError on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(NfcFam.Responses.ApplicationError.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getErrorMessage).toEqual("function");
                expect(data.description).toEqual("TESTMESSAGE");
                
                expect(data.resolved.getErrorCode()).toEqual(1);
                expect(data.resolved.getInternalErrorCode()).toEqual(2);
                expect(data.resolved.getReaderStatusCode()).toEqual(3);
                expect(data.resolved.getErrorMessage()).toEqual("TESTMESSAGE");
                
                called = true;
            }
        });
        fakeTappy.reply(new NfcFam.Responses.ApplicationError(1,2,3,"TESTMESSAGE"));

        expect(called).toEqual(true);
    });
    
    it("Should parse and emit System SystemError on the error_message channel",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("error_message",function(data) {
            if(SysFam.Responses.SystemError.isTypeOf(data.message)) {
                // just a very simple check to see if it was resolved
                expect(typeof data.resolved.getErrorMessage).toEqual("function");
                expect(data.description).toEqual("TESTMESSAGE");
                
                expect(data.resolved.getErrorCode()).toEqual(1);
                expect(data.resolved.getInternalErrorCode()).toEqual(2);
                expect(data.resolved.getReaderStatusCode()).toEqual(3);
                expect(data.resolved.getErrorMessage()).toEqual("TESTMESSAGE");
                
                called = true;
            }
        });
        fakeTappy.reply(new SysFam.Responses.SystemError(1,2,3,"TESTMESSAGE"));

        expect(called).toEqual(true);
    });


    it("Should emit on the invalid_message channel when a packet that claims to be a known response but has incorrect payload formatting is rec'd",function() {
        var called = false;
        var fakeTappy = new NoOpTappy();
        var testWrapper = new Wrapper({tappy: fakeTappy});
        testWrapper.on("invalid_message",function(data) {
            called = true;
        });

        var invalidMessage = new NfcFam.Responses.ApplicationError();
        invalidMessage.getPayload = function() {
            return new Uint8Array([0x02,0x03]);
        };

        fakeTappy.reply(invalidMessage);

        expect(called).toEqual(true);
    });

});
