const express = require('express'), https = require('https'), socketIo = require('socket.io'), path = require('path'), fs = require('fs'), crypto = require("crypto"), ncmApi = require('./request').ncmApi;

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

var privateKey = fs.readFileSync(path.join(__dirname, 'private', 'server.key'));
var certificate = fs.readFileSync(path.join(__dirname, 'private', 'server.crt'));
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = https.createServer({key: privateKey, cert: certificate}, app);
const port = 11813;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const toArrayBuffer = (bufferIn) => {
  const itr = bufferIn.values();
  const buf = new Array(bufferIn.length);
  let bufferArray = [];
  for (var i = 0; i < buf.length; i++) {
    buf[i] = itr.next().value;
  }
  bufferArray = bufferArray.concat(buf);

  const buffer = new ArrayBuffer(bufferArray.length)
  const view = new Uint8Array(buffer)
  for (var i = 0; i < buf.length; i++) {
    view[i] = buf[i]
  }
  return buffer
}

const genPlayListItem = (song, cloudSong) => {
  const ret = {
    id: song.id,
    name: song.name,
    artists: ncmApi.combineArtists(song.ar),
    cover: song.al.picUrl,
    album: song.al.name,
    fee: song.fee,
    copyright: song.copyright
  };
  if (cloudSong) {
    if (!ret.name) ret.name = cloudSong.songName || ret.fileName;
    if (!ret.artists) ret.artists = cloudSong.artist || "未知艺术家";
    if (!ret.album) ret.album = cloudSong.album || "未知专辑";
    ret.copyright = 0;
  }
  return ret;
}

class AsyncLock {
  constructor() {
    this._locked = false;
  }

  lock() {
    return new Promise((resolve, reject) => {
      if (!this._locked) {
        this._locked = true;
        resolve();
      } else {
        setTimeout(() => {
          this.lock().then(resolve).catch(reject);
        }, 100);
      }
    });
  }

  unlock() {
    this._locked = false;
  }
}

const io = socketIo(server);

class Room {
  get persist() {
    if (this.id) {
      if (this.id === "default" || this.id.endsWith("keep"))
        return true;
      else
        return false;
    } else {
      return false;
    }
  }
  constructor(id) {
    this.id = id;
    this.numConn = 0;
    this.users = [];
    this.playList = [];
    this.msgs = [];
    this.playing = null;
    this.playMode = "OD";
    this.connections = new Map();
    this.msgLock = new AsyncLock();
    this.roomLock = new AsyncLock();
    this.roomVoiceOpLock = new AsyncLock();
    this.allVoiceLock = false;
    this.timedStop = null;
  }

  emit(tag, data, except) {
    const d = async () => {
      if (tag && tag === "update_playList") {
        if (this.persist) {
          listSaved[this.id] = this.playList;
          await listSavedLock.lock();
          fs.writeFileSync(path.join(__dirname, 'private', 'lastPlayList.json'), JSON.stringify(listSaved));
          listSavedLock.unlock();
        }
      }
    };
    d();
    this.connections.forEach((conn, id) => {
      if (except && except == id) return;
      conn.emit(tag, data);
    });
  }

  async updatePlaying(song, auto = false, forceUpdateSrc = false) {
    const copied = JSON.parse(JSON.stringify(song));
    copied.startTime = new Date().getTime();
    copied.sessionId = generateUUID();
    copied.auto = auto;
    copied.paused = false;
    if (forceUpdateSrc || !this.playing || this.playing.id != copied.id) {
      copied.url = await ncmApi.songDLUrl(copied);
    } else {
      copied.url = this.playing.url;
    }
    this.playing = copied;
    this.emit('update_serverTime', new Date().getTime());
    this.emit('update_playing', this.playing);
  }

  async showMsg(msg, to) {
    await this.msgLock.lock();
    if (!to) to = this;
    if (!msg.time) msg.time = new Date().getTime();
    if (!msg.fromId) msg.fromId = "system";
    if (!msg.from) msg.from = "系统消息";
    if (!msg.type || msg.type != "error") {
      this.msgs.push(msg);
      if (this.msgs.length > 100) this.msgs.shift();
    }
    to.emit('showMsg', msg);
    this.msgLock.unlock();
  }
}

const rooms = new Map();
let roomDefault = new Room("default");
rooms.set(roomDefault.id, roomDefault);
const listSavedLock = new AsyncLock();
const listSaved = JSON.parse(fs.readFileSync(path.join(__dirname, 'private', 'lastPlayList.json'), 'utf-8'));

roomDefault.playList = listSaved["default"];
// modify me

io.on('connection', (socket) => {
  let room;

  const currentUser = {
    id: socket.id,
    name: '',
    voiceLock: false,
    targetUser: null,
    color: null,
  };

  socket.emit('connected', socket.id);

  socket.on('initialize', (data) => {
    if (!data.roomId) {
      data.roomId = "default";
    }
    if (rooms.has(data.roomId)) {
      room = rooms.get(data.roomId);
    } else {
      room = new Room(data.roomId);
      rooms.set(room.id, room);
      if (room.persist && listSaved[room.id]) room.playList = listSaved[room.id];
    }

    currentUser.name = data.name;
    currentUser.color = data.color;
    room.users.push(currentUser);
    room.connections.set(currentUser.id, socket);

    ++room.numConn;

    room.emit('list_user', room.users);
    socket.emit('update_serverTime', new Date().getTime());
    socket.emit('update_timedStop', room.timedStop);
    if (room.playing) socket.emit('update_playing', room.playing);
    socket.emit('update_playList', room.playList);
    socket.emit('update_playMode', room.playMode);
    socket.emit('update_msgs', room.msgs);
    room.showMsg({ msg: `${currentUser.name} 已加入`, type: "info" });
  });

  socket.on('update_src', () => {
    if(!room) return;
    room.updatePlaying(room.playing, false, true);
  })

  socket.on('update_startTime', (e) => {
    if(!room) return;
    room.playing.startTime = e;
    room.emit('update_playing', room.playing);
  })

  socket.on('update_timedStop', async e => {
    if(!room) return;
    await room.roomLock.lock();
    if (e) {
      room.timedStop = new Date().getTime() + e * 1000 * 60;
      socket.emit('update_timedStop', room.timedStop);
      room.showMsg({ msg: `${currentUser.name} 已设置 ${e} 分钟后停止播放`, type: "info" }, socket)
    } else {
      room.timedStop = null;
      socket.emit('update_timedStop', room.timedStop);
      room.showMsg({ msg: `${currentUser.name} 已取消定时停止播放`, type: "info" }, socket)
    }
    room.roomLock.unlock();
    return;
  })

  socket.on('request_voice', async id => {
    if(!room) return;
    await room.roomVoiceOpLock.lock();
    if (id === 'all') {
      if (room.allVoiceLock) {
        room.showMsg({ msg: "全体语音通道被占用", type: "error" }, socket);
        room.roomVoiceOpLock.unlock();
        return;
      }
      room.allVoiceLock = true;
      currentUser.voiceLock = true;
      currentUser.targetUser = 'all';
      socket.emit('allow_voice', { id: 'all' });
    } else {
      if (room.allVoiceLock) {
        room.showMsg({ msg: "语音通道被占用", type: "error" }, socket);
        room.roomVoiceOpLock.unlock();
        return;
      }
      const targetUser = room.users.find(e => e.id === id);
      if (targetUser.voiceLock) {
        room.showMsg({ msg: "目标用户语音通道被占用", type: "error" }, socket);
        room.roomVoiceOpLock.unlock();
        return;
      }
      targetUser.voiceLock = true;
      targetUser.targetUser = currentUser.id;
      currentUser.voiceLock = true;
      currentUser.targetUser = id;
      socket.emit('allow_voice', targetUser);
    }
    room.roomVoiceOpLock.unlock();
    return;
  })

  socket.on('send_text', async e => {
    if(!room) return;
    const msg = {
      from: currentUser.name,
      fromId: currentUser.id,
      msg: e,
      color: currentUser.color,
      time: new Date().getTime(),
    }
    room.showMsg(msg);
  })

  const endvoice = async () => {
    if(!room) return;
    await room.roomVoiceOpLock.lock();
    if (currentUser.targetUser == 'all') {
      room.allVoiceLock = false;
      room.emit('stop');
    } else if (currentUser.targetUser) {
      const targetUser = room.users.find(e => e.id === currentUser.targetUser);
      if (targetUser) { 
        targetUser.voiceLock = false;
        io.to(targetUser.id).emit('stop');
      }
    }
    currentUser.voiceLock = false;
    currentUser.targetUser = null;
    socket.emit('stop');
    room.roomVoiceOpLock.unlock();
    return;
  };
  socket.on('endvoice', endvoice);

  socket.on('send_message', (data) => {
    if(!room) return;
    data.audio = toArrayBuffer(data.audio);
    if (data.user_id != 'all') {
      io.to(data.user_id).emit('msg', data);
    } else {
      room.emit('msg', data, currentUser.id);
    }
  })

  socket.on('update_playMode', async (e) => {
    if(!room) return;
    await room.roomLock.lock();
    room.playMode = e;
    room.showMsg({ msg: `${currentUser.name} 切换播放模式为 ${e == "OD" ? "顺序播放" : "单曲循环"}`, type: "info" })
    room.emit('update_playMode', e);
    room.roomLock.unlock();
  })

  socket.on('remove_from_queue', async (data) => {
    if(!room) return;
    await room.roomLock.lock();
    const list = room.playList;
    if (list.length === 1) {
      room.showMsg({ msg: "播放列表至少要有一首歌曲", type: "error" }, socket);
      room.roomLock.unlock();
      return;
    }
    const idx2 = room.playing ? list.findIndex(
      (e) => e.id === room.playing.id
    ) : -1;
    const idx = room.playList.findIndex(e => e.id === data.id);
    if (room.playList[idx]) {
      const d = room.playList;
      if (idx === idx2) {
        let next = idx2 + 1;
        if (next >= d.length) next -= d.length;
        room.updatePlaying(list[next], false);
      }
      d.splice(idx, 1);
      room.playList = d;
      room.showMsg({ msg: `${currentUser.name} 已从播放列表移除 ${data.name}`, type: "info" })
      room.emit('update_playList', room.playList);
    }
    room.roomLock.unlock();
  });

  socket.on('update_progress', async (e) => {
    if(!room) return;
    await room.roomLock.lock();
    if (!room.playing) return;
    room.playing.startTime -= (e * 1000);
    room.emit('update_serverTime', new Date().getTime());
    room.emit('update_playing', room.playing);
    room.roomLock.unlock();

  })

  socket.on('toggle_play_pause', async (e) => {
    if(!room) return;
    await room.roomLock.lock();
    if (!room.playing) return;
    if (e) {
      if (!room.playing.paused)
        room.playing.paused = new Date().getTime();
    } else {
      if (room.playing.paused) {
        const pauseTime = new Date().getTime() - room.playing.paused;
        room.playing.startTime += pauseTime;
        room.playing.paused = false;
      }
    }
    room.emit('update_serverTime', new Date().getTime());
    room.emit('update_playing', room.playing);
    room.showMsg({ msg: `${currentUser.name} ${e ? '暂停' : '开始'}了播放` })
    room.roomLock.unlock();
  })

  socket.on('add_to_queue', async (data) => {
    if(!room) return;
    await room.roomLock.lock();
    let full = data;
    if (typeof full === "string") {
      try {
        if (!/^[0-9]+$/.test(full)) {
          // get true url
          full = await ncmApi.followAndGetRealID(full);
        }
        full = (await ncmApi.songDetail(full)).songs[0];
        full = genPlayListItem(full);
      } catch {
        room.roomLock.unlock();
        room.showMsg({ msg: "无法获取歌曲信息", type: "error" }, socket);
        return;
      }
    }
    if (room.playing) {
      const idx = room.playList.findIndex(
        (e) => e.id === room.playing.id
      );
      const idx2 = room.playList.findIndex((e) => e.id === full.id);
      if (idx2 == -1) {
        if (idx > -1) {
          const front = room.playList.slice(0, idx + 1);
          const tail = room.playList.slice(idx + 1);
          front.push(full);
          const res = front.concat(tail);
          room.playList = res;
        } else {
          room.playList.push(e);
        }
      } else {
        room.showMsg({ msg: "该歌曲已在播放列表", type: "error" }, socket);
        room.roomLock.unlock();
        return;
      }
    } else {
      room.playList.unshift(full);
      room.updatePlaying(full);
    }
    room.showMsg({ msg: `${currentUser.name} 已将 ${full.name} 添加到播放列表`, type: "info" });
    room.emit('update_playList', room.playList);
    room.emit('update_playing', room.playing);
    room.roomLock.unlock();
  })

  socket.on('request_play', async (data) => {
    if(!room) return;
    await room.roomLock.lock();
    room.updatePlaying(data, false);
    room.showMsg({ msg: `${currentUser.name} 播放了 ${data.name}`, type: "info" });
    room.roomLock.unlock();
  })

  socket.on('randomize_play_list', async () => {
    if(!room) return;
    await room.roomLock.lock();
    room.playList = room.playList
      .map(function (m) {
        return Object.assign({
          score: Math.random()
        }, m);
      })
      .sort(function (a, b) {
        return a.score - b.score;
      })
      .map(function (m) {
        delete m.score;
        return m;
      });
    room.showMsg({ msg: `${currentUser.name} 随机了播放列表`, type: "info" });
    room.emit('update_playList', room.playList);
    room.roomLock.unlock();
  })

  socket.on('next_song', async data => {
    if(!room) return;
    await room.roomLock.lock();
    if (!room.playing) return;
    if (data.sessionId != room.playing.sessionId) {
      room.roomLock.unlock();
      return;
    }
    // auto stop
    if (room.timedStop && new Date().getTime() > room.timedStop) {
      room.playing = null;
      room.timedStop = null;
      room.emit('update_timedStop', room.timedStop);
      room.emit('update_playing', room.playing);
      room.roomLock.unlock();
      return;
    }
    const list = room.playList;
    const playingid = room.playing.id;
    const idx = list.findIndex(
      (e) => e.id == playingid
    );
    let next;
    let mode = room.playMode;
    switch (mode) {
      case "RS":
        next = idx;
        break;
      case "OD":
        next = idx + 1;
        if (next >= list.length) {
          next -= list.length;
        }
        break;
    }
    room.updatePlaying(list[next], data.auto);
    room.roomLock.unlock();
  })

  socket.on('disconnect', async () => {
    if (!room) return;
    if (currentUser.voiceLock) {
      await endvoice();
    }
    --room.numConn;
    room.connections.delete(currentUser.id);
    if (room.numConn == 0 && !room.persist) {
      setTimeout(() => {
        if (room.numConn == 0)
          rooms.delete(room.id);
      }, 10000); // 10秒后无人重连则删除房间
    }

    for (let i = 0; i < room.users.length; i++) {
      if (room.users[i].id == socket.id) {
        room.users.splice(i, 1);
      }
    }
    room.showMsg({ msg: `${currentUser.name} 已离开`, type: "info" })
    room.emit('list_user', room.users);
  });


});

app.get('/api/cloudSearch/:name/:limit/:offset', (req, res) => {
  const name = req.params.name;
  const limit = parseInt(req.params.limit);
  const offset = parseInt(req.params.offset);
  ncmApi.cloudSearch(name, limit, offset).then(data => {
    const d = data.result.songs.map(song => {
      return genPlayListItem(song);
    });
    res.json({ code: 0, data: d, hasMore: (limit + offset < data.result.songCount) });
  }).catch(err => {
    res.json({ code: -1, msg: err })
  }).finally(() => {
    res.end();
  });
});

app.get('/api/getLyric/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const lrc = await ncmApi.songLyric(id);

    res.json({
      data: lrc,
      code: 0,
    });
  } catch (err) {
    res.json({
      code: -1,
      msg: err
    });
  }
  res.end();
});

app.get('/api/userCloud/:limit/:offset', async (req, res) => {
  try {
    const limit = req.params.limit;
    const offset = req.params.offset;
    let cloudcontent = await ncmApi.userCloud(limit, offset);
    const hasMore = cloudcontent.hasMore;
    cloudcontent = cloudcontent.data.map(e => {
      return genPlayListItem(e.simpleSong, e);
    });

    res.json({
      data: cloudcontent,
      code: 0,
      hasMore,
    });
  } catch (err) {
    res.json({
      code: -1,
      msg: err
    });
  }
  res.end();
});

app.get('/api/userCloudAdjust/:sid/:asid/:uid', async (req, res) => {
  try {
    const sid = req.params.sid;
    const asid = req.params.asid;
    const uid = req.params.uid;
    const result = await ncmApi.cloudMatch(sid, asid, uid);
    if (result.code !== 200) throw new Error(result.message);

    res.json({
      data: genPlayListItem(result.matchData.simpleSong, result.matchData),
      code: 0,
    });
  } catch (err) {
    res.json({
      code: -1,
      msg: err
    });
  }
  res.end();
});
