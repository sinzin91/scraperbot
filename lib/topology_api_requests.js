var request = require('request');

// var attachTopologyRequest =  {
//   uri: "http://54.152.134.12:3000/attachScraper",
//   method: "PUT",
//   json: {
//     "topology_name": "wag.com_petsmart",
//     "storeId": "1162848457"
//   }
// }

function attachTopologyRequest(topology_name, storeId){
  return {
  uri: "http://54.152.134.12:3000/attachScraper",
  method: "PUT",
  json: {
    "topology_name": topology_name[1],
    "storeId": storeId[0]
  }
}
}

function detachTopologyRequest(topology_name, storeId){
  return {
  uri: "http://54.152.134.12:3000/detachScraper",
  method: "PUT",
  json: {
    "topology_name": topology_name[1],
    "storeId": storeId[0]
  }
}
}

module.exports = {
  attachTopologyRequest: attachTopologyRequest,
  detachTopologyRequest: detachTopologyRequest
}
