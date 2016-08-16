/**
 * Created by hangxu on 8/15/16.
 */

var _messageHasSubstring = function(message, substring){
    return message.text.toLowerCase().indexOf(substring) > -1;
};

module.exports = function(params){
    var message = params.message;

    // scraper related commands
    var scraperAttached = function(){
        return _messageHasSubstring(message, 'attached scrapers');
    };

    var scraperID = function(){
        return _messageHasSubstring(message, 'id of');
    };

    var scraperName = function(){
        return _messageHasSubstring(message, 'scraper name of');
    };

    var scraperBySearch = function(){
        return _messageHasSubstring(message, 'scraper search');
    };

    var scraperDetails = function(){
        return _messageHasSubstring(message, 'scraper details ');
    };

    var scraperAttaching = function(){
        return _messageHasSubstring(message, 'attach');
    };

    var scraperDettaching = function(){
        return _messageHasSubstring(message, 'detach');
    };

    // URL related commands
    var urlSingle = function(){
        return _messageHasSubstring(message, 'url of ');
    };

    var urlAll = function(){
        return _messageHasSubstring(message, 'urls of ');
    };

    var urlWithMatch = function(){
        return _messageHasSubstring(message, 'urls with matches for ');
    };

    // SKU related commands
    var skuFromPPSID = function(){
        return _messageHasSubstring(message, 'sku of');
    };

    var skuDetails= function(){
        return _messageHasSubstring(message, 'sku details ');
    };

    // store id related commands
    var storeIDs = function(){
        return _messageHasSubstring(message, 'attached stores');
    };

    // PPSID related commands
    var ppsidFromSKU = function(){
        return _messageHasSubstring(message, 'pps of');
    };


    // help related command
    var help = function(){
        return _messageHasSubstring(message, 'scraperbot help');
    };

    var wrongHelp = function(){
        return _messageHasSubstring(message, 'scraperbot instructions');
    };


    // other commands
    var emptyResult = function(){
        return _messageHasSubstring(message, '[]');
    };
};


