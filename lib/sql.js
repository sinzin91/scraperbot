var queries = {
	_replyWithScraperIds: 'SELECT external_crawl_settings.crawl_store_id, external_crawl_sites.name FROM external_crawl_settings INNER JOIN external_crawl_sites ON external_crawl_settings.crawl_store_id=external_crawl_sites.id WHERE store_id = ?',
	_replyWithScraperId: 'SELECT id FROM external_crawl_sites WHERE name = ?',
	_replyWithScraperName: 'SELECT name FROM external_crawl_sites WHERE id = ?',
	_replyWithSearchResults: 'SELECT id, name FROM external_crawl_sites WHERE name LIKE ?',
	_replyWithStoreIds: 'SELECT store_id FROM external_crawl_settings WHERE crawl_store_id = ?',
	_replyWithPPSID: "select id from products_per_store as pps where (pps.sku, store_id) = ('",
	_replyWithSKU: "select sku from products_per_store as pps where (pps.id, store_id) = ('",
	_replyWithSKUDetails: "select pps.sku, pps.id, pps.name, p.last_update as date, p.price, p.source, p.url from products_per_store as pps join pricing as p on pps.product_id=p.product_id where (pps.store_id, pps.sku) = ("
};

module.exports = queries;