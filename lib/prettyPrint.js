var prettyPrint = function(record) {
    var prettyObj = '';
    for (var key in record) {
      debugger
        if (record.hasOwnProperty(key)) {
            console.log("*" + key + "*: " + record[key]);
            prettyObj += "\n*" + key + "*: " + record[key];
        }
    }
    debugger
    return prettyObj;
}

module.exports = prettyPrint;