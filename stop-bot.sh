#!/bin/bash

# Stops the discord bot.

APP_NAME="bot.js"
PID=$(pgrep -f "node $APP_NAME")

# Check if the process is running and kill it
if [ -n "$PID" ]; then
  echo "Stopping bot.js with PID $PID..."
  kill -9 $PID
  echo "Application stopped."
else
  echo "No running bot.js found."
fi
