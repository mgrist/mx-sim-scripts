/*
############################################################
"elim" command
Eliminate the specificied number of players from the race.
The last "n" players will be eliminated.
When a player is eliminated, they are forced into spectator mode.
example:
elim 5
############################################################
*/

var data = {};
var playerCount = null;

function timingLog(slot, pos, time) {
  if (!data[slot]) {
    data[slot] = [];
  }
  data[slot].push({ pos, time });
  timing_handler(slot, pos, time);
}

function isAdmin(slot) {
  var rank = mxserver.get_rank(slot);
  if (rank == "Marshal" || rank == "Admin") {
    return true;
  }
  return false;
}

function getEliminatedPlayers(n) {
  // Convert the data object's properties to an array for easier manipulation
  var playerEntries = [];
  for (var playerSlot in data) {
    var slotData = data[playerSlot];
    var lastEntryTime = slotData[slotData.length - 1].time;
    playerEntries.push({
      slot: playerSlot,
      gateCount: slotData.length,
      lastTime: lastEntryTime
    });
  }

  // Sort by the number of gates passed in ascending order, and by last gate time in descending order
  playerEntries.sort(function (a, b) {
    if (a.gateCount === b.gateCount) {
      return b.lastTime - a.lastTime; // Higher time is worse, so sort descending here
    }
    return a.gateCount - b.gateCount; // Fewer gates is worse, so sort ascending
  });

  // Get the slots of the first 'n' entries (these are the players to be eliminated)
  var eliminatedPlayers = [];
  for (var i = 0; i < n; i++) {
    if (i < playerEntries.length) {
      eliminatedPlayers.push(playerEntries[i].slot);
    }
  }

  return eliminatedPlayers;
}

function getPlayerCount() {
  var status;
  var num = 0;

  for (i = 0; i < mxserver.max_slots; i++) {
    status = mxserver.get_status(i);
    if (status == "Player") {
      num++;
    }
  }

  return num;
}

function elimPlayers(slot, cmdline) {
  if (cmdline.match(/^\s*elim\b/) == null) {
    return command_handler(slot, cmdline);
  }

  if (!isAdmin(slot)) {
    mxserver.send(slot, "You do not have permission to use this command");
    return 1;
  }

  var cliArgs = cmdline.match(/^\s*elim\s*(\d+)/);
  var playerCount = getPlayerCount();

  // Error check the users input
  if (cliArgs == null) {
    mxserver.send(slot, "Usage: server, elim <number>");
    return 1;
  } else if (cliArgs.length < 2) {
    mxserver.send(slot, "Usage: server, elim <number>");
    return 1;
  } else if (cliArgs[1] < 1) {
    mxserver.send(slot, "Invalid number");
    return 1;
  } else if (cliArgs[1] > mxserver.max_slots) {
    mxserver.send(
      slot,
      "Number too high. Maximum slots is " + mxserver.max_slots
    );
    return 1;
  } else if (playerCount < cliArgs[1]) {
    mxserver.send(
      slot,
      "Not enough players to eliminate. Current player count is " + playerCount
    );
    return 1;
  }

  var numberToElim = parseInt(cliArgs[1]);
  mxserver.log("Eliminating " + numberToElim + " players\n");
  var eliminatedPlayers = getEliminatedPlayers(numberToElim);
  for (var num = 0; num < eliminatedPlayers.length; num++) {
    var playerInfo = mxserver.get_slot_info(parseInt(eliminatedPlayers[num]));
    var message = "[red]" + playerInfo.name + " has been eliminated.";
    mxserver.broadcast(convert_to_ansi(message) + convert_to_ansi("[normal]"));
    mxserver.schedule_command("at +0 forcespec " + playerInfo.uid);
  }

  return 1;
}

function convert_to_ansi(s) {
  var colors = {
    normal: "\x1b[0m",
    bright: "\x1b[1m",
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m"
  };

  return s.replace(/\[([^}]+)\]/g, function (full, sub1) {
    if (sub1 in colors) return colors[sub1];
    return full;
  });
}

function finishLog() {
  data = {};
  finish_handler();
}

var timing_handler = mxserver.timing_handler;
mxserver.timing_handler = timingLog;

var command_handler = mxserver.command_handler;
mxserver.command_handler = elimPlayers;

var finish_handler = mxserver.finish_handler;
mxserver.finish_handler = finishLog;
