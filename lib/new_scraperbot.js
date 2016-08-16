/**
 * Created by hangxu on 8/15/16.
 */
var Bot = require('slackbots');
var librato = require('librato-node');
var util = require('util');

librato.configure({email: process.env.LIBRATO_EMAIL, token: process.env.LIBRATO_TOKEN});
librato.start();

process.once('SIGINT', function() {
    librato.stop(); // stop optionally takes a callback
});

// Don't forget to specify an error handler, otherwise errors will be thrown
librato.on('error', function(err) {
    console.error(err);
});


var ScraperBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'scraperbot';

    this.user = null;
};

util.inherits(ScraperBot, Bot);

ScraperBot.prototype._onStart = function () {
    this._loadBotUser();
};

ScraperBot.prototype._onMessage = function(message){
    var siri = require('./command_recognizer')(message);

};