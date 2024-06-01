#!/bin/bash

# Restarts the discord bot

# Define the name of your Node.js application file
APP_NAME="bot.js"

# Find the process ID (PID) of the running Node.js application
PID=$(pgrep -f "node $APP_NAME")

# Check if the process is running and kill it
if [ -n "$PID" ]; then
  echo "Stopping Node.js application with PID $PID..."
  kill -9 $PID
  echo "Application stopped."
else
  echo "No running Node.js application found."
fi

# Start the Node.js application with nohup
echo "Starting Node.js application..."
nohup node $APP_NAME &

echo "Node.js application started."
