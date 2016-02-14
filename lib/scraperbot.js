

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var mysql = require('mysql');
var pool = mysql.createPool({
    host     : process.env.SQL_HOST,
    user     : process.env.SQL_USER,
    password : process.env.SQL_PWD,
    database : process.env.DB
});

/**
 * Constructor function. It accepts a settings object which should contain the following keys:
 *      token : the API token of the bot (mandatory)
 *      name : the name of the bot (will default to "scraperbot")
 *      dbPath : the path to access the database (will default to "data/scraperbot.db")
 *
 * @param {object} settings
 * @constructor
 *
 * @author Tenzin <sinzin91@gmail.com>
 */
var ScraperBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'scraperbot';

    this.user = null;
};

// inherits methods and properties from the Bot constructor
util.inherits(ScraperBot, Bot);

/**
 * Run the bot
 * @public
 */
ScraperBot.prototype.run = function () {
    ScraperBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

/**
 * On Start callback, called when the bot connects to the Slack server and access the channel
 * @private
 */
ScraperBot.prototype._onStart = function () {
    this._loadBotUser();
};

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 * @param {object} message
 * @private
 */
ScraperBot.prototype._onMessage = function (message) {
    var r = /\d+/;
    var w = /\w+\.\w+/;
    console.log(message);
    console.log(message.text);

    // retrieve scrapers attached to store by ID
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForAttachedScrapers(message)
    ) {
        var store_id = message.text.match(r);
        console.log(store_id); 
        this._replyWithScraperIds(message, store_id);
    }

    // retrieve scraper ID by scraper name
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForScraperId(message)
    ) {
        var scraper_name = message.text.match(w);
        console.log(scraper_name);
        this._replyWithScraperId(message, scraper_name);
    }

    // retrieve scraper name by ID
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForScraperName(message)
    ) {
        var scraper_id = message.text.match(r);
        console.log(scraper_id); 
        this._replyWithScraperName(message, scraper_id);
    }

    // provide instructions
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForInstructions(message)
    ) {
        this._welcomeMessage(message);
    }

    /* retrieve pps_id from SKU
    if (this._isChatMessage(message) &&
        this._isChannelConversation(message) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForPPSIDfromSKU(message)
    ) {
        var SKU = message.text.match(r);
        console.log(SKU); 
        this._replyWithSKU(message, SKU);
    }
    */
};

/**
 * Replyes to a message with a random Joke
 * @param {object} originalMessage
 * @private
 */

ScraperBot.prototype._replyWithScraperIds = function (originalMessage, store_id) {
    var self = this;
    pool.getConnection(function(err, connection) {

        connection.query('SELECT external_crawl_settings.crawl_store_id, external_crawl_sites.name FROM external_crawl_settings INNER JOIN external_crawl_sites ON external_crawl_settings.crawl_store_id=external_crawl_sites.id WHERE store_id = ?', store_id, function (err, record) {
            var channel = self._getChannelById(originalMessage.channel);
            if (err) {
                var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID!";
                self.postMessageToChannel(channel.name, err_message, {as_user: true});
                return console.error('DATABASE ERROR:', err);
            }

            // output all of the attached scrapers
            console.log(record);
            //var scrapers = JSON.stringify(record, null, 4);
            //console.log(scrapers);

            
            self.postMessageToChannel(channel.name, record, {as_user: true});

            connection.release();
        });

    });

};


ScraperBot.prototype._replyWithScraperId = function (originalMessage, name) {
    var self = this;
    pool.getConnection(function(err, connection) {

        connection.query('SELECT id FROM external_crawl_sites WHERE name = ?', name, function (err, record) {
            var channel = self._getChannelById(originalMessage.channel);
            if (err) {
                var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid scraper name!";
                self.postMessageToChannel(channel.name, err_message, {as_user: true});
                return console.error('DATABASE ERROR:', err);
            }

            // output all of the attached scrapers
            console.log(record);
            var scraper_id = JSON.stringify(record);
            console.log(scraper_id);


            var channel = self._getChannelById(originalMessage.channel);
            self.postMessageToChannel(channel.name, scraper_id, {as_user: true});
            connection.release();
        });     
    });
};

ScraperBot.prototype._replyWithScraperName = function (originalMessage, id) {
    var self = this;
    pool.getConnection(function(err, connection) {
        connection.query('SELECT name FROM external_crawl_sites WHERE id = ?', id, function (err, record) {
            var channel = self._getChannelById(originalMessage.channel);
            if (err) {
                var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid scraper id!";
                self.postMessageToChannel(channel.name, err_message, {as_user: true});
                return console.error('DATABASE ERROR:', err);
            }

            // output all of the attached scrapers
            console.log(record);
            var scraper_name = JSON.stringify(record);
            console.log(scraper_name);

            self.postMessageToChannel(channel.name, scraper_name, {as_user: true});
            connection.release();
        });
    });
};

/*
ScraperBot.prototype._replyWithSKU = function (originalMessage, id) {
    var self = this;
    pool.getConnection(function(err, connection) {
        connection.query('select * from products_per_store as pps where pps.sku in (\'CCS12-S8-C\') and store_id = 1173134503', id, function (err, record) {
            if (err) {
                return console.error('DATABASE ERROR:', err);
            }

            // output all of the attached scrapers
            console.log(record.id);
            var SKU = JSON.stringify(record);
            console.log(SKU.id);


            var channel = self._getChannelById(originalMessage.channel);
            self.postMessageToChannel(channel.name, SKU, {as_user: true});
            connection.release();
        });
    });
};
*/

/**
 * Loads the user object representing the bot
 * @private
 */
ScraperBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

/**
 * Sends a welcome message in the channel
 * @private
 */
ScraperBot.prototype._welcomeMessage = function (originalMessage) {
    var channel = this._getChannelById(originalMessage.channel);
    this.postMessageToChannel(channel.name, 'Hi guys, I\'m here to help find scrapers! ' +
        '\n' +        
        '\nCommands: ' +
        '\n"attached scrapers STORE_ID":    see what scrapers are attached to a store ID. ' +
        '\n"scraper name of SCRAPER_ID":    find a scraper\'s name from scraper ID. ' +
        '\n"scraper id of SCRAPER_NAME":    find a scraper\'s ID from it\'s name.  ' +
        '\n"scraperbot instructions":       if you forgot what I just told you :robot_face:.',
        {as_user: true});
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'C';
};

/**
 * Util function to check if user is asking for scrapers attached to store_id
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForAttachedScrapers = function (message) {
    return message.text.toLowerCase().indexOf('attached scrapers') > -1;
};

/**
 * Util function to check if user is asking for ID from scraper name
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForScraperId = function (message) {
    return message.text.toLowerCase().indexOf('id of') > -1;
};

/**
 * Util function to check if user is asking for scraper name from ID
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForScraperName = function (message) {
    return message.text.toLowerCase().indexOf('scraper name of') > -1;
};

/**
 * Util function to check if user is asking for ppsid from sku
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForPPSIDfromSKU = function (message) {
    return message.text.toLowerCase().indexOf('ppsid of') > -1;
};

/**
 * Util function to check if user is asking for instructions
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForInstructions = function (message) {
    return message.text.toLowerCase().indexOf('scraperbot instructions') > -1;
};

/**
 * Util function to check if a given real time message has been sent by the scraperbot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isFromScraperBot = function (message) {
    return message.user === this.user.id;
};

/**
 * Util function to get the name of a channel given its id
 * @param {string} channelId
 * @returns {Object}
 * @private
 */
ScraperBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};

module.exports = ScraperBot;