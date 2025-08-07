# shellscript-bot

[mirthturtle](https://twitch.tv/mirthturtle)'s Discord bot. Original version by [derfarctor](https://github.com/derfarctor/).

## Features

- Welcomes new members, verifies humanity & lists server rules
- Posts notifications to `@@streamwatchers` when mirthturtle goes live on Twitch
- Automatically posts new Twitch clips to `#clips-reel`
- Turns on the Live indicator on [mirthturtle.com](https://mirthturtle.com/)
- Posts automated status updates and nudges
- Post custom messages via CLI

### Requirements (npm)
- discord.js
- axios

`npm install` then run with `node bot.js`.

### Running on server

`nohup node bot.js &`

Rename example_config.json to config.json once you have filled out the required fields.
