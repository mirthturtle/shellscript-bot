const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { discord_token, twitch_client_id, twitch_client_secret, guild_id, announcement_channel_id, clipreel_channel_id, alert_role, twitch_broadcaster_id, mirth_api_key } = require('./config.json');
const axios = require("axios");

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: ['MESSAGE', 'CHANNEL'] }
);

const CHARLIE_EMOTE = '<:charlie:727649900602589234>';
const GOLIVE_MESSAGES = [
    `mirthturtle is streaming! Won't you come watch? ${CHARLIE_EMOTE}`,
    `mirthturtle's live! You don't want to miss this one... ${CHARLIE_EMOTE}`,
    `A mirthturtle stream begins! Don't miss this special event... ${CHARLIE_EMOTE}`,
    `You are cordially invited to mirthturtle's stream, starting now! ${CHARLIE_EMOTE}`,
    `mirthturtle is live! Come say hi or you can also lurk creepily. ${CHARLIE_EMOTE}`,
];

let twitch_api_token;
let is_live;
let clips = [];

let guild;
let announcement_channel;
let clipreel_channel;
let streamwatcher_role;

let args = process.argv.slice(2);

discordClient.once('ready', async () => {
    await setup_discord();
    await refreshTwitchToken();

    if (args[0]) {
        // do one-offs: `node bot.js clip` etc
        if (args[0] == "post") {
            // postCustomMessage("");
        }
        if (args[0] == "clip") {
            checkForNewClips();
        }
        if (args[0] == "live") {
            turnOnSiteLiveIndicator();
        }
        if (args[0] == "dark") {
            turnOffSiteLiveIndicator();
        }
    } else {
        // normal start
        startPollingTwitch();
        startPollingMirthTurtle();

        logMessage("SHELLSCRIPT ready!");
    }
});

// Catch infrequent unhandled WebSocket error within discord.js
discordClient.on('shardError', async (error) => {
    logMessage(`A websocket connection encountered an error:`, error);
});

discordClient.on('unhandledRejection', error => {
    logMessage("An unhandled rejection encountered:", error);
});

discordClient.on('error', error => {
    logMessage("An error occurred:", error);
});

discordClient.on('messageCreate', async (message) => {
    const member = await guild.members.fetch(message.author.id);
    if (!member) {
        await message.author.send("You need to be in mirthturtle's discord server to use SHELLSCRIPT!");
        return;
    }
    if (message.content == "!hi" || message.content == "!help") {
        if (message.guild) {
            await message.delete();
        }
        await message.author.send("Hello! Glad you're part of THE SHELL. Here are some commands I respond to:\n• `!watch` – receive a ping whenever @mirthturtle goes live on Twitch\n• `!stop` – stop receiving go-live pings\n• `!rules` – learn the rules of the server");
        logMessage(`User ${message.author.username} said hi.`);
        return;
    }
    if (message.content == "!rules") {
        await message.channel.send("\"What are the rules?\" Here's how we try to keep order in THE SHELL:\n• No hate, bigotry, etc.\n• Please do not post the Pepe frog or derivatives\n• There are certain celebrities we do not wish to give a platform to: Musk, Rogan, Trump, Kanye, Tate, etc. Not an exhaustive list, but peddlers of hate and misinformation will be deleted!\n• Talk of cryptocurrencies should be relegated to the #business-grifts channel\n• Please 'spoiler' any unpleasantness such as blood, spiders, etc. or simply do not post it\n• Please do not send me powder of any kind\n• Have fun and make friends!");
        logMessage(`Rules requested.`);
        return;
    }
    if (message.content == "!watch") {
        if (message.guild) {
            await message.delete();
        }
        if (member.roles.cache.has(alert_role)) {
            await message.author.send("You're already a @streamwatcher! But now especially so.");
            return;
        }
        try {
            await member.roles.add(streamwatcher_role);
            await message.author.send("Welcome, @streamwatcher! I'll ping you whenever mirthturtle starts streaming.");
            logMessage(`Given streamwatcher role to ${message.author.username}.`);
        } catch (error) {
            logMessage(`There was an error giving streamwatcher role to ${message.author.username}: ${error}`);
            await message.author.send("Something went wrong making you a @streamwatcher! Please complain directly to mirthturtle.");
        }
    }
    else if (message.content == "!stop") {
        if (message.guild) {
            await message.delete();
        }
        if (!member.roles.cache.has(alert_role)) {
            await message.author.send("I'm pretty sure you're not currently a @streamwatcher...");
            return;
        }
        try {
            await member.roles.remove(streamwatcher_role);
            await message.author.send("OK, you won't receive @streamwatcher notifications anymore. Not from me, anyway...");
            logMessage(`Removed streamwatcher role from ${message.author.username}.`);
        } catch (error) {
            logMessage(`There was an error removing streamwatcher role from ${message.author.username}: ${error}`);
            await message.author.send("Something went wrong removing your @streamwatcher role! Please complain directly to mirthturtle.");
        }
    }
});

// Event listener for when a new member joins a server
discordClient.on('guildMemberAdd', member => {
    const channel = member.guild.channels.cache.find(ch => ch.name === 'general');
    if (!channel) return;

    channel.send(`Welcome to THE SHELL, ${member}! Please introduce yourself, and type \`!hi\` to confirm your humanity and learn other helpful commands I respond to.`);
    logMessage(`Welcome message sent to ${member.username}.`);
});

async function setup_discord() {
    guild = discordClient.guilds.cache.get(guild_id);
    if (!guild) {
        throw "Can't find mirthturtle's discord server. Terminated.";
    }
    announcement_channel = discordClient.channels.cache.get(announcement_channel_id);
    if (!announcement_channel) {
        throw "Can't find announcement channel. Terminated.";
    }
    clipreel_channel = discordClient.channels.cache.get(clipreel_channel_id);
    if (!clipreel_channel) {
        throw "Can't find clipreel channel. Terminated.";
    }
    streamwatcher_role = announcement_channel.guild.roles.cache.find(r => r.id === alert_role);
    if (!streamwatcher_role) {
        throw "Can't find streamwatcher role. Terminated.";
    }

    discordClient.user.setPresence({
      activities: [{ name: `for streams...`, type: ActivityType.Watching }],
      status: 'online',
    });

    logMessage(`Discord client set up.`);
}

async function startPollingTwitch() {
    setInterval(async function () { await checkForLiveStreams(); }, 30 * 1000);
    setInterval(async function () { await checkForNewClips(); }, 60 * 1000);
}

async function startPollingMirthTurtle() {
    setInterval(async function () {
        let mirthdata = await checkMirthturtleStats();
        // if any apply, post a msg in some channel

        const now = new Date();
        let hour = now.getHours();

        // time since last Air Mirth One
        if (hour == 12) {
            if (mirthdata.airmirthone && mirthdata.airmirthone % 14 == 0) {
                postCustomMessage(`It has been **${mirthdata.airmirthone}** days since the last Air Mirth One! Please shame @mirthturtle for his sloth.`);
            }
        }

        // time since last ghostcrime download
        if (hour == 10) {
            if (mirthdata.ghostcrime && mirthdata.ghostcrime % 30 == 0) {
                postCustomMessage(`It has been a while since anyone downloaded GHOSTCRIME! Consider reading this *classic* full-length novel: https://mirthturtle.com/ghostcrime`);
            }
        }

        // time since last Social star
        if (hour == 5) {
            if (mirthdata.stars && mirthdata.stars % 30 == 0) {
                postCustomMessage(`It has been a while since someone last ⭐'d a Mirth Turtle Social post! Go see what thoughts @mirthturtle has been unwisely posting: https://mirthturtle.com/social`);
            }
        }

        // m3lon nudger
        if (hour == 8) {
            if (mirthdata.melon && mirthdata.melon % 100 == 0) {
                postCustomMessage(`It's been too long since anyone selected a melon using m3lon's flagship Melon Selector! Select one today: https://mirthturtle.com/m3lon/selector`);
            }
        }

    }, 60 * 1000 * 60); // every hour
}

async function checkForLiveStreams() {
    try {
        let resp = await axios.get('https://api.twitch.tv/helix/streams?user_login=mirthturtle', {
            headers: {
                'Authorization': 'Bearer ' + twitch_api_token,
                'Client-ID': twitch_client_id
            }
        });
        if (!resp.data.data.length) {
            if (is_live) {
                is_live = false;
                turnOffSiteLiveIndicator();
            }
        } else if (resp.data.data[0].type == "live") {
            if (!is_live) {
                is_live = true;
                await postLiveAlertToDiscord();
                turnOnSiteLiveIndicator();
            }
        } else {
            if (is_live) {
                is_live = false;
                turnOffSiteLiveIndicator();
            }
        }
    }
    catch (error) {
        if (error.response) {
            if (error.response.status == 401) {
                logMessage("HTTP Error 401");
                await refreshTwitchToken();
            }
        } else {
            logMessage(`Error occurred checking for live streams: ${error}`);
        }
    }
}

async function checkForNewClips() {
    let new_clips;
    const today = new Date();
    const day = padWithZeros( Math.max( today.getDate() - 1, 1), 2);  // get from yesterday onwards to be safe
    const month = padWithZeros( today.getMonth() + 1, 2); // Adding 1 to get 1-12 for January-December
    const year = today.getFullYear();

    try {
        let resp = await axios.get(`https://api.twitch.tv/helix/clips?broadcaster_id=${twitch_broadcaster_id}&started_at=${year}-${month}-${day}T00:00:00Z`, {
            headers: {
                'Authorization': 'Bearer ' + twitch_api_token,
                'Client-ID': twitch_client_id
            }
        });
        if (!resp.data.data.length) {
            // logMessage('No clips returned from Twitch.');
        } else {
            if (clips.length == 0) {
                // if no clips yet, fill up clips array
                logMessage('Filling up clip array');
                clips = resp.data.data;
            } else {
                // if new data has new clips, post then
                new_clips = onlyInLeft(resp.data.data, clips);

                if (new_clips.length > 0) {
                    for (const clip of new_clips) {
                        await postClipOnDiscord(clip);
                    };
                    // refresh store of clips
                    clips = resp.data.data;
                }
            }
        }
    }
    catch (error) {
        if (error.response) {
            if (error.response.status == 401) {
                logMessage("HTTP Error 401 on clips.");
                await refreshTwitchToken();
            }
        } else {
            logMessage(`Error checking for clips: ${error}`);
        }
    }
}

const isSameClip = (a, b) => a.url === b.url;

// Get items that only occur in the left array
const onlyInLeft = (left, right) =>
  left.filter(leftValue =>
    !right.some(rightValue =>
      isSameClip(leftValue, rightValue)));

function padWithZeros(number, length) {
    return number.toString().padStart(length, '0');
}

async function postClipOnDiscord(clip) {
    logMessage(`Posting new clip: ${clip.title}`);
    await clipreel_channel.send(`${clip.url}`);
}

async function refreshTwitchToken() {
    let url = `https://id.twitch.tv/oauth2/token?client_id=${twitch_client_id}&client_secret=${twitch_client_secret}&grant_type=client_credentials`;
    let resp = await axios.post(url);
    twitch_api_token = resp.data.access_token;
    logMessage(`Got new twitch token.`);
}

async function postLiveAlertToDiscord() {
    logMessage(`Making live announcement.`);
    let random = Math.floor(Math.random() * GOLIVE_MESSAGES.length);
    await announcement_channel.send(`<@&${alert_role}> ${GOLIVE_MESSAGES[random]} https://twitch.tv/mirthturtle`);
}

async function postCustomMessage(message, channelName = 'general') {
    logMessage(`Posting custom message: ${message}`);
    const channel = guild.channels.cache.find(ch => ch.name === channelName);
    if (!channel) {
        logMessage('Channel not found.');
        return;
    }
    await channel.send(`${message}`);
}

async function checkMirthturtleStats() {
    let url = `https://mirthturtle.com/discord_stats`;
    let resp = await axios.get(url);
    return resp.data;
}

async function turnOnSiteLiveIndicator() {
    let url = `https://mirthturtle.com/go_live`;
    let resp = await axios.post(url, {
        token: mirth_api_key
    });
    logMessage('Site live indicator turned on.');
    return resp.data;
}

async function turnOffSiteLiveIndicator() {
    let url = `https://mirthturtle.com/go_dark`;
    let resp = await axios.post(url, {
        token: mirth_api_key
    });
    logMessage('Site live indicator turned off.');
    return resp.data;
}

const tzRegex = /\(.*?\)/g; // filter out timezone
const logMessage = (message) => { console.log(`${new Date().toString().replace(tzRegex, '')}• ${message}`) }

discordClient.login(discord_token);
