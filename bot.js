const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { discord_token, twitch_client_id, twitch_client_secret, guild_id, announcement_channel_id, clipreel_channel_id, alert_role, twitch_broadcaster_id } = require('./config.json');
const axios = require("axios");

const discord_client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ],
    partials: ['MESSAGE', 'CHANNEL'] }
);

const GOLIVE_MESSAGES = [
    "mirthturtle is streaming! Won't you come watch? <:charlie:727649900602589234>",
    "mirthturtle's live! You don't want to miss this one... <:charlie:727649900602589234>",
    "A mirthturtle stream begins! Don't miss this special event... <:charlie:727649900602589234>",
    "You are cordially invited to mirthturtle's stream, starting now! <:charlie:727649900602589234>",
    "mirthturtle is live! Come say hi or you can also lurk creepily. <:charlie:727649900602589234>",
];

let twitch_api_token;
let is_live;
let clips = [];

let guild;
let announcement_channel;
let clipreel_channel;
let streamwatcher_role;

let args = process.argv.slice(2);

discord_client.once('ready', async () => {
    await setup_discord();
    await refresh_twitch_token();

    if (args[0]) {
        // do one-offs
        if (args[0] == "post") {
            // post_custom_message("");
        }
    } else {
        // normal start
        startPollingTwitch();
        startPollingMirthTurtle();

        console.log(`${Date.now()} SHELLSCRIPT ready!`);
    }

});

// Catch infrequent unhandled WebSocket error within discord.js
discord_client.on('shardError', async (error) => {
    console.error(`A websocket connection encountered an error at ${Date.now()}:`, error);
});

discord_client.on('unhandledRejection', error => {
    console.error(`An unhandled rejection encountered at ${Date.now()}:`, error);
});

discord_client.on('error', error => {
    console.error(`An error encountered at ${Date.now()}:`, error);
});

discord_client.on('messageCreate', async (message) => {
    const member = await guild.members.fetch(message.author.id);
    if (!member) {
        await message.author.send("You need to be in mirthturtle's discord server to use SHELLSCRIPT!");
        return;
    }
    if (message.content == "!hi" || message.content == "!help") {
        if (message.guild) {
            await message.delete();
        }
        await message.author.send("Hello! Glad you're part of THE SHELL. Here are some commands I respond to:\n• !watch – receive a ping whenever @mirthturtle goes live on Twitch\n• !stop – stop receiving @streamwatchers pings\n• !rules – learn the rules of the server");
        return;
    }
    if (message.content == "!rules") {
        await message.channel.send("\"What are the rules?\" We don't have too many, but here's how we try to keep order:\n• No hate, bigotry, etc.\n• Please do not post the Pepe frog or derivatives\n• There are certain celebrities we do not wish to give a platform to: Musk, Rogan, Trump, Kanye, etc. Not an exhaustive list, but peddlers of hate and misinformation will be deleted!\n• Please do not send me powder of any kind\n• Talk of cryptocurrencies should be relegated to the #business-grifts channel");
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
            console.log(`Given streamwatcher role to ${message.author.username}.`);
        } catch (error) {
            console.log(`There was an error giving streamwatcher role to ${message.author.username}: ${error}`);
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
            console.log(`Removed streamwatcher role from ${message.author.username}.`);
        } catch (error) {
            console.log(`There was an error removing streamwatcher role from ${message.author.username}: ${error}`);
            await message.author.send("Something went wrong removing your @streamwatcher role! Please complain directly to mirthturtle.");
        }
    }
});

// Event listener for when a new member joins a server
discord_client.on('guildMemberAdd', member => {
    const channel = member.guild.channels.cache.find(ch => ch.name === 'general');
    if (!channel) return;

    channel.send(`Welcome to THE SHELL, ${member}! Please introduce yourself, and type \`!hi\` if you'd like to hear more about helpful commands I respond to.`);
    console.log(`${Date.now()} Welcome message sent to ${member}.`);
});

async function setup_discord() {
    guild = discord_client.guilds.cache.get(guild_id);
    if (!guild) {
        throw "Can't find mirthturtle's discord server. Terminated.";
    }
    announcement_channel = discord_client.channels.cache.get(announcement_channel_id);
    if (!announcement_channel) {
        throw "Can't find announcement channel. Terminated.";
    }
    clipreel_channel = discord_client.channels.cache.get(clipreel_channel_id);
    if (!clipreel_channel) {
        throw "Can't find clipreel channel. Terminated.";
    }
    streamwatcher_role = announcement_channel.guild.roles.cache.find(r => r.id === alert_role);
    if (!streamwatcher_role) {
        throw "Can't find streamwatcher role. Terminated.";
    }

    discord_client.user.setPresence({
      activities: [{ name: `for streams...`, type: ActivityType.Watching }],
      status: 'online',
    });

    console.log(`${Date.now()} Discord client set up.`);
}

async function startPollingTwitch() {
    setInterval(async function () { await checkForLiveStreams(); }, 30 * 1000);
    setInterval(async function () { await checkForNewClips(); }, 30 * 1000);
}

async function startPollingMirthTurtle() {
    let hours = 36;
    setInterval(async function () {
        let mirthdata = await check_mirthturtle_stats();
        // TODO if any apply, post a msg in some channel

        // post_custom_message(`It has been **${}** days since the last stream. Please shame @mirthturtle for his sloth.`);


    }, 60 * 1000 * 60 * hours);
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
            is_live = false;
        } else if (resp.data.data[0].type == "live") {
            if (!is_live) {
                is_live = true;
                await post_live_alert();
            }
        } else {
            is_live = false;
        }
    }
    catch (error) {
        if (error.response) {
            if (error.response.status == 401) {
                console.log("HTTP Error 401");
                await refresh_twitch_token();
            }
        } else {
            console.log(`${Date.now()} Error occurred checking for live streams: ${error}`);
        }
    }
}

async function checkForNewClips() {
    let new_clips;
    try {
        let resp = await axios.get(`https://api.twitch.tv/helix/clips?broadcaster_id=${twitch_broadcaster_id}`, {
            headers: {
                'Authorization': 'Bearer ' + twitch_api_token,
                'Client-ID': twitch_client_id
            }
        });
        if (!resp.data.data.length) {
            console.log('No clips returned from Twitch.');
        } else {
            if (clips.length == 0) {
                // if no clips yet, fill up clips array
                console.log('Filling up clip array');
                clips = resp.data.data;
            } else {
                // if new data has new clips, post then
                new_clips = onlyInLeft(resp.data.data, clips, isSameClip);

                if (new_clips.length > 0) {
                    for (const clip of new_clips) {
                        await post_clip(clip);
                    };
                    clips = resp.data.data;
                }
            }
        }
    }
    catch (error) {
        if (error.response) {
            if (error.response.status == 401) {
                console.log("HTTP Error 401");
                await refresh_twitch_token();
            }
        } else {
            console.log(`${Date.now()} Error checking for clips: ${error}`);
        }
    }
}

const isSameClip = (a, b) => a.title === b.title && a.url === b.url;

// Get items that only occur in the left array,
// using the compareFunction to determine equality.
const onlyInLeft = (left, right, compareFunction) =>
  left.filter(leftValue =>
    !right.some(rightValue =>
      compareFunction(leftValue, rightValue)));

async function post_clip(clip) {
    console.log(`${Date.now()} Posting new clip: ${clip.title}`);
    await clipreel_channel.send(`${clip.url}`);
}

async function refresh_twitch_token() {
    let url = `https://id.twitch.tv/oauth2/token?client_id=${twitch_client_id}&client_secret=${twitch_client_secret}&grant_type=client_credentials`;
    let resp = await axios.post(url);
    console.log(`${Date.now()} Got new twitch token`);
    twitch_api_token = resp.data.access_token;
}

async function post_live_alert() {
    console.log(`${Date.now()} Making live announcement`);
    let random = Math.floor(Math.random() * GOLIVE_MESSAGES.length);
    await announcement_channel.send(`<@&${alert_role}> ${GOLIVE_MESSAGES[random]} https://twitch.tv/mirthturtle`);
}

async function post_custom_message(message, channelName = 'general') {
    console.log(`${Date.now()} Posting custom message: ${message}`);
    const channel = guild.channels.cache.find(ch => ch.name === channelName);
    if (!channel) {
        console.log('Channel not found.');
        return;
    }
    await channel.send(`${message}`);
}

async function check_mirthturtle_stats() {
    let url = `https://mirthturtle.com/discord_stats`;
    let resp = await axios.get(url);
    return resp.data;
}

discord_client.login(discord_token);
