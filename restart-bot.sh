#!/bin/bash

# Restarts the discord bot

APP_NAME="bot.js"
PID=$(pgrep -f "node $APP_NAME")

# Check if the process is running and kill it
if [ -n "$PID" ]; then
  echo "Stopping Node.js application with PID $PID..."
  kill -9 $PID
  echo "Application stopped."
else
  echo "No running Node.js application found."
fi

nohup node $APP_NAME &
echo "bot.js started."
