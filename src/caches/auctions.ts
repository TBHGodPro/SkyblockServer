import { hypixel, mongo } from '..';
import Auction, { AuctionMongoData } from '../classes/Auction';
import Logger from '../classes/Logger';

let lastUpdated = 0;

const logger = new Logger('Auctions');

export async function loadAuctions(log: boolean) {
  const auctions: AuctionMongoData[] = [];

  if (log) logger.debug('Loading Auctions...');

  let page = await hypixel.fetch(`https://api.hypixel.net/skyblock/auctions?page=0`, {
    ignoreRateLimit: true,
  });

  for (const auction of page.auctions) {
    const auc = new Auction(auction);
    auctions.push(auc.toMongoData());
    if (auc.lastUpdated > lastUpdated) lastUpdated = auc.lastUpdated;
  }

  const promises = [];

  for (let i = 1; i < page.totalPages; i++) {
    promises.push(
      hypixel
        .fetch(`https://api.hypixel.net/skyblock/auctions?page=${i}`, {
          ignoreRateLimit: true,
        })
        .then(data => {
          for (const auction of data.auctions) {
            const auc = new Auction(auction);
            auctions.push(auc.toMongoData());
            if (auc.lastUpdated > lastUpdated) lastUpdated = auc.lastUpdated;
          }
        })
    );
  }

  await Promise.all(promises);

  if (log) logger.debug(`Fetched ${page.totalPages} Pages of Auctions! (${auctions.length} Auctions)`);

  await mongo.resetAuctions();
  await mongo.addAuctions(auctions);

  auctions.splice(0, auctions.length);
}

export async function updateAuctions() {
  let page = 0;
  let next = true;
  let newLastUpdated = 0;

  while (next) {
    await hypixel
      .fetch(`https://api.hypixel.net/skyblock/auctions?page=${page}`, {
        ignoreRateLimit: true,
      })
      .then(async data => {
        // If Final Page
        if (data.page === data.totalPages - 1) next = false;

        const promises = [];

        // Each Auction
        for (const auction of data.auctions) {
          const auc = new Auction(auction);

          promises.push(mongo.addAuction(auc.toMongoData()));

          // Update "lastUpdated" values
          if (auc.lastUpdated > newLastUpdated) newLastUpdated = auc.lastUpdated;
          if (auc.lastUpdated < lastUpdated) next = false;
        }

        await Promise.all(promises);

        // Increment Page
        page++;
      });
  }

  lastUpdated = newLastUpdated;
}

export async function clearEndedAuctions() {
  const recentlyEnded = await hypixel.fetch('https://api.hypixel.net/skyblock/auctions_ended', {
    ignoreRateLimit: true,
  });

  await Promise.all(recentlyEnded.auctions.map(auction => mongo.deleteAuction(auction.auction_id)));

  // TODO: Decide whether or not to remove expired auctions which haven't been reclaimed by the seller
  // Decided not to as hypixel api would just re-add them
  // for (const [_, auction] of auctions) if (auction.ended) auctions.delete(auction.id);
}
