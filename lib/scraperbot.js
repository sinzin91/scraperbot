/**
 * TODO:
 * answer empty array '[]' with 'No Results' message
 * return all urls attached to store in CSV form
 * return old/new framework when returning attached scrapers
 * better user error handling
 * console output user name
 * error message when pulling back urls for legacy scrapers
 * set timeouts when command takes too long
 */

var util = require('util');
var path = require('path');
var fs = require('fs');
var Bot = require('slackbots');
var mysql = require('mysql');
var csv = require('csv-write-stream');
var queries = require('../lib/sql.js');
var parseJson = require('../lib/parseJson.js');
var prettyPrint = require('../lib/prettyPrint.js');
var moment = require('moment');
var librato = require('librato-node');
var promise = require('bluebird'); // or any other Promise/A+ compatible library;
var options = {
    promiseLib: promise // overriding the default (ES6 Promise);
};
var pgp = require('pg-promise')(options);
var json2csv = require('json2csv');
var request = require('request');
// var copyFrom = require('pg-copy-streams').from;

var topologyAPI = require('./topology_api_requests');

// fire up Librato metrics
librato.configure({email: process.env.LIBRATO_EMAIL, token: process.env.LIBRATO_TOKEN});
librato.start();

process.once('SIGINT', function() {
  librato.stop(); // stop optionally takes a callback
});

// Don't forget to specify an error handler, otherwise errors will be thrown
librato.on('error', function(err) {
  console.error(err);
});


// mySQL access
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

// postgres connection settings
var cn = {
    host: process.env.POSTGRES_HOST, // 'localhost' is the default;
    port: process.env.POSTGRES_PORT, // 5432 is the default;
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PWD
};

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
    var r = /\d+/; // matching a digit char
    var w = /\w+\.\w+/; //matching a string that has a dot in the middle
    var s = /[^scraper search\s]\w+/; // matching any string that is not 'scraper search '
    var u = /\d+\..*/; // matching a digit that start with digit, then followed by a dot, then anything
    var a = /f\s(.*)\si/; //start with 'f ', ends with ' i'
    var b = /n\s(.*)/; // start with 'n ', then anything
    var c = /of\s(\S+)/; // start with 'of ', then any string that is not an whitespace
    var d = /in\s(\d+)/; // start with 'in ', followed by digital string
    var e = /for\s(\S+)/; // start with 'for ', then any string that is not an whitespace
    var f = /details\s(\S+)/; // start with 'details ', then any string that is not an whitespace
    console.log(message);
    console.log(message.text);
    console.log('Moment: ' + moment().format());

    // retrieve scrapers attached to store by ID
    if (this._isChatMessage(message) && (this._isDirectConversation(message) || this._isChannelConversation(message)) && !this._isFromScraperBot(message) && this._isAskingForAttachedScrapers(message)) {
        var store_id = message.text.match(r);
        console.log(store_id); 
        console.log('Moment: ' + moment().format());
        librato.increment('ScraperBot._replyWithScraperIds', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithScraperId', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithScraperName', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithSearchResults', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithStoreIds', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithURL', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithPPSID', {source: 'wiser-ec2'});
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
        librato.increment('ScraperBot._replyWithScraperIds', {source: 'wiser-ec2'});
        this._replyWithSKU(message, ppsid, store_id);
    }


    // pull all URLs for scraper_class_name
    // urls of petco.com_pet360 in 1398361 
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingtoPullAllURLs(message)
    ) {
        var hash_key = message.text.match(c);
        if (hash_key[1].indexOf('<') == 0) // handle case where hash_key is a url
            hash_key = hash_key[1].match(/\|(\S+)\>/);

        var store_id = message.text.match(d);

        librato.increment('ScraperBot._pullAllURLs', {source: 'wiser-ec2'});

        if (this._isChannelConversation(message) &&
            !this._isFromScraperBot(message)) {
            var channel = this._getChannelById(message.channel);
            
            this.postMessageToChannel(channel.name, "Pulling PPSIDs of " + hash_key[1] + " in store " + store_id[1] + "!", {as_user: true});
        } else if (this._isDirectConversation(message) &&
            !this._isFromScraperBot(message)) {
            
            this.postMessage(message.user, "Pulling PPSIDs of " + hash_key[1] + " in store " + store_id[1] + "!", {as_user: true});
        }
        this._pullPPSIDs(message, store_id, hash_key, function(list) {
            console.log('made it here');          
            _batchPull(list, store_id, hash_key, function(rows) {
                if (rows[0] == null && (this._isChannelConversation(message) &&
                    !this._isFromScraperBot(message))) {
                    console.log("ROWS EMPTY");
                    var channel = this._getChannelById(message.channel);
                    this.postMessageToChannel(channel.name, "Sorry brah, either there are no URLs uploaded, or you typed something in wrong. :disappointed:", {as_user: true});
                } else if (rows[0] == null && (this._isDirectConversation(message) &&
                            !this._isFromScraperBot(message))) {
                    console.log("ROWS EMPTY");
                    this.postMessage(message.user, "Sorry brah, either there are no URLs uploaded, or you typed something in wrong. :disappointed:", {as_user: true});
                } else {
                    _writeToCSV(message, rows, store_id, hash_key, function(file) {
                        console.log('bingo, in callback now!');
                        if (this._isChannelConversation(message) &&
                            !this._isFromScraperBot(message)) {
                            var channel = this._getChannelById(message.channel);
                            this.postMessageToChannel(channel.name, "Boom!  Here's the CSV with all URLs in DynamoDB: http://54.193.12.26:8000/csvs/" + file, {as_user: true});
                        } else if (this._isDirectConversation(message) &&
                            !this._isFromScraperBot(message)) {
                            this.postMessage(message.user, "Boom!  Here's the CSV with all URLs in DynamoDB: http://54.193.12.26:8000/csvs/" + file, {as_user: true});
                        }
                        console.log("message posted");
                    }.bind(this));                   
                }
            }.bind(this));
        }.bind(this));
    }

    // retrieve SKU from pps_id
    // urls with matches for petco.com_canidae in 1170766041
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForURLsWithMatches(message)
    ) {
        var hash_key = message.text.match(e); // petco.com_canidae
        if (hash_key[1].indexOf('<') == 0) // handle case where hash_key is url
            hash_key = hash_key[1].match(/\|(\S+)\>/);
            
        var store_id = message.text.match(d); // 1170766041

        // send metrics to librato
        librato.increment('ScraperBot._pullAllURLsWithMatches', {source: 'wiser-ec2'});
        
        // let user know that process has started
        if (this._isChannelConversation(message) &&
            !this._isFromScraperBot(message)) {
            var channel = this._getChannelById(message.channel);
            this.postMessageToChannel(channel.name, "Analyzing urls of " + hash_key[1] + " uploaded to " + store_id[1] + "...\n" +
                                                    "This takes an average of 25 seconds, care for a coffee? :coffee:", {as_user: true});
        } else if (this._isDirectConversation(message) &&
            !this._isFromScraperBot(message)) {
            this.postMessage(message.user, "Analyzing urls of " + hash_key[1] + " uploaded to " + store_id[1] + "...\n" +
                                           "This takes an average of 25 seconds, care for a coffee? :coffee:", {as_user: true});
        }

        // Begin pulling urls
        // pull all PPSIDs
        this._pullPPSIDs(message, store_id, hash_key, function(list) {
            console.log('made it here');
            // use PPSIDs to pull batches from DynamoDB          
            _batchPull(list, store_id, hash_key, function(rows) {
                console.log(rows);
                var newRows = [];
                for(var i = 0; i < rows.length; i++) {
                    newRows = newRows.concat(rows[i][1]);
                }
                console.log(newRows);
                var ppsids = newRows;
                debugger
                // generate Postgres query
                var q = "SELECT prod.sku, prod.ppsid, p.store_name, p.price, p.last_update, p.source, p.url " + 
                    "FROM products AS prod " +
                    "JOIN stores AS client_store on client_store.id = prod.store_id " +
                    "LEFT OUTER JOIN pricing AS p ON p.ppsid = prod.ppsid AND p.approved = 1 AND p.source = 8" +
                    "AND GETDATE()-p.last_update <= INTERVAL '7 days' AND p.store_name <> client_store.store_name AND p.url LIKE $2" +
                    "WHERE prod.store_id = $1 " +
                    "AND prod.ppsid IN (" + ppsids.join(',') + ") ORDER BY prod.sku;"
                var compDomain = "%" + hash_key[1].match(/[^\.]*/)[0].toString() + "%";
                debugger
                var db = pgp(cn); // database instance;
                var store_id_int = parseInt(store_id[1]);

                // execute postgres query, passing in store_id and competitor domain as parameters
                db.query(q, [store_id_int, compDomain])
                    .then(function (data) {
                        console.log("DATA:", JSON.stringify(data)); // print data;
                        debugger

                        // convert json to csv
                        json2csv({ data: data }, function(err, csv) {
                            if (err) console.log(err);
                            console.log(csv);

                            // generate file name with time stamp
                            var now = moment().format("hh.mm.ss_MM.DD.YY");
                            var file = hash_key[1] + '_' + store_id[1] + '_diff_' + now + '.csv';
                            
                            // write file to direction
                            fs.writeFile(file, csv, function(err) {
                                if (err) throw err;
                                console.log('file saved');
                                
                                if (this._isChannelConversation(message) &&
                                    !this._isFromScraperBot(message)) {
                                    var channel = this._getChannelById(message.channel);
                                    this.postMessageToChannel(channel.name, "Boom!  Here's the CSV with all URLs that have a match in the Wiseboard: http://54.193.12.26:8000/csvs/" + file, {as_user: true});
                                } else if (this._isDirectConversation(message) &&
                                    !this._isFromScraperBot(message)) {
                                    this.postMessage(message.user, "Boom!  Here's a CSV with URLs that have a match in the Wiseboard: http://54.193.12.26:8000/csvs/" + file, {as_user: true});
                                }
                            }.bind(this));
                            console.log('finished writing');
                            
                            fs.rename('./' + file, './csvs/' + file);
                        }.bind(this));
                        
                    }.bind(this))
                    .catch(function (error) {
                        console.log("ERROR:", error); // print the error;
                        if (this._isChannelConversation(message) &&
                            !this._isFromScraperBot(message)) {
                            var channel = this._getChannelById(message.channel);
                            this.postMessageToChannel(channel.name, "Sorry dawg, either you typed something in wrong or the uploaded URLs haven't returned any matches yet. :disappointed:", {as_user: true});
                        } else if (this._isDirectConversation(message) &&
                            !this._isFromScraperBot(message)) {
                            this.postMessage(message.user, "Sorry dawg, either you typed something in wrong or the uploaded URLs haven't returned any matches yet. :disappointed:", {as_user: true});
                        }
                    }.bind(this))
                    .finally(function () {
                        pgp.end(); // for immediate app exit, closing the connection pool.
                    });
            }.bind(this));
        }.bind(this));
    }

    // scraper details
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForScraperDetails(message)
    ) {
        librato.increment('ScraperBot._scraperDetails', {source: 'wiser-ec2'});
        var hash_key = message.text.match(f); // petco.com_canidae
        if (hash_key[1].indexOf('<') == 0) // handle case where hash_key is url
            hash_key = hash_key[1].match(/\|(\S+)\>/);
        this._replyWithScraperDetails(message, hash_key);
    }

    // sku details
    // sku 5291-90016 in 3112
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForSKUDetails(message)
    ) {
        librato.increment('ScraperBot._skuDetails', {source: 'wiser-ec2'});
        var sku = message.text.match(/details\s(.*)\sin/); // 5291-90016
        var store_id = message.text.match(d); // 3112
        this._replyWithSKUDetails(message, sku, store_id);
    }

    // attach scrapers
    // attach wag.com_petsmart to 1195131420
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingToAttachScraper(message)
    ) {
        var hash_key = message.text.match(/attach\s(\S+)/); // wag.com_petsmart
        var store_id = message.text.match(r); // 1195131420
        this._replyWithAttachScraper(message, hash_key, store_id);
    }

    // detach scrapers
    // detach wag.com_petsmart to 1195131420
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingToDetachScraper(message)
    ) {
        var hash_key = message.text.match(/detach\s(\S+)/); // wag.com_petsmart
        var store_id = message.text.match(r); // 1195131420
        this._replyWithDetachScraper(message, hash_key, store_id);
    }

    // provide help
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isAskingForHelp(message)
    ) {
        this._helpMessage(message);
        librato.increment('ScraperBot._helpMessage', {source: 'wiser-ec2'});
    }

    // no results message
    if (this._isChatMessage(message) &&
        (this._isDirectConversation(message) ||
        this._isChannelConversation(message)) &&
        !this._isFromScraperBot(message) &&
        this._isNoResults(message)
    ) {
        this._noResultsMessage(message);
        librato.increment('ScraperBot._noResultsMessage', {source: 'wiser-ec2'});
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
 * Replyes to a message CSV link to urls attached
 * @param {object} originalMessage
 * @private
 */

ScraperBot.prototype._pullPPSIDs = function(originalMessage, store_id, scraper_class_name, callback) {
    console.log("executing: _pullAllURLs");
    
    pool.getConnection(function(err, connection) {
        connection.query('SELECT pps.id FROM products_per_store AS pps WHERE pps.store_id = ?', store_id[1], function (err, records) {
            if (err) {
                var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID!";
                return console.error('DATABASE ERROR:', err);
            }
            console.log(records);
            var list = [];
            records.forEach(function(record){
                list.push(record.id + '.Scraper_' + scraper_class_name[1].replace(/\./g,''));
            });
            callback(list)

            return records;
            connection.release();
        });
    });
};

function _batchPull(list, store_id, hash_key, callback) {
    console.log('List: ' + list.length);
    console.log('in _batchPull now');
    var dynasty = require('dynasty')(credentials);
    var urls = dynasty.table('scraper_exact_urls');
    
    var i, j, chunk = 100, rows = [], promises = [];

    for (i=0,j=list.length; i<j; i+=chunk) {
        promises.push(urls.batchFind(list.slice(i,i+chunk)));
    };
    debugger
    Promise.all(promises).then(function(results) {
        results = [].concat.apply([], results);
        rows = results.map(function(result) {
            var row = [];
            row.push(result.sku, result.pps_id, result.updated_url);
            return row;
        });
        
        callback(rows);
    });
};

function _writeToCSV(originalMessage, rows, store_id, hash_key, callback) {
    console.log('made it to writeToCSV');
    console.log('Rows: ' + rows);
    console.log('WRITING TO CSV!!!!');
    var writer = csv({ headers: ["sku", "pps_id", "url"]});
    console.log('Moment: ' + moment().format());
    var now = moment().format("hh.mm.ss_MM.DD.YY");
    var file = hash_key[1] + '_' + store_id[1] + '_' + now + '.csv';
    writer.pipe(fs.createWriteStream(file));
    console.log(rows);
    rows.forEach(function(row) {
        console.log('Row: ' + row);
        writer.write(row);
    })
    writer.end();
    console.log('finished writing');
    fs.rename('./' + file, './csvs/' + file);
    callback(file);
}

/**
 * Replys with scraper details
 * @param {object} originalMessage
 * @private
 */

ScraperBot.prototype._replyWithScraperDetails = function (originalMessage, hash_key) {
    var self = this;
    console.log("executing: _replyWithScraperDetails");
    if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
        var parsedJson = parseJson(hash_key);
        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, parsedJson, {as_user: true});
    } else if (self._isDirectConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
        debugger
        var parsedJson = parseJson(hash_key);
        self.postMessage(originalMessage.user, parsedJson, {as_user: true});
    }
};

/**
 * Replys with attach scraper request
 * @param {object} originalMessage
 * @private
 */
ScraperBot.prototype._replyWithAttachScraper = function (originalMessage, hash_key, store_id) {
    var self = this;
    console.log("executing: _replyWithAttachScraper");
    if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
        var topologyAPIResponse = request(topologyAPI.attachTopologyRequest(hash_key, store_id),
        function (error, response, body) {
          debugger
          if (error) {
            return console.error('attach scraper failed: ', error);
          }
          console.log('attach scraper successful: ', body);
        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, prettyPrint(body), {as_user: true});
        });
    } else if (self._isDirectConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
      debugger
        var topologyAPIResponse = request(topologyAPI.attachTopologyRequest(hash_key, store_id),
        function (error, response, body) {
          if (error) {
            return console.error('attach scraper failed: ', error);
          }
          debugger
          self.postMessage(originalMessage.user, prettyPrint(body), {as_user: true});
        });
        debugger
        
    }
};

/**
 * Replys with detach scraper request
 * @param {object} originalMessage
 * @private
 */
ScraperBot.prototype._replyWithDetachScraper = function (originalMessage, hash_key, store_id) {
    var self = this;
    console.log("executing: _replyWithDetachScraper");
    if (self._isChannelConversation(originalMessage) &&
        !self._isFromScraperBot(originalMessage)) {
        var topologyAPIResponse = request(topologyAPI.detachTopologyRequest(hash_key, store_id),
        function (error, response, body) {
          debugger
          if (error) {
            return console.error('detach scraper failed: ', error);
          }
          console.log('detach scraper successful: ', body);
        var channel = self._getChannelById(originalMessage.channel);
        self.postMessageToChannel(channel.name, prettyPrint(body), {as_user: true});
        });
    } else if (self._isDirectConversation(originalMessage) &&
            !self._isFromScraperBot(originalMessage)) {
      debugger
        var topologyAPIResponse = request(topologyAPI.detachTopologyRequest(hash_key, store_id),
        function (error, response, body) {
          if (error) {
            return console.error('detach scraper failed: ', error);
          }
          self.postMessage(originalMessage.user, prettyPrint(body), {as_user: true});
        });
        debugger
        
    }
};

/**
 * Replyes to a message with scraper IDs
 * @param {object} originalMessage
 * @private
 */
// disabled because scraper stash
// ScraperBot.prototype._replyWithSKUDetails = function (originalMessage, sku, store_id) {
//     var self = this;
//     console.log("executing: _replyWithSKUDetails");
//     pool.getConnection(function(err, connection) {
//         if (self._isChannelConversation(originalMessage) &&
//             !self._isFromScraperBot(originalMessage)) {
//             debugger
//             connection.query(queries._replyWithSKUDetails + store_id[1] + ", '" + sku[1] + "') group  by date, sku", function (err, record) {
//                 var channel = self._getChannelById(originalMessage.channel);
//                 if (err) {
//                     var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID or SKU!";
//                     self.postMessageToChannel(channel.name, err_message, {as_user: true});
//                     return console.error('DATABASE ERROR:', err);
//                 }

//                 console.log("Record sku: " + record.sku);
//                 self.postMessageToChannel(channel.name, prettyPrint(record), {as_user: true});

//                 connection.release();
//             });
//         }
//         else if (self._isDirectConversation(originalMessage) &&
//                 !self._isFromScraperBot(originalMessage)) {
//             connection.query(queries._replyWithSKUDetails + store_id[1] + ", '" + sku[1] + "')", function (err, record) {
//                 if (err) {
//                     var err_message = ":robot_face: Beep Boop. Does not compute. Please enter a valid store ID or SKU!";
//                     self.postMessage(originalMessage.user, err_message, {as_user: true});
//                     return console.error('DATABASE ERROR:', err);
//                 }
//                 self.postMessage(originalMessage.user, prettyPrint(record), {as_user: true});

//                 connection.release();
//             });   
//         }
//     });
// };

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

                self.postMessageToChannel(channel.name, prettyPrint(scraper_id), {as_user: true});

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

                    self.postMessage(originalMessage.user, prettyPrint(scraper_id), {as_user: true});

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

                self.postMessageToChannel(channel.name, prettyPrint(scraper_name), {as_user: true});

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

                self.postMessage(originalMessage.user, prettyPrint(scraper_name), {as_user: true});

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

                self.postMessageToChannel(channel.name, prettyPrint(record), {as_user: true});
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

                self.postMessage(originalMessage.user, prettyPrint(record), {as_user: true});
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

                self.postMessageToChannel(channel.name, prettyPrint(record), {as_user: true});
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

                self.postMessage(originalMessage.user, prettyPrint(record), {as_user: true});
                connection.release();
            });
        }
    });
};

ScraperBot.prototype._replyWithURL = function (originalMessage, hash_key) {
    var self = this;
    console.log("executing: _replyWithURL");
    debugger
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

ScraperBot.prototype._noResultsMessage = function (originalMessage) {
    var self = this;
    console.log("executing: _noResultsMessage");
    if (self._isChannelConversation(originalMessage) &&
    self._isFromScraperBot(originalMessage)) {
            var channel = self._getChannelById(originalMessage.channel);
            var err_message = ":robot_face: Sorry, that query returned no results!";
            self.postMessageToChannel(channel.name, err_message, {as_user: true});
            return console.error("DATABASE ERROR:", err);
    }
    // doesn't work for DM because originalMessage.user is the bot itself
    else if (self._isDirectConversation(originalMessage) &&
            self._isFromScraperBot(originalMessage)) {
            var err_message = ":robot_face: Sorry, that query returned no results!";
            self.postMessage(originalMessage.user, err_message, {as_user: true});
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
ScraperBot.prototype._helpMessage = function (originalMessage) {
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
 * Util function to check if user is asking for all urls for a given scraper_class_name and store ID
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingtoPullAllURLs = function (message) {
    return message.text.toLowerCase().indexOf('urls of ') > -1;
};

/**
 * Util function to check if urls uploaded actually returned matches
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForURLsWithMatches = function (message) {
    return message.text.toLowerCase().indexOf('urls with matches for ') > -1;
};

/**
 * Util function to check if user is asking for scraper details
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForScraperDetails = function (message) {
    return message.text.toLowerCase().indexOf('scraper details ') > -1;
};

/**
 * Util function to check if user is asking for scraper details
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingForSKUDetails = function (message) {
    return message.text.toLowerCase().indexOf('sku details ') > -1;
};

/**
 * Util function to check if user is asking to attach scrapers
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingToAttachScraper = function (message) {
    return message.text.toLowerCase().indexOf('attach') > -1;
};

/**
 * Util function to check if user is asking to detach scrapers
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isAskingToDetachScraper = function (message) {
    return message.text.toLowerCase().indexOf('detach') > -1;
};

/**
 * Util function to check if user is asking for help
 * @param {object} message
 * @returns {boolean}
 * @private
 */
ScraperBot.prototype._isNoResults = function (message) {
    return message.text.indexOf('[]') > -1;
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
var help_message = 'Hi Wiseguy, I\'m here to find scrapers and perform SQL queries so you don\'t have to! ' +
            '\n' +        
            '\n*Commands:* ' +
            '\n"*attached scrapers STORE_ID*":    see what scrapers are attached to a store ID. ' +
            '\n"*attached stores SCRAPER_ID*":    find stores attached to a scraper by scraper ID. ' +            
            '\n"*scraper name of SCRAPER_ID*":    find a scraper\'s name from scraper ID. ' +
            '\n"*scraper id of SCRAPER_NAME*":    find a scraper\'s ID from it\'s name.  ' +
            '\n"*scraper search SEARCH_TERM*":    if you don\'t remember the scraper\'s exact name. ' +
            '\n"​*pps of SKU in STORE_ID*​":    find the PPSID of a SKU in a given store. ' +
            '\n"​*sku of PPSID in STORE_ID*​":    find the SKU of a PPSID in a given store.' +
            '\n"*url of PPSID.SCRAPER_CLASS_NAME*":    find url from ppsid.scraper_class_name key in DynamoDB. ' +
            '\n"*urls of SCRAPER_CLASS_NAME in STORE_ID*":    output a CSV of ALL urls of a given class name attached to the store . ' + 
            '\n"*urls with matches for SCRAPER_CLASS_NAME in STORE_ID*":    output a CSV of uploaded urls that returned a match in the Wiseboard. ' + 
            '\n"*attach SCRAPER_CLASS_NAME to STORE_ID*":    attach scraper to a store ' + 
            '\n"*detach SCRAPER_CLASS_NAME from STORE_ID*":    detach scraper from a store ' + 
            '\n"*sku details STORE_ID*":    find out about a sku (price, scrape date, etc)' + 
            '\n"*scraperbot help*":       if you forgot what I just told you :robot_face:.' +
            '\nPlease ask Tenzin if you have any SQL queries you want me to handle'; 

module.exports = ScraperBot;