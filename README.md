# mx-sim-scripts
Server scripts for the game "MX Simulator".

## How to use
1. Download the JavaScript files you want and move them to your server's `js` directory.
2. Edit your `serverargs.txt` file and include the line argument `--javascript js/<scriptname>.js`.<br>
3. Include the `--args-file serverargs.txt` argument when starting your server.

Example:
```--port 19800
--max-clients 11
--greeting "Welcome to my server"
--results-file results.txt
--track-interval 15
--laps 5
--erode 0.3
--javascript js/elimination.js
--javascript js/myinfo.js
trackinfo/alcrest.trackinfo
```
## Scripts
### Elimination
The `elimination.js` script is used to host "elimination" races. Type in the server command `server, elim <n>` to eliminate the last "n" players. You **must be a server admin** to run this command. When players are eliminated, a message will be broadcast to the server, and the player will be moved into spectator mode.  
