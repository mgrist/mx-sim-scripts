/*
############################################################
"quali" command
Qualifies the top "n" players. The remaining players are eliminated
When a player is eliminated, they are forced into spectator mode.
example:
quali 5
############################################################
*/

var raceinfo = null;
var g_steps_per_second = 128;
var g_step_size = 1.0 / g_steps_per_second;
var g_holeshot_index = 1;

function elimPlayers(slot, cmdline) {
  try {
    if (cmdline.match(/^\s*quali\b/) == null) {
      return command_handler(slot, cmdline);
    }

    if (!isAdmin(slot)) {
      mxserver.send(slot, "You do not have permission to use this command");
      return 1;
    }

    var cliArgs = cmdline.match(/^\s*quali\s*(\d+)/);
    var resultsFile = mxserver.file_to_string("./results.txt").split("\n");
    raceinfo = parse_server_results(resultsFile);
    sanitize_raceinfo(raceinfo);

    var playerCount = raceinfo.players.length;
    var numberToQuali = parseInt(cliArgs[1]);

    // Error check the users input
    if (cliArgs == null) {
      mxserver.send(slot, "Usage: server, quali <number>");
      return 1;
    } else if (cliArgs.length < 2) {
      mxserver.send(slot, "Usage: server, quali <number>");
      return 1;
    } else if (numberToQuali < 1) {
      mxserver.send(slot, "Invalid number");
      return 1;
    } else if (
      numberToQuali > mxserver.max_slots ||
      numberToQuali > playerCount
    ) {
      mxserver.send(slot, "Qualifying all players.");
      numberToQuali = playerCount;
      return 1;
    }

    var eliminatedPlayers = playerCount - numberToQuali;
    mxserver.send(
      slot,
      "Eliminating " + eliminatedPlayers + " players."
    );
    
    for (var num = 0; num < playerCount; num++) {
      if (num < numberToQuali) {
        continue;
      }
      var playerIndex = raceinfo.order[num].index;
      var playerInfo = raceinfo.players[playerIndex];
      var message = "[red]" + playerInfo.name + " has been eliminated.";
      mxserver.broadcast(
        convert_to_ansi(message) + convert_to_ansi("[normal]")
      );
      mxserver.schedule_command("at +0 forcespec " + playerInfo.uid);
    }
  } catch (e) {
    dprint(e);
  }

  return 1;
}

var command_handler = mxserver.command_handler;
mxserver.command_handler = elimPlayers;

///////////////////////
// UTILITY FUNCTIONS //
///////////////////////

function isAdmin(slot) {
  var rank = mxserver.get_rank(slot);
  if (rank == "Marshal" || rank == "Admin") {
    return true;
  }
  return false;
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

function dprint(s) {
  document.write(s + "\n");
}

function htmlquote(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// escape alphanumeric and _
function escape_string(s) {
  var c, e, i, n;

  n = s.length;

  e = "";

  for (i = 0; i < n; i++) {
    c = s.charAt(i);
    if (c.search(/[^A-Za-z0-9_]/) == -1) e += c;
    else e += "$" + c.charCodeAt(0).toString() + "$";
  }

  return e;
}

function get_var(s) {
  var i;

  i = s.indexOf("=");

  if (i >= 0) return { name: s.substring(0, i), value: s.substring(i + 1) };

  return null;
}

function position_to_lap(raceinfo, p) {
  if (p < raceinfo.firstlap) return 0;

  return 1 + Math.floor((p - raceinfo.firstlap) / raceinfo.normallap);
}

function lap_to_timeidx(raceinfo, lap) {
  if (lap == 0) return 0;

  return raceinfo.firstlap + raceinfo.normallap * (lap - 1) - 1;
}

function wrap_timing_position(raceinfo, i) {
  if (i < raceinfo.firstlap) return i;

  return raceinfo.firstlap + ((i - raceinfo.firstlap) % raceinfo.normallap);
}

function get_section_time(times, i0, i1) {
  var i, t0, t1;

  for (i = i0 < 0 ? 0 : i0; i <= i1; i++) if (!(i in times)) return -1;

  t0 = i0 < 0 ? 0 : times[i0];
  t1 = times[i1];

  return t1 - t0;
}

function get_average_section_time(raceinfo, times, i0, i1) {
  var i, n, t, s, p, fll, nll;

  p = times.length;
  fll = raceinfo.firstlap;
  nll = raceinfo.normallap;

  if (i0 < fll) return get_section_time(times, i0, i1);

  t = 0;
  n = 0;
  i = wrap_timing_position(raceinfo, i0);

  for (i = wrap_timing_position(raceinfo, i0); i + (i1 - i0) < p; i += nll) {
    s = get_section_time(times, i, i + (i1 - i0));

    if (s >= 0) {
      t += s;
      n++;
    }
  }

  if (n == 0) return -1;

  return Math.floor(t / n);
}

function get_baseline_section_time(raceinfo, index, i0, i1) {
  var i, s, t, n, times;

  t = 0;
  n = 0;

  for (i in raceinfo.players) {
    times = raceinfo.players[i].times;

    s = get_average_section_time(raceinfo, times, i0, i1);

    if (s >= 0) {
      t += s;
      n++;
    }
  }

  if (n == 0) return g_steps_per_second;

  return Math.floor(t / n);
}

function get_cutting_penalty(raceinfo, index) {
  var times, i, n, r, p, t, t1, t0;

  times = raceinfo.players[index].times;
  n = times.length;
  p = 0;
  r = 0;
  t0 = 0;

  for (i = 0; i < n; i++) {
    if (!(i in times)) r++;
    else {
      t1 = times[i];
      if (r > 0) {
        t = get_baseline_section_time(raceinfo, index, i - r - 1, i);

        if (t + g_steps_per_second > t1 - t0)
          p += t + g_steps_per_second - (t1 - t0);

        r = 0;
      }
      t0 = t1;
    }
  }

  return p;
}

function get_lap_time(raceinfo, times, lap) {
  var lastlap, lapstart, lapend;

  lastlap = position_to_lap(raceinfo, times.length);

  if (lap < 0) lap = lastlap;

  if (lap < 1 || lap > lastlap) return 0;

  lapstart = lap_to_timeidx(raceinfo, lap - 1);
  lapend = lap_to_timeidx(raceinfo, lap);

  if (!(lapstart in times && lapend in times)) return 0;

  if (lap == 1) lapstart = raceinfo.starttime;
  else lapstart = times[lapstart];
  lapend = times[lapend];

  return lapend - lapstart;
}

function lap_no_cuts(raceinfo, times, lap) {
  var i, lapstart, lapend;

  lapstart = lap_to_timeidx(raceinfo, lap - 1);
  lapend = lap_to_timeidx(raceinfo, lap);

  for (i = lapstart; i <= lapend; i++) if (!(i in times)) return 0;

  return 1;
}

function best_lap(raceinfo, times, nocuts) {
  var i, j, n, best, t0, t1;

  n = position_to_lap(raceinfo, times.length);

  if (n < 2) return 0;

  best = 2;

  for (i = 3; i <= n; i++) {
    t0 = get_lap_time(raceinfo, times, best);
    t1 = get_lap_time(raceinfo, times, i);

    if (nocuts) {
      if (!lap_no_cuts(raceinfo, times, i)) continue;
      if (!lap_no_cuts(raceinfo, times, best)) t0 = 0.0;
    }

    if (t0 == 0.0 || (t1 != 0.0 && t1 < t0)) best = i;
  }

  if (nocuts && !lap_no_cuts(raceinfo, times, best)) return 0;

  return best;
}

function best_time_to_lap(raceinfo, lap) {
  var i, ti, t, p, btime;

  btime = 0;

  ti = lap_to_timeidx(raceinfo, lap);

  for (i in raceinfo.players) {
    p = raceinfo.players[i];

    if (!(ti in p.times)) continue;

    t = p.times[ti];

    if (btime == 0 || t < btime) btime = t;
  }

  return btime;
}

function first_checkered_time(raceinfo) {
  var i, p, t, l, btime, laps;

  btime = 0;
  laps = 0;

  if (raceinfo.time > 0) {
    for (laps = 1; ; laps++) {
      t = best_time_to_lap(raceinfo, laps);

      if (t == 0) return 0;
      else if (t >= raceinfo.time + raceinfo.starttime) break;
    }
  }

  laps += raceinfo.laps;

  for (i in raceinfo.players) {
    p = raceinfo.players[i];

    l = position_to_lap(raceinfo, p.times.length);

    if (l < laps) continue;

    t = p.times[lap_to_timeidx(raceinfo, laps)];

    if (btime == 0 || t < btime) btime = t;
  }

  return btime;
}

function remove_lagger_bonus_laps(raceinfo) {
  var i, p, l, n, fct, t;

  fct = raceinfo.firstcheckeredtime;

  if (fct == 0) return;

  for (i in raceinfo.players) {
    p = raceinfo.players[i];
    n = position_to_lap(raceinfo, p.times.length);
    for (l = 1; l <= n; l++) {
      t = lap_to_timeidx(raceinfo, l);
      if (p.times[t] > fct && p.times.length > t + 1)
        p.times.splice(t + 1, p.times.length - (t + 1));
    }
  }
}

function compare_position_and_time(a, b) {
  if (a.position == b.position) return a.time - b.time;
  return -(a.position - b.position);
}

function update_running_order(raceinfo) {
  var i, n, order, p, pos, time, penalty, bl;

  n = 0;
  order = [];

  raceinfo.firstcheckeredtime = first_checkered_time(raceinfo);

  remove_lagger_bonus_laps(raceinfo);

  for (i in raceinfo.players) {
    p = raceinfo.players[i];

    pos = p.times.length;

    pos = lap_to_timeidx(raceinfo, position_to_lap(raceinfo, pos)) + 1;

    if (pos <= 1) time = raceinfo.starttime;
    else time = p.times[pos - 1];

    penalty = get_cutting_penalty(raceinfo, i);

    bl = best_lap(raceinfo, p.times, false);

    if (bl >= 2) {
      bl = get_lap_time(raceinfo, p.times, bl);

      while (penalty > bl && pos > raceinfo.firstlap) {
        penalty -= bl;
        pos -= raceinfo.normallap;
      }
    }

    time += penalty;

    order[n] = { index: i, position: pos, time: time };
    n++;
  }

  order.sort(compare_position_and_time);

  raceinfo.order = order;

  for (i in raceinfo.order) raceinfo.players[raceinfo.order[i].index].order = i;
}

function get_position(raceinfo, i, ti) {
  var t, t2, p, x;

  if (i in raceinfo.players && ti in raceinfo.players[i].times)
    t = raceinfo.players[i].times[ti];
  else t = 1000000000.0;

  p = 1;

  for (x in raceinfo.players) {
    x = raceinfo.players[x];
    if (ti in x.times) t2 = x.times[ti];
    else t2 = 1000000000.0;
    if (t2 >= 0.0 && t2 < t) p = p + 1;
  }

  return p;
}

function require_and_quote_string(obj, s, def) {
  if (!(s in obj)) obj[s] = def;

  obj[s] = htmlquote(obj[s]);
}

function sanitize_raceinfo(raceinfo) {
  var i, n, p, requiredints;

  if (!("time" in raceinfo)) raceinfo.time = 0;

  requiredints = ["firstlap", "normallap", "laps", "starttime", "time", "date"];

  for (i in requiredints) {
    i = requiredints[i];

    if (!(i in raceinfo)) throw 'Missing required variable "' + i + '"';

    n = parseInt(raceinfo[i]);

    if (isNaN(n)) throw '"' + i + '" is not a valid integer';

    raceinfo[i] = n;
  }

  require_and_quote_string(raceinfo, "longname", raceinfo.dir);

  if (!("dir" in raceinfo)) raceinfo.dir = "unknown";

  raceinfo.dir = escape_string(raceinfo.dir);

  for (p in raceinfo.players) {
    p = raceinfo.players[p];

    require_and_quote_string(p, "name", "Mystery Rider");
    require_and_quote_string(p, "bike", "???");
    require_and_quote_string(p, "number", "???");
    require_and_quote_string(p, "uid", "0");
  }
}

function parse_server_results(lines) {
  var readvars = 0,
    readplayers = 1,
    readtimes = 2;
  var l, s, t, v, slot, raceinfo, players, stage, timeidx, time;
  var requiredints = ["firstlap", "normallap", "time", "laps", "starttime"];

  raceinfo = {};
  players = [];

  stage = readvars;

  raceinfo.time = "0";

  for (l in lines) {
    s = lines[l];

    if (!s) break;

    if (stage == readvars) {
      if (s == "players:") {
        stage = readplayers;
      } else {
        v = get_var(s);

        if (v) raceinfo[v.name] = v.value;
      }
    } else if (stage == readplayers) {
      if (s == "times:") {
        stage = readtimes;
      } else {
        v = get_var(s);

        if (v.name == "slot") {
          slot = parseInt(v.value);
          if (isNaN(slot)) throw "Bad slot number";
          players[slot] = {
            slot: 0,
            uid: "0",
            number: "0",
            bike: "pw50",
            name: "",
            times: []
          };
          players[slot]["slot"] = slot;
        } else players[slot][v.name] = v.value;
      }
    } else if (stage == readtimes) {
      t = s.split(" ");

      if (t.length != 3) throw "Bad time";

      slot = parseInt(t[0]);
      timeidx = parseInt(t[1]);
      time = parseInt(t[2]);

      if (isNaN(slot) || isNaN(timeidx) || isNaN(time)) throw "Bad time";

      players[slot].times[timeidx] = time;
    }
  }

  for (t in requiredints) {
    t = requiredints[t];

    if (!(t in raceinfo)) throw "Missing required variable '" + t + "'";

    raceinfo[t] = parseInt(raceinfo[t]);

    if (isNaN(raceinfo[t])) throw "'" + t + "' is not a valid integer";
  }

  raceinfo.players = players;

  update_running_order(raceinfo);

  return raceinfo;
}
