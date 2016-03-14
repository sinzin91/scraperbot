/**
 * TODO:
 * answer empty array '[]' with 'No Results' message
 * return all urls attached to store in CSV form
 * return old/new framework when returning attached scrapers
 * better user error handling
 */

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var mysql = require('mysql');
var queries = require('../lib/sql.js');
var pool = mysql.createPool({
    host     : process.env.SQL_HOST,
    user     : process.env.SQL_USER,
    password : process.env.SQL_PWD,
    database : process.env.DB
});

// DynamoDB access
var credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: 'us-east-1'
};

var dynasty = require('dynasty')(credentials);

/**
 * Constructor function. It accepts a settings object which should contain the following keys:
 *      token : the API token of the bot (mandatory)
 *      name : the name of the bot (will default to "scraperbot")
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
    var s = /[^scraper search\s]\w+/;
    var u = /\d+\..*/;
    var a = /f\s(.*)\si/;
    var b = /n\s(.*)/;
    console.log(message);
    console.log(message.text);

    // retrieve scrapers attached to store by ID
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForAttachedScrapers(message)
    ) {
        var store_id = message.text.match(r);
        console.log(store_id); 
        this._replyWithScraperIds(message, store_id);
    }

    // retrieve scraper ID by scraper name
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForScraperId(message)
    ) {
        var scraper_name = message.text.match(w);
        console.log(scraper_name);
        this._replyWithScraperId(message, scraper_name);
    }

    // retrieve scraper name by ID
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForScraperName(message)
    ) {
        var scraper_id = message.text.match(r);
        console.log(scraper_id); 
        this._replyWithScraperName(message, scraper_id);
    }

    // retrieve scrapers via search
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isScraperSearch(message)
    ) {
        var search_term = message.text.toString().toLowerCase().match(s);
        console.log('search term is:' + search_term); 
        this._replyWithSearchResults(message, search_term);
    }

    // retrieve store ids via scraper id
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForStoreIds(message)
    ) {
        var scraper_id = message.text.match(r);
        console.log('scraper id is:' + scraper_id); 
        this._replyWithStoreIds(message, scraper_id);
    }

    // retrieve url for ppsid.scraper_class_name
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForURL(message)
    ) {
        var hash_key = message.text.match(u);
        console.log('ppsid.scraper_class_name:' + hash_key); 
        this._replyWithURL(message, hash_key);
    }

    // retrieve pps_id from SKU
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForPPSIDfromSKU(message)
    ) {
        var SKU = message.text.match(a);
        var store_id = message.text.match(b);
        console.log(SKU); 
        console.log(store_id);
        this._replyWithPPSID(message, SKU, store_id);
    }

    // retrieve SKU from pps_id
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForSKUfromPPSID(message)
    ) {
        var ppsid = message.text.match(a);
        var store_id = message.text.match(b);
        console.log(ppsid); 
        console.log(store_id);
        this._replyWithSKU(message, ppsid, store_id);
    }

    // provide help
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForHelp(message)
    ) {
        this._welcomeMessage(message);
    }

    // error help
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._wrongHelpCommand(message)
    ) {
        this._wrongHelpMessage(message);
    }
    
};

/**
 * Replyes to a message with scraper IDs
 * @param {object} originalMessage
 * @private
 */

ScraperBot.prototype._replyWithScraperIds = function (originalMessage, store_id) {
    var self = this;
    console.log("executing: _replyWithScraperIds");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithScraperIds, store_id, function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                console.log(record);
                
                self.postMessageToChannel(channel.name, record, {as_user: true});

                connection.release();
            });
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithScraperIds, store_id, function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID!";
                    self.postMessage(originalMessage.user, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached scrapers
                console.log(record);

                self.postMessage(originalMessage.user, record, {as_user: true});

                connection.release();
            });   
        }
    });

};


ScraperBot.prototype._replyWithScraperId = function (originalMessage, name) {
    var self = this;
    console.log("executing: _replyWithScraperId");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithScraperId, name, function (err, record) {
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

                self.postMessageToChannel(channel.name, scraper_id, {as_user: true});

                connection.release();
            });        
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
                connection.query(queries._replyWithScraperId, name, function (err, record) {
                    if (err) {
                        var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid scraper name!";
                        self.postMessage(originalMessage.user, err_message, {as_user: true});
                        return console.error('DATABASE ERROR:', err);
                    }

                    // output all of the attached scrapers
                    console.log(record);
                    var scraper_id = JSON.stringify(record);
                    console.log(scraper_id);

                    self.postMessage(originalMessage.user, scraper_id, {as_user: true});

                    connection.release();
                });        
        }
    });
};


ScraperBot.prototype._replyWithScraperName = function (originalMessage, id) {
    var self = this;
    console.log("executing: _replyWithScraperName");
    console.log("message: " + JSON.stringify(originalMessage));
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithScraperName, id, function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid scraper id!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output scraper name
                console.log(record);
                var scraper_name = JSON.stringify(record);
                console.log(scraper_name);

                self.postMessageToChannel(channel.name, scraper_name, {as_user: true});

                connection.release();
            });            
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            console.log('message is: ' + JSON.stringify(originalMessage));
            connection.query(queries._replyWithScraperName, id, function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid scraper id!";
                    self.postMessage(originalMessage.user, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                console.log(record);
                var scraper_name = JSON.stringify(record);
                console.log(scraper_name);

                self.postMessage(originalMessage.user, scraper_name, {as_user: true});

                connection.release();
            });  
        }

    });
};

ScraperBot.prototype._replyWithSearchResults = function (originalMessage, search_term) {
    var self = this;
    console.log("executing: _replyWithSearchResults");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithSearchResults, '%' + search_term + '%', function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid search term!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached scrapers
                console.log(record);
                var scraper_name = JSON.stringify(record);
                console.log(scraper_name);

                self.postMessageToChannel(channel.name, record, {as_user: true});
                connection.release();
            });     
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithSearchResults, '%' + search_term + '%', function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid search term!";
                    self.postMessage(originalMessage.url, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached scrapers
                console.log(record);

                self.postMessage(originalMessage.user, record, {as_user: true});
                connection.release();
            });
        }
    });
};

ScraperBot.prototype._replyWithStoreIds = function (originalMessage, store_id) {
    var self = this;
    console.log("executing: _replyWithStoreIds");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithStoreIds, store_id, function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid search term!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);
                var scraper_name = JSON.stringify(record);
                console.log(scraper_name);

                self.postMessageToChannel(channel.name, record, {as_user: true});
                connection.release();
            });     
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithStoreIds, store_id, function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid search term!";
                    self.postMessage(originalMessage.user, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);

                self.postMessage(originalMessage.user, record, {as_user: true});
                connection.release();
            });
        }
    });
};

ScraperBot.prototype._replyWithPPSID = function (originalMessage, sku, store_id) {
    var self = this;
    console.log("executing: _replyWithPPSID");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithPPSID + sku[1] + "', " + store_id[1] + ")", function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid SKU or store ID!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);
                var ppsid = JSON.stringify(record);
                console.log(ppsid);

                self.postMessageToChannel(channel.name, record, {as_user: true});
                connection.release();
            });    
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithPPSID + sku[1] + "', " + store_id[1] + ")", function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid SKU or store ID!";
                    self.postMessage(originalMessage.user, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);

                self.postMessage(originalMessage.user, record, {as_user: true});
                connection.release();
            });
        }
    });
};

ScraperBot.prototype._replyWithSKU = function (originalMessage, ppsid, store_id) {
    var self = this;
    console.log("executing: _replyWithSKU");
    pool.getConnection(function(err, connection) {
        if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithSKU + ppsid[1] + "', " + store_id[1] + ")", function (err, record) {
                var channel = self._getChannelById(originalMessage.channel);
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid ppsid or store ID!";
                    self.postMessageToChannel(channel.name, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);
                var ppsid = JSON.stringify(record);
                console.log(ppsid);

                self.postMessageToChannel(channel.name, record, {as_user: true});
                connection.release();
            });    
        }
        else if (self._isDirectConversation(originalMessage) &&
                !self._isFromScraperBot(originalMessage)) {
            connection.query(queries._replyWithSKU + ppsid[1] + "', " + store_id[1] + ")", function (err, record) {
                if (err) {
                    var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid ppsid or store ID!";
                    self.postMessage(originalMessage.user, err_message, {as_user: true});
                    return console.error('DATABASE ERROR:', err);
                }

                // output all of the attached stores
                console.log(record);

                self.postMessage(originalMessage.user, record, {as_user: true});
                connection.release();
            });
        }
    });
};

ScraperBot.prototype._replyWithURL = function (originalMessage, hash_key) {
    var self = this;
    console.log("executing: _replyWithURL");
    if (self._isChannelConversation(originalMessage) &&
    !self._isFromScraperBot(originalMessage)) {
        var channel = self._getChannelById(originalMessage.channel);
        var urls = dynasty.table('scraper_exact_urls');

        console.log('hash key: ' + hash_key);
        console.log('hash key type: ' + hash_key.typeof);
        key = hash_key.toString();

        var promise = urls.find(key, function(err, result) {
            console.log(result);
        });
        promise.then(function(urls) {
            console.log(urls.updated_url);
            console.log(urls.sku);
            self.postMessageToChannel(channel.name, "URL: " + urls.updated_url, {as_user: true});
            self.postMessageToChannel(channel.name, "SKU: " + urls.sku, {as_user: true});
        }).catch(function(err) {
            var err_message = ":robot_face: Beep Boop. That key is invalid, or there is no URL. Either way, you're SOL!";
            self.postMessageToChannel(channel.name, err_message, {as_user: true});
            return console.error("DATABASE ERROR:", err);
        });     
    }
    else if (self._isDirectConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
        var urls = dynasty.table('scraper_exact_urls');

        console.log('hash key: ' + hash_key);
        console.log('hash key type: ' + hash_key.typeof);
        key = hash_key.toString();

        var promise = urls.find(key, function(err, result) {
            console.log(result);
        });

        promise.then(function(urls) {
            console.log(urls.updated_url);
            console.log(urls.sku);
            self.postMessage(originalMessage.user, "URL: " + urls.updated_url, {as_user: true});
            self.postMessage(originalMessage.user, "SKU: " + urls.sku, {as_user: true});            
        }).catch(function(err) {
            var err_message = ":robot_face: Beep Boop. That key is invalid, or there is no URL. Either way, you're SOL!";
            self.postMessage(originalMessage.user, err_message, {as_user: true});
            return console.error("DATABASE ERROR:", err);
        }); 
    };
};


ScraperBot.prototype._wrongHelpMessage = function (originalMessage, hash_key) {
    var self = this;
    console.log("executing: _wrongHelpMessage");
    if (self._isChannelConversation(originalMessage) &&
    !self._isFromScraperBot(originalMessage)) {
            var channel = self._getChannelById(originalMessage.channel);
            var err_message = ":robot_face: Want help?  The proper command is \"*scraperbot help*\" now.  Saving keystrokes...";
            self.postMessageToChannel(channel.name, err_message, {as_user: true});
            return console.error("DATABASE ERROR:", err);
    }
    else if (self._isDirectConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
            var err_message = ":robot_face: Want help?  The proper command is \"*scraperbot help*\" now.  Saving keystrokes...";
            self.postMessage(originalMessage.user, err_message, {as_user: true});
    };
};


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
    if (this._isChannelConversation(originalMessage) &&
        !this._isFromScraperBot(originalMessage)) {
        var channel = this._getChannelById(originalMessage.channel);
        this.postMessageToChannel(channel.name, help_message, {as_user: true});    
    }
    else if (this._isDirectConversation(originalMessage) &&
            !this._isFromScraperBot(originalMessage)) {
        this.postMessage(originalMessage.user, help_message, {as_user: true}); 
    }
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
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isDirectConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'D';
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
    return message.text.toLowerCase().indexOf('pps of') > -1;
};

/**
 * Util function to check if user is asking for ppsid from sku
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForSKUfromPPSID = function (message) {
    return message.text.toLowerCase().indexOf('sku of') > -1;
};

/**
 * Util function to check if user is asking for ppsid from sku
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isScraperSearch = function (message) {
    return message.text.toLowerCase().indexOf('scraper search') > -1;
};

/**
 * Util function to check if user is asking for stores attached to a scraper
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForStoreIds = function (message) {
    return message.text.toLowerCase().indexOf('attached stores') > -1;
};

/**
 * Util function to check if user is asking for url from ppsid.scraper_class_name
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForURL = function (message) {
    return message.text.toLowerCase().indexOf('url of ') > -1;
};

/**
 * Util function to check if user is asking for help
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForHelp = function (message) {
    return message.text.toLowerCase().indexOf('scraperbot help') > -1;
};

/**
 * Util function to check if user is asking for help
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._wrongHelpCommand = function (message) {
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

// Data models
var help_message = 'Hi Wiseguy, I\'m here to help find scrapers! ' +
            '\n' +        
            '\n*Commands:* ' +
            '\n"*attached scrapers STORE_ID*":    see what scrapers are attached to a store ID. ' +
            '\n"*attached stores SCRAPER_ID*":    find stores attached to a scraper by scraper ID. ' +            
            '\n"*scraper name of SCRAPER_ID*":    find a scraper\'s name from scraper ID. ' +
            '\n"*scraper id of SCRAPER_NAME*":    find a scraper\'s ID from it\'s name.  ' +
            '\n"*scraper search SEARCH_TERM*":    if you don\'t remember the scraper\'s exact name. ' +
            '\n"*url of PPSID.SCRAPER_CLASS_NAME*":    find url from ppsid.scraper_class_name key in DynamoDB. ' + 
            '\n"*scraperbot help*":       if you forgot what I just told you :robot_face:.' +
            '\n"​*pps of SKU in STORE_ID*​":    find the PPSID of a SKU in a given store. ' +
            '\n"​*sku of PPSID in STORE_ID*​":    find the SKU of a PPSID in a given store.' +
            '\nPlease ask Tenzin if you have any SQL queries you want me to handle'; 

module.exports = ScraperBot;