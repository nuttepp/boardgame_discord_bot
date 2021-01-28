require('dotenv').config();
const Discord = require('discord.js');
const convertXml = require('xml-js');
const TinyURL = require('tinyurl');
const axios = require('axios');

const client = new Discord.Client();
const token = process.env.DISCORD_BOT_TOKEN;
const prefix = '!bg';

client.login(token);

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('!bg', { type: 'LISTENING' });
});

client.on('message', (messageDiscord) => handleMessage(messageDiscord));

function handleMessage(messageDiscord) {
  if (!messageDiscord.content.startsWith(prefix) || messageDiscord.author.bot) return;
  messageDiscord.react('👍')
  const messageObj = parseMessage(messageDiscord);
//   console.log(messageObj);
  switch (messageObj.command) {
    case 'find':
      findCommand(messageDiscord, messageObj.value);
      break;
    default:
      messageDiscord.channel.send(`Sorry, I don't know the command '${messageObj.command}'. :cry:`).then((message) => {
        message.delete({ timeout: 5000 });
        messageDiscord.delete({ timeout: 5000 });
      });
      break;
  }
}

function parseMessage(message) {
  let messageArray = message.content.replace('!bg', '').trim('').split(' ');
  const command = messageArray.shift();
  const value = messageArray.join(' ');
  return { command: command, value: value };
}

function findCommand(messageDiscord, message) {
  const gamename = message.replace(/[^a-zA-Z0-9\s]/gi, '').replace(/\s+/gi, '%20');
  // fetch from BGG first
  axios.post(`https://boardgamegeek.com/search/boardgame?q=${gamename}`).then((bggSearchRes) => {
    const bggSearchData = bggSearchRes.data.items;
    if (!bggSearchData.length) {
      // Can't find a game in BGG
      messageDiscord.channel.send(`I can't find your game.`);
    } else {
      // Found a Game in BGG
      const firstGame = bggSearchData[0];
      console.log(firstGame);
      // Fetch First Game Data from BGG
      axios
        .all([
          axios.get(`https://www.boardgamegeek.com/xmlapi2/thing?id=${firstGame.objectid}`),
          axios.get(`https://tabletopia.com/playground/playgroundsearch/search?timestamp=0&_=1611743939866&query=${firstGame.name}`),
        ])
        .then(
          axios.spread(async (bggGameRes, tabletopiaRes) => {
            const bggGameData = JSON.parse(convertXml.xml2json(bggGameRes.data, { compact: true })).items.item;
            const tabletopiaData = !tabletopiaRes.data.includes('not-found') ? tabletopiaRes.data.match(/"\/games[a-zA-Z0-9-/]+"/)[0].replace(/"/g, '') : null;

            // Get Tiny URL for Tabletopia and Tabletop
            let tabletopiaLink = '';
            let tableSimulatorLink = '';
            if (tabletopiaData) {
              await TinyURL.shorten(`https://tabletopia.com${tabletopiaData}`).then(async (res) => {
                tabletopiaLink = await res;
              });
            }
            await TinyURL.shorten(`https://steamcommunity.com/workshop/browse/?appid=286160&searchtext=${firstGame.name}`).then(async (res) => {
              tableSimulatorLink = await res;
            });

            // Add other Item in Search
            let otherItem = '';
            for (let i = 1; i < (bggSearchData.length < 4 ? bggSearchData.length : 4); i++) {
              otherItem = `${otherItem}${bggSearchData[i].name} (${bggSearchData[i].yearpublished})\n`;
            }
            otherItem = otherItem || '-';
            console.log(bggGameData);
            // Add Embed Object
            const gameObj = {
              id: firstGame.objectid || bggGameData._attributes.id,
              name: firstGame.name || bggGameData.name[0]._attributes.value,
              image: bggGameData.image._text,
              thumbnail: bggGameData.thumbnail._text,
              description: bggGameData.description._text,
              yearPublished: bggGameData.yearpublished._attributes.value,
              minPlayers: bggGameData.minplayers._attributes.value,
              maxPlayers: bggGameData.maxplayers._attributes.value,
              minPlaytime: bggGameData.minplaytime._attributes.value,
              maxPlaytime: bggGameData.maxplaytime._attributes.value,
              tabletopiaLink: tabletopiaLink,
              tableSimulatorLink: tableSimulatorLink,
              boardGameCategory: bggGameData.link
                .map((x, i) => x._attributes.type === 'boardgamecategory' && x._attributes.value)
                .filter((e) => e !== false)
                .join(', '),
              boardGameMechanic: bggGameData.link
                .map((x, i) => x._attributes.type === 'boardgamemechanic' && x._attributes.value)
                .filter((e) => e !== false)
                .join(', '),
              totalExpansions: bggGameData.link.map((x) => x._attributes.type === 'boardgameexpansion').filter((e) => e != false).length,
            };

            const embedObj = {
              color: 0x0099ff,
              title: `${gameObj.name} (${gameObj.yearPublished}) : ${gameObj.minPlayers} - ${gameObj.maxPlayers} Players`,
              url: `https://boardgamegeek.com/boardgame/${gameObj.id} `,
              description: `${gameObj.description.replace(/&nbsp;|&#10;|&rsquo;/gi, ' ').substring(0, 170)}...`,
              thumbnail: {
                url: gameObj.thumbnail,
              },
              fields: [
                {
                  name: 'Mechanics',
                  value: `${gameObj.boardGameMechanic.substring(0, 90)}...`,
                },
                {
                  name: 'Tabletop Workshop',
                  value: tableSimulatorLink,
                  inline: true,
                },
              ],
            };
            if (gameObj.tabletopiaLink) {
              embedObj.fields.push({
                name: 'Tabletopia Link',
                value: gameObj.tabletopiaLink,
                inline: true,
              });
            }
            if (bggSearchData.length > 1) {
              embedObj.fields.push({
                name: `Other Search Result (${bggSearchData.length} Totals)`,
                value: otherItem,
              });
            }
            messageDiscord.channel.send({ embed: embedObj });
            messageDiscord.delete({ timeout: 5000 })
          })
        );
    }
  });
}
