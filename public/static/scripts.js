const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());

const music = new Audio();
music.crossOrigin = "anonymous";
let swReg = null;
const ver = "1.2.5";

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(
            function (registration) {
                swReg = registration;
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            },
            function (err) {
                console.log('ServiceWorker registration failed: ', err);
            }
        );
}

if (window.devicePixelRatio >= 3)
    document.documentElement.style.fontSize = "80%";

let ctx2;

const wt = {
    speeches: [],
    playOne: false,
    playContinuous: false,
    processor: null,
    sampleRate: 44100,
    bufferSize: 8192,
    playing: false,
    addBuffer(buffer) {
        this.speeches.push(buffer);
        if (!this.playing) this.playAudio();
    },
    async playAudio() {
        if (this.playing) return;
        this.playing = true;
        let buffer = this.speeches.shift();
        while (buffer) {
            const audioBuf = ctx2.createBuffer(1, this.bufferSize, this.sampleRate);
            audioBuf.copyToChannel(new Float32Array(buffer), 0);
            const src = ctx2.createBufferSource();
            src.buffer = audioBuf;
            const gain = ctx2.createGain();
            gain.gain.value = app.settings.voiceGainValue || 10;
            src.connect(gain);
            gain.connect(ctx2.destination);
            src.start();
            const waitUntilEnded = () => new Promise(resolve => {
                src.onended = resolve;
            });
            await waitUntilEnded();
            buffer = this.speeches.shift();
        }
        this.playing = false;
    }
};

const msgHandler = {
    sendMessage(msg, type, notify = false) {
        if (notify && document.visibilityState === 'hidden' && swReg && app.settings.notifyEnabled) {
            swReg.showNotification(type == "error" ? "错误" : "提示", {
                body: msg,
                tag: "notify",
                renotify: true,
            });
            return;
        }
        if (app.panelChoice == 5 && type != "error") {
            if (!app.unreadMsgCount) app.toLastMsg(true);
        }
        if (type === "error") {
            Notiflix.Notify.failure(msg, {
                ID: "msgHandlerErr",
                zindex: 114515,
                cssAnimationStyle: "fade",
                showOnlyTheLastOne: false,
                opacity: "0.8",
                borderRadius: "15px",
            });
        } else if (type === "success") {
            Notiflix.Notify.success(msg, {
                ID: "msgHandlerSuccess",
                zindex: 114515,
                cssAnimationStyle: "fade",
                showOnlyTheLastOne: false,
                opacity: "0.8",
                borderRadius: "15px",
            });
        } else {
            Notiflix.Notify.info(msg, {
                ID: "msgHandlerInfo",
                zindex: 114515,
                cssAnimationStyle: "fade",
                clickToClose: true,
                showOnlyTheLastOne: false,
                opacity: "0.8",
                borderRadius: "15px",
            });
        }
    },
    confirm(msg, title, yes, no) {
        if (!title) title = "提示";
        if (!yes) yes = "确定";
        if (!no) no = "取消";
        return new Promise((res) => {
            Notiflix.Confirm.show(
                title,
                msg,
                yes,
                no,
                () => {
                    res(true);
                },
                () => {
                    res(false);
                },
                {
                    zindex: 114515,
                    titleColor: "black",
                    okButtonBackground: "#7199ae",
                    messageMaxLength: 1000,
                    plainText: false,
                }
            );
        });
    },
    info(msg, title, yes, type = "info") {
        if (!title) title = "提示";
        if (!yes) yes = "好";
        return new Promise((res) => {
            Notiflix.Report[type](
                title,
                msg,
                yes,
                () => {
                    res(true);
                },
                {
                    zindex: 114515,
                    titleColor: "black",
                    buttonBackground: "#7199ae",
                    svgSize: "30px",
                }
            );
        });
    },
    success(msg, title, yes) {
        if (!title) title = "提示";
        if (!yes) yes = "好";
        return this.info(msg, title, yes, "success");
    },
    failure(msg, title, yes) {
        if (!title) title = "错误";
        if (!yes) yes = "好";
        return this.info(msg, title, yes, "failure");
    },
    warning(msg, title, yes) {
        if (!title) title = "警告";
        if (!yes) yes = "好";
        return this.info(msg, title, yes, "warning");
    },
    prompt(msg, title, yes, no, placeholder = "") {
        if (!title) title = "提示";
        if (!yes) yes = "确定";
        if (!no) no = "取消";
        return new Promise(function (res) {
            Notiflix.Confirm.prompt(
                title,
                msg,
                placeholder,
                yes,
                no,
                (clientAnswer) => {
                    res(clientAnswer);
                },
                (clientAnswer) => {
                    res(null);
                },
                {
                    zindex: 114515,
                    titleColor: "black",
                    okButtonBackground: "#7199ae",
                }
            );
        });
    },
};

const app = Vue.createApp({
    template: document.getElementById("app").innerHTML,
    data() {
        return {
            lastReadMsg: null,
            progressAdjust: null,
            roomId: "default",
            server_status: false,
            socket: null,
            userName: null,
            myColor: "",
            colors: ["#b0bdc5de", "#a1c3e5de", "#f5deb3de", "#f6c193de", "#d9bdb0de", "#c1abd6de", "#bcc595de", "#80b0acde"],
            processor: null,
            play: false,
            users: [],
            id: null,
            panelChoice: 0,
            panelLast: null,
            searchInput: "",
            searchInput2: "",
            textMsg: "",
            panelData: [null, {
                songs: [],
                hasMore: false,
            }],
            musicExtra: {
                duration: null,
                lastLine: null,
                currentTime: null,
                playing: null,
                playList: [],
                playMode: "RS",
                timeOffset: 0,
                queuedNextSong: null,
                paused: false,
                lyricData: [],
                lyricLines: [],
                timedStop: null,
            },
            settings: {
                showTranslate: true,
                showRomaji: true,
                showLyrics: true,
                notifyEnabled: true,
                bluetoothLyrics: false,
                voiceGainValue: 10,
                musicGainValueOnVoice: 0.1,
            },
            voiceOngoing: false,
            allSpeaking: false,
            msgs: [],
        };
    },
    async mounted() {
	const d=new URLSearchParams(location.search);
        document.title = `一起听 v${ver}`
        this.settings = Object.assign(this.settings, await localforage.getItem("settings") || this.settings);
        this.userName = this.settings.userName || "";
        this.myColor = this.settings.myColor || "";
        this.roomId = d.get("roomId") || this.settings.roomId || this.roomId;
        this.panelChoice = 9999;
        navigator.mediaSession.setActionHandler('nexttrack', (e) => {
            this.toSong(1, true);
        })
        navigator.mediaSession.setActionHandler('previoustrack', (e) => {
            this.toSong(-1, true);
        })
        navigator.mediaSession.setActionHandler('seekto', (e) => {
            this.updateProgress(e.seekTime - music.currentTime, true);
        })
        navigator.mediaSession.setActionHandler('stop', (e) => {
            this.socket.disconnect();
        })
    },
    computed: {
        unreadMsgCount() {
            if (!this.msgs || this.msgs.length == 0) return 0;
            return this.msgs.length - this.lastReadMsg - 1;
        },
        musicProgress() {
            return (this.progressAdjust !== null) ? this.progressAdjust : (this.musicExtra.duration ? ((this.musicExtra.currentTime / this.musicExtra.duration)) : 0);
        },
        panel() {
            return this.panelData[this.panelChoice]
        },
        currentTimeDisplay() {
            return this.secondtoread(this.musicExtra.currentTime);
        },
        durationDisplay() {
            return this.secondtoread(this.musicExtra.duration);
        },
        timedStopStr() {
            if (this.musicExtra.timedStop) {
                const target = this.musicExtra.timedStop - this.musicExtra.timeOffset;
                const k = (target - new Date().getTime()) / 1000 / 60;
                if (k < 0) {
                    return "播完本首歌停止";
                } else {
                    return `于 ${this.genTime(target)} 停止播放`;
                }
            } else {
                return "设置定时停止播放";
            }
        },
        panelTitle() {
            switch (this.panelChoice) {
                case 0:
                    return "主页";
                case 1:
                    return "搜索结果";
                case 2:
                    return "添加歌曲";
                case 3:
                    return "播放列表";
                case 4:
                    return "语音对讲";
                case 5:
                    return `消息中心${this.unreadMsgCount > 0 ? ` (${this.unreadMsgCount})` : ""}`;
                case 9999:
                    return "加入房间";
            }
        },
    },
    watch: {
        voiceOngoing: {
            handler(newVal, oldVal) {
                if (newVal == oldVal) return;
                if (newVal) music.volume = this.settings.musicGainValueOnVoice || 0.1;
                else music.volume = 1;
            }
        },
        settings: {
            handler(newVal, oldVal) {
                if (newVal && !newVal.bluetoothLyrics) {
                    this.updateNowPlaying();
                }
                localforage.setItem("settings", JSON.parse(JSON.stringify(newVal)));
            },
            deep: true,
        },
        panelChoice: {
            handler(newVal, oldVal) {
                if (newVal == oldVal) return;
                if (newVal == 1 && oldVal == 2) this.panelLast = oldVal;
                else if (newVal == 2 && oldVal == 3) this.panelLast = oldVal;
                else if (newVal == 2 && oldVal == 1) this.panelLast = 3;
                else this.panelLast = null;
                if (newVal == 5) {

                    const bindCheckMsgs = () => {
                        setTimeout(() => {
                            const container = document.querySelector(".msgBox");
                            const containerRect = container.getBoundingClientRect();
                            const msgEles = container.querySelectorAll(".msg");
                            const checkMsgs = () => {
                                for (let i = this.lastReadMsg + 1; i < msgEles.length; i++) {
                                    const msgEleRect = msgEles[i].getBoundingClientRect();
                                    if (msgEleRect.top < containerRect.bottom) {
                                        this.lastReadMsg = i;
                                    } else {
                                        break;
                                    }
                                }
                            };
                            checkMsgs();
                            container.addEventListener("scroll", () => {
                                checkMsgs();
                            });
                            if (this.unreadMsgCount === 0) {
                                this.toLastMsg(false);
                                return;
                            } else {
                                this.scrollToElement(container, msgEles[this.lastReadMsg], -containerRect.height, false, "bottom");
                                return;
                            }
                        }, 200);
                    }
                    bindCheckMsgs();
                    document.removeEventListener("visibilitychange", bindCheckMsgs);
                    document.addEventListener("visibilitychange", bindCheckMsgs);



                }
            }
        }
    },
    methods: {
        doInitialize() {
            this.userName = this.userName.replace(/<(.|\n)*?>/g, '').trim() || "";
            if (!this.userName || !this.roomId || !this.myColor) {
                if (!/#[0-9a-fA-f]{6,8}/.test(this.myColor)) {
                    msgHandler.sendMessage("请正确填写颜色后重试", "error");
                    return;
                }
                msgHandler.sendMessage("请填写全部信息后重试", "error");
                return;
            }
            this.settings.userName = this.userName;
            this.settings.myColor = this.myColor;
            this.settings.roomId = this.roomId;
            ('Notification' in window) && Notification.requestPermission();
            ctx2 = new (window.AudioContext || window.webkitAudioContext)();
            this.socket = io();
            const socket = this.socket;
            (() => {
                socket.on('showMsg', async (data) => {
                    if (app.panelChoice == 5 && !app.unreadMsgCount) {
                        setTimeout(() => app.toLastMsg(true), 200);
                    }
                    if (!data.type || data.type != "error") this.msgs.push(data);
                    if (data.fromId == "system") {
                        msgHandler.sendMessage(data.msg, data.type, true);
                    } else {
                        if (data.fromId != this.id) {
                            msgHandler.sendMessage(`${data.from} 说: ${data.msg}`, 'info', true);
                        }
                    }
                });
                window.addEventListener('resize', () => {
                    if (this.panelChoice == 5 && !this.unreadMsgCount) this.toLastMsg(false);
                })

                socket.on('update_serverTime', (t) => {
                    // 当前时间+Offset = 服务器时间
                    // 服务器时间-Offset = 当前时间
                    this.musicExtra.timeOffset = t - (new Date().getTime());
                })

                socket.on('update_msgs', e => { this.msgs = e; this.lastReadMsg = e.length - 1; });

                socket.on('update_timedStop', e => {
                    this.musicExtra.timedStop = e;
                })

                socket.on('allow_voice', (data) => {
                    const user = data.id;
                    if (user == 'all') {
                        this.allSpeaking = true;
                    } else {
                        for (let i = 0; i < this.users.length; i++) {
                            const u = this.users[i];
                            if (u.id == user) {
                                u.speaking = true;
                            }
                        }
                    }
                    msgHandler.sendMessage("请讲...", "success");
                    this.voiceOngoing = true;
                    this.startRecording(user);
                })

                socket.on('update_playList', (data) => {
                    this.musicExtra.playList = data;
                })

                socket.on('update_playMode', (data) => {
                    this.musicExtra.playMode = data;
                })


                socket.on('update_playing', (data) => {
                    this.progressAdjust = null;
                    if (!data) {
                        if (!music.ended) {
                            this.musicExtra.queuedNextSong = "STOP";
                        } else {
                            this.musicExtra.playing = null;
                            this.socket.disconnect();
                        }
                        return;
                    }
                    if (!this.musicExtra.playing || this.musicExtra.playing.sessionId != data.sessionId) {
                        if (data.auto) {
                            const new_offset = music.duration - music.currentTime;
                            if (!music.ended && new_offset <= 5) {
                                // this.musicExtra.timeOffset -= Math.round(new_offset * 1000);
                                this.musicExtra.queuedNextSong = data;
                            } else {
                                this.playNow(data);
                            }
                        } else {
                            this.playNow(data);
                        }
                    } else {
                        this.musicExtra.playing = data;
                        if (data.paused) {
                            music.pause();
                        } else {
                            music.play();
                        }
                        this.adjustPlayTime(data);
                    }
                })

                socket.on('msg', async (data) => {
                    this.voiceOngoing = true;
                    wt.sampleRate = data.sampleRate;
                    wt.addBuffer(data.audio);
                    for (let i = 0; i < this.users.length; i++) {
                        const user = this.users[i];
                        if (user.id == data.from) {
                            user.speaking = true;
                        }
                    }
                    // wt.speech = [];
                    // wt.speech.push(data.audio);
                    // if (!this.play) {
                    //     this.play = true
                    //     for (let i = 0; i < this.users.length; i++) {
                    //         const user = this.users[i];
                    //         if (user.id == data.from) {
                    //             user.speaking = true;
                    //         }
                    //     }
                    //     const audioBlob = new Blob(wt.speech);
                    //     const audioUrl = URL.createObjectURL(audioBlob);
                    //     const audio = new Audio(audioUrl);
                    //     await audio.play();
                    //     this.play = false
                    // }
                });

                socket.on('stop', (data) => {
                    this.stopRecording();
                    this.voiceOngoing = false;
                    for (let i = 0; i < this.users.length; i++) {
                        const user = this.users[i];
                        user.speaking = false;
                    }
                    this.allSpeaking = false;
                });

                socket.on('connected', (data) => {
                    this.id = data;
                    socket.emit('initialize', { name: this.userName, roomId: this.roomId, color: this.myColor });
                    this.server_status = true;
                });

                socket.on('disconnect', (data) => {
                    this.server_status = false;
                });

                socket.on('list_user', (data) => {
                    this.users = data;
                });
            })(); // socket process

            // music player begin
            music.addEventListener('ended', () => {
                if (this.musicExtra.queuedNextSong === "STOP") {
                    this.musicExtra.playing = null;
                    this.musicExtra.queuedNextSong = null;
                    this.updateNowPlaying(null);
                    return;
                }
                if (this.musicExtra.queuedNextSong) {
                    this.playNow(this.musicExtra.queuedNextSong);
                    this.musicExtra.queuedNextSong = null;
                    return;
                }
                this.nextSong(true);
            });
            music.addEventListener('pause', (evt) => {
                this.updateNowPlaying();
                if (music.ended) return;
                this.musicExtra.paused = true;
                if (this.musicExtra.playing.paused) return;
                this.socket.emit('toggle_play_pause', music.paused);
            });
            music.addEventListener('play', () => {
                this.musicExtra.paused = false;
                if (!this.musicExtra.playing.paused) return;
                this.socket.emit('toggle_play_pause', music.paused);
            });
            let lastTime = 0;
            music.addEventListener('error', (evt) => {
                if (!navigator.onLine) return;
                if (new Date().getTime() - lastTime < 1000) return;
                lastTime = new Date().getTime();
                this.socket.emit('update_src');
            });
            music.addEventListener('timeupdate', (evt) => {
                this.musicExtra.duration = music.duration;
                this.musicExtra.paused = music.paused;
                if (!this.settings.showLyrics) return;
                const t = this.musicExtra.currentTime = music.currentTime;
                if (this.musicExtra.lyricData && this.musicExtra.lyricData.length) {
                    this.musicExtra.lyricLines = [];
                    for (let i = this.musicExtra.lyricData.length - 1; i >= 0; i--) {
                        const d = this.musicExtra.lyricData[i];
                        if (t > (d.time - 0.5)) {
                            if (i == this.musicExtra.lastLine) return;
                            if (this.musicExtra.lastLine !== null) this.musicExtra.lyricData[this.musicExtra.lastLine].active = false;
                            this.musicExtra.lastLine = i;
                            this.musicExtra.lyricData[i].active = true;
                            const lrc = this.musicExtra.lyricData[i].lrc || "";
                            if (this.settings.bluetoothLyrics && lrc) window.navigator.mediaSession.metadata.title = lrc;
                            setTimeout(() => {
                                const activeLine = document.querySelector(".lyricLineActive")
                                const container = document.querySelector(".lyrics");
                                if (!activeLine || !container) return;

                                this.scrollToElement(container, activeLine, -parseFloat(getComputedStyle(document.body).fontSize) * 6);
                            }, 300);
                            break;
                        }
                    }


                }
            });
            // music player end
            this.panelChoice = 0;
        },
        progressEvtProcessor(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.type == "touchstart" || e.type == "touchmove") {
                const rect = e.target.getBoundingClientRect();
                const x = e.touches[0].clientX - rect.left;
                e.offsetX = x;
            }
            let tmp = e.offsetX / e.target.offsetWidth;
            switch (e.type) {
                case "mousedown":
                case "touchstart":
                    if (Math.abs(tmp - this.musicProgress) < 0.1) {
                        this.progressAdjust = tmp;
                    }
                    break;
                case "mousemove":
                case "touchmove":
                    if (this.progressAdjust !== null) {
                        this.progressAdjust = tmp;
                    }
                    break;
                case "mouseup":
                case "touchend":
                    if (this.progressAdjust !== null) {
                        const newTime = music.duration * this.progressAdjust;
                        this.updateProgress(newTime - music.currentTime, true);
                    }
                    break;
            }
        },
        songListTo(q) {
            const container = document.querySelector(".overlay .cglbox-content");
            let qwq;
            switch (q) {
                case 0:
                    container.scrollTo({
                        left: 0,
                        top: 0,
                        behavior: "smooth",
                    });
                    break;
                case 1:
                    qwq = container.querySelector(".songbox.active");
                    if (!qwq) return;
                    this.scrollToElement(container, qwq, -parseFloat(getComputedStyle(document.body).fontSize) * 8, true);
                    break;
                case 2:
                    qwq = container.querySelectorAll(".songbox");
                    qwq = qwq[qwq.length - 1];
                    this.scrollToElement(container, qwq, 0, true);
                    break;
            }
        },
        async songListLoadMore() {
            if (!this.panel.hasMore) return;
            if (!await msgHandler.confirm("加载更多歌曲吗？")) return;
            if (this.panel.listType == "userCloud") {
                this.openUserCloud(30, this.panel.songs.length);
            } else {
                this.searchMusic(30, this.panel.songs.length);
            }
        },
        async openUserCloud(limit, offset) {
            if (!limit && !offset) (this.panelData[1].songs = []), (limit = 30), (offset = 0);
            msgHandler.sendMessage(`正在加载...`);
            let result = await fetch(`/api/userCloud/${limit}/${offset}`);
            result = await result.json();
            this.panelData[1].songs = this.panelData[1].songs.concat(result.data);
            this.panelData[1].hasMore = result.hasMore;
            this.panelData[1].listType = "userCloud";
            this.panelChoice = 1;
        },

        toLastMsg(smooth = true) {
            if (document.visibilityState === 'hidden') return;
            const msgs = document.querySelectorAll(".msg");
            const idx = msgs.length - 1;
            const lastMsg = msgs[idx];
            const container = document.querySelector(".msgBox");
            if (!lastMsg || !container) return;

            this.lastReadMsg = idx;
            this.scrollToElement(container, lastMsg, 0, smooth, "bottom");
        },
        scrollToElement(container, activeLine, offset = 0, smooth = true, position = "top") {
            const containerRect = container.getBoundingClientRect();
            const activeLineRect = activeLine.getBoundingClientRect();
            const scrollHeight = activeLineRect[position] - containerRect.top + container.scrollTop;
            container.scrollTo({
                top: scrollHeight + offset,
                left: 0,
                behavior: smooth ? "smooth" : "auto",
            });
        },
        genTime(time) {
            const t = new Date(time);
            const pad2 = (n) => n < 10 ? `0${n}` : n;
            return `${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
        },
        sendTextMsg() {
            this.textMsg = this.textMsg.trim();
            if (!this.textMsg) return;
            this.toLastMsg(true);
            this.socket.emit('send_text', this.textMsg);
            this.textMsg = "";
        },
        getMsgComputedClass(msg) {
            if (msg.fromId == "system") return "systemMsg";
            else if (msg.from == this.userName) return "selfMsg";
            else return "incomeMsg";
        },
        async updateTimedStop() {
            if (this.musicExtra.timedStop) {
                if (!await msgHandler.confirm("取消定时停止播放吗？")) return;
                this.socket.emit('update_timedStop', null);
            } else {
                let d = await msgHandler.prompt("请输入定时停止播放时间（单位：分钟）");
                d = parseFloat(d.trim());
                if (isNaN(d) || d < 0) {
                    msgHandler.sendMessage("输入不合法", "error");
                    return;
                }
                this.socket.emit('update_timedStop', d);
            }
        },
        refreshCache() {
            caches.delete("ListenTogetherv0-Main").then(() => location.reload());
        },
        async recognizeShareLink() {
            const copied = this.searchInput2.trim();
            if (!copied) return;
            let match;
            if (/^[0-9]+$/.test(copied)) {
                match = [null, copied];
            } else {
                match = copied.match(/[\?\&]id=([0-9]+)/);
            }
            if (!match) {
                match = copied.match(/https?:\/\/163cn\.tv\/([0-9a-zA-Z]+)/);
            }
            if (match) {
                const id = match[1];
                if (!await msgHandler.confirm(`确定将 ID 为 ${id} 的音乐添加到播放列表吗？`)) return;
                this.searchInput2 = "";
                msgHandler.sendMessage("正在提交请求...");
                this.socket.emit('add_to_queue', id);
            } else {
                msgHandler.sendMessage("无效的分享链接", "error");
            }
        },
        async removeFromQueue(song, evt) {
            evt.preventDefault();
            evt.stopPropagation();
            if (!await msgHandler.confirm(`确定从播放列表中移除 ${song.name} 吗？`)) return;
            msgHandler.sendMessage(`正在提交请求...`);
            this.socket.emit('remove_from_queue', song);
        },
        async randomizePlayList() {
            if (!await msgHandler.confirm(`确定随机化播放列表吗？`)) return;
            msgHandler.sendMessage(`正在提交请求...`);
            this.socket.emit('randomize_play_list');
        },
        async switchPlayMode() {
            const nextMode = this.musicExtra.playMode == "RS" ? "OD" : "RS";
            if (!await msgHandler.confirm(`确定调整播放模式为 ${nextMode == "OD" ? "顺序播放" : "单曲循环"} 吗？`)) return;
            msgHandler.sendMessage(`正在提交请求...`);
            this.socket.emit('update_playMode', nextMode);
        },
        async updateProgress(e, direct = false) {
            if (!direct && !await msgHandler.confirm(`确定调整进度 ${e} 吗？`)) return;
            msgHandler.sendMessage(`正在提交请求...`);
            this.socket.emit('update_progress', e);
        },
        toSong(e, direct = false) {
            if (!this.musicExtra.playing) return;
            let idx = this.musicExtra.playList.findIndex((s) => s.id == this.musicExtra.playing.id);
            idx += e;
            if (idx < 0) {
                idx += this.musicExtra.playList.length;
            } else if (idx >= this.musicExtra.playList.length) {
                idx -= this.musicExtra.playList.length;
            }
            this.requestPlayNow(this.musicExtra.playList[idx], direct);
        },
        async togglePlayPause() {
            if (!await msgHandler.confirm(`确定${music.paused ? "播放" : "暂停"}吗？`)) return;
            msgHandler.sendMessage(`正在提交请求...`);
            this.socket.emit('toggle_play_pause', !music.paused);
        },
        async fetchLyrics() {
            if (!this.musicExtra.playing) return;
            let lyrics = await fetch(`/api/getLyric/${this.musicExtra.playing.id}`);
            lyrics = await lyrics.json();
            lyrics = lyrics.data;
            this.musicExtra.lastLine = null;
            this.musicExtra.lyricData = [];
            try {
                let lrcOri = lyrics.lrc.lyric;
                lrcOri = lrcOri.split("\n");
                for (let i = 0; i < lrcOri.length; i++) {
                    const row = lrcOri[i];
                    const d = row.match(/\[(\d+):(\d+)\.(\d+)\](.+)/);
                    if (d && d[1]) {
                        let t =
                            parseInt(d[1]) * 60 +
                            parseInt(d[2]) +
                            parseInt(d[3]) / Math.pow(10, parseInt(d[3].length));
                        if (t == 99 * 60) t = 0;
                        if (d[4] && d[4].trim())
                            this.musicExtra.lyricData.push({ time: t, lrc: d[4].trim() });
                    }
                }
                if (!this.musicExtra.lyricData.length)
                    this.musicExtra.lyricData.push({ time: 0, lrc: "No lyrics" });
                else {
                    if (this.musicExtra.lyricData[0].time !== 0) {
                        this.musicExtra.lyricData.unshift({
                            time: 0,
                            lrc: `${this.musicExtra.playing.name} - ${this.musicExtra.playing.artists}`,
                        });
                    }
                    if (lyrics.tlyric) {
                        lrcOri = lyrics.tlyric.lyric;
                        lrcOri = lrcOri.split("\n");
                        for (let i = 0; i < lrcOri.length; i++) {
                            const row = lrcOri[i];
                            const d = row.match(/\[(\d+):(\d+)\.(\d+)\](.+)/);
                            if (d && d[1]) {
                                const t =
                                    parseInt(d[1]) * 60 +
                                    parseInt(d[2]) +
                                    parseInt(d[3]) / Math.pow(10, parseInt(d[3].length));
                                if (d[4] && d[4].trim()) {
                                    const idx = this.musicExtra.lyricData.findIndex((e) => e.time == t);
                                    if (idx > -1) this.musicExtra.lyricData[idx].translate = d[4].trim();
                                }
                            }
                        }
                    }
                    if (lyrics.romalrc) {
                        lrcOri = lyrics.romalrc.lyric;
                        lrcOri = lrcOri.split("\n");
                        for (let i = 0; i < lrcOri.length; i++) {
                            const row = lrcOri[i];
                            const d = row.match(/\[(\d+):(\d+)\.(\d+)\](.+)/);
                            if (d && d[1]) {
                                const t =
                                    parseInt(d[1]) * 60 +
                                    parseInt(d[2]) +
                                    parseInt(d[3]) / Math.pow(10, parseInt(d[3].length));
                                if (d[4] && d[4].trim()) {
                                    const idx = this.musicExtra.lyricData.findIndex((e) => e.time == t);
                                    if (idx > -1) this.musicExtra.lyricData[idx].romaji = d[4].trim();
                                }
                            }
                        }
                    }
                }
            } catch {
                this.musicExtra.lyricData = [{ time: 0, lrc: "无歌词" }];
            }
        },
        async playNow(data) {
            music.src = data.url;
            this.musicExtra.playing = data;
            if (!data.paused) music.play();
            await this.fetchLyrics()
            this.updateNowPlaying(data);
            this.adjustPlayTime(data);
        },
        updateNowPlaying(data = "default") {
            if (!data) {
                window.navigator.mediaSession.metadata = null;
                document.title = `一起听 v${ver}`;
            }
            if (data == "default") data = this.musicExtra.playing;
            if (!data) return;
            document.title = `${data.name ?? "unknown"} - ${data.artists ?? "unknown"} - 一起听 v${ver}`;
            window.navigator.mediaSession.metadata = new MediaMetadata({
                title: data.name ?? "unknown",
                artist: data.artists ?? "unknown",
                album: data.album ?? `一起听 v${ver}`,
                artwork: [
                    {
                        src: this.musicExtra.playing.cover.replace('http://', 'https://') ?? "",
                        // sizes: `512x512`,
                        type: "image/png",
                    },
                ],
            });
        },
        adjustPlayTime(data) {
            if (!data) data = this.musicExtra.playing;
            let t = data.paused ? (data.paused - (data.startTime - this.musicExtra.timeOffset)) : (new Date().getTime() - (data.startTime - this.musicExtra.timeOffset));
            t /= 1000;
            if (t >= 0) {
                if (t > music.duration) {
                    this.nextSong(true);
                } else if (Math.abs(t - music.currentTime) > 0.5) {
                    music.currentTime = t;
                }
            } else {
                music.currentTime = 0;
            }
        },
        async requestPlayNow(song, direct = false) {
            if (!direct && !await msgHandler.confirm(`确定现在就播放 ${song.name} 吗？`)) return;
            msgHandler.sendMessage(`已提交请求...`);
            this.socket.emit('request_play', song);
        },
        secondtoread(e) {
            if (!e) return "00:00";
            return `${Math.floor(e / 60) < 10 ? "0" : ""}${Math.floor(e / 60)}:${parseInt(Math.floor(e)) % 60 < 10 ? "0" : ""
                }${parseInt(Math.floor(e)) % 60}`;
        },
        nextSong(auto = false) {
            this.socket.emit('next_song', Object.assign(this.musicExtra.playing, { auto }));
        },
        async tryAdjustCloud(idx, song, evt) {
            if (this.panel.listType != "userCloud") return;
            evt.preventDefault();
            const sid = song.id;
            const asid = await msgHandler.prompt(`请输入欲绑定到 ${song.name}(${song.id}) 的新 ID，如果您不知道您在做什么，请取消`);
            if (!asid) return;
            // modify me
            try {
                let adjustResult = await fetch(`/api/userCloudAdjust/${sid}/${asid}/326196924`);
                adjustResult = await adjustResult.json();
                if (adjustResult.code != 0) throw new Error();
                this.panelData[1].songs[idx] = adjustResult.data;
                msgHandler.sendMessage("绑定成功", "success");
            } catch (e) {
                console.log(e);
                msgHandler.sendMessage("绑定失败", "error");
            }
        },
        async searchMusic(limit, offset) {
            if (!limit && !offset) {
                this.searchInput = this.searchInput.trim();
                if (!this.searchInput) return;
                this.panelData[1].songs = [];
                msgHandler.sendMessage(`正在搜索 ${this.searchInput}...`);
                limit = 30;
                offset = 0;
            } else {
                msgHandler.sendMessage(`正在加载更多...`);
            }
            let result = await fetch(`/api/cloudSearch/${this.searchInput}/${limit}/${offset}`);
            result = await result.json();
            this.panelData[1].songs = this.panelData[1].songs.concat(result.data);
            this.panelData[1].hasMore = result.hasMore;
            this.panelData[1].listType = "searchResult";
            this.panelChoice = 1;
        },
        async addToQueue(song) {
            if (!await msgHandler.confirm(`确定将 ${song.name} 添加到队列吗？`)) return;
            msgHandler.sendMessage(`已提交请求...`);
            this.socket.emit('add_to_queue', song);
        },
        recordingUI(user) {
            if (user == this.id) {
                msgHandler.sendMessage("不能和自己对讲", "error");
                return;
            }
            if (this.voiceOngoing) {
                if (!wt.stream) {
                    msgHandler.sendMessage("您正在收听讲话，无法发起对讲", "error");
                    return;
                }
                this.voiceOngoing = false;
                this.socket.emit('endvoice');
                this.stopRecording();
            } else {
                msgHandler.sendMessage(`正在请求对讲...`);
                this.socket.emit('request_voice', user);
            }
        },
        async startRecording(user) {
            let send = {};
            let input = null;
            let context = new AudioContext();
            navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    autoGainControl: false,
                    noiseSupperssion: true,
                    latency: 0.25
                },
                video: false,
            }).then(async (stream) => {
                wt.stream = stream
                input = context.createMediaStreamSource(stream);

                wt.processor = context.createScriptProcessor(wt.bufferSize, 1, 1);

                input.connect(wt.processor);
                wt.processor.connect(context.destination)

                wt.processor.onaudioprocess = async (e) => {
                    const voice = await e.inputBuffer.getChannelData(0)
                    send.user_id = user;
                    send.from = this.id;
                    send.audio = await voice.buffer;
                    send.sampleRate = context.sampleRate;
                    await this.socket.emit('send_message', send);
                }
            }).catch((e) => {
                console.log(e)
            })
        },
        stopRecording() {
            this.voiceOngoing = false;
            if (wt.processor) {
                wt.processor.disconnect()
                wt.processor.onaudioprocess = null
                wt.processor = null
            }
            if (wt.stream) {
                wt.stream.getTracks().forEach(track => track.stop())
                wt.stream = null
            }
        }
    }
}).mount("#app");
