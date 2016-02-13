// bin/bot.js

'use strict';

// import scraperbot
var ScraperBot = require('../lib/scraperbot');
 
var token = process.env.BOT_TOKEN;
var name = "scraperbot";

// instantiate scraperbot
var scraperbot = new ScraperBot({
	token: token,
	name: name
});

// launch scraperbot
scraperbot.run();