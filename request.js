const encrypt = require('./crypto')
const crypto = require('crypto')
const axios = require('axios')
const fs = require('fs')
const config = {
  anonymous_token: 'bf8bfeabb1aa84f9c8c3906c04a04fb864322804c83f5d607e91a04eae463c9436bd1a17ec353cf780b396507a3f7464e8a60f4bbc019437993166e004087dd32d1490298caf655c2353e58daa0bc13cc7d5c198250968580b12c1b8817e3f5c807e650dd04abd3fb8130b7ae43fcc5b',
  resourceTypeMap: {
    '0': 'R_SO_4_',
    '1': 'R_MV_5_',
    '2': 'A_PL_0_',
    '3': 'R_AL_3_',
    '4': 'A_DJ_1_',
    '5': 'R_VI_62_',
    '6': 'A_EV_2_',
    '7': 'A_DR_14_'
  }
};

function request(url, method = "GET", data = null, contenttype = "application/x-www-form-urlencoded; charset=UTF-8", type = "", headers = {}) {
  const axiosConfig = {
    method: method,
    url: url,
    headers: {
      'Content-Type': contenttype,
      'x-requested-with': 'XMLHttpRequest',
      ...headers
    },
    data: data
  };
  if (url.indexOf("media\/outer") == -1) axiosConfig.headers["accept"] = "application/json, text/javascript, */*; q=0.01";

  return axios(axiosConfig)
    .then(response => {
      if (response.status === 200) {
        return {
          responseText: response.data,
          status: response.status,
          getResponseHeader: (q) => {
            return response.headers[q]
          }
        };
      } else {
        throw new Error('Request failed with status ' + response.status);
      }
    })
    .catch(error => {
      throw new Error('Request failed with error ' + error.message);
    });
}

function objToEncoded(object) {
  let str = ""
  for (ky in object) {
    if (str) str += "&";
    str += `${encodeURIComponent(ky)}=${encodeURIComponent(object[ky])}`;
  }
  return str;
}

function getCookie() {
  try {
    let l = fs.readFileSync("private\/cookie.txt", "utf-8");
    if (!l) return {};
    l = l.split("HTTPOnly;");
    let newx = [], res = {};
    for (x in l)
      (l[x] = l[x].split("; ")), (newx.push(l[x][0].split("=")));
    for (x in newx)
      res[newx[x][0]] = newx[x][1];
    return res;
  } catch (error) {
    return {};
  }
}

const chooseUserAgent = (ua = false) => {
  const userAgentList = {
    mobile: [
      // iOS 13.5.1 14.0 beta with safari
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.',
      // iOS with qq micromsg
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/602.1.50 (KHTML like Gecko) Mobile/14A456 QQ/6.5.7.408 V1_IPH_SQ_6.5.7_1_APP_A Pixel/750 Core/UIWebView NetType/4G Mem/103',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/7.0.15(0x17000f27) NetType/WIFI Language/zh',
      // Android -> Huawei Xiaomi
      'Mozilla/5.0 (Linux; Android 9; PCT-AL10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.64 HuaweiBrowser/10.0.3.311 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; U; Android 9; zh-cn; Redmi Note 8 Build/PKQ1.190616.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/12.5.22',
      // Android + qq micromsg
      'Mozilla/5.0 (Linux; Android 10; YAL-AL00 Build/HUAWEIYAL-AL00; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.62 XWEB/2581 MMWEBSDK/200801 Mobile Safari/537.36 MMWEBID/3027 MicroMessenger/7.0.18.1740(0x27001235) Process/toolsmp WeChat/arm64 NetType/WIFI Language/zh_CN ABI/arm64',
      'Mozilla/5.0 (Linux; U; Android 8.1.0; zh-cn; BKK-AL10 Build/HONORBKK-AL10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.126 MQQBrowser/10.6 Mobile Safari/537.36',
    ],
    pc: [
      // macOS 10.15.6  Firefox / Chrome / Safari
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:80.0) Gecko/20100101 Firefox/80.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.30 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Safari/605.1.15',
      // Windows 10 Firefox / Chrome / Edge
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.30 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/13.10586',
      // Linux 就算了
    ],
  }
  let realUserAgentList =
    userAgentList[ua] || userAgentList.mobile.concat(userAgentList.pc)
  return ['mobile', 'pc', false].indexOf(ua) > -1
    ? realUserAgentList[Math.floor(Math.random() * realUserAgentList.length)]
    : ua
}

const ncmRequest = (method, url, data = {}, options) => {
  return new Promise((resolve, reject) => {
    let headers = { 'User-Agent': chooseUserAgent(options.ua) }
    if (method.toUpperCase() === 'POST')
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (url.includes('music.163.com'))
      headers['Referer'] = 'https://music.163.com'
    let ip = options.realIP || options.ip || ''
    if (ip) {
      headers['X-Real-IP'] = ip
      headers['X-Forwarded-For'] = ip
    }
    // headers['X-Real-IP'] = '118.88.88.88'
    if (typeof options.cookie === 'object') {
      options.cookie = {
        ...options.cookie,
        __remember_me: true,
        NMTID: crypto.randomBytes(16).toString('hex'),
        _ntes_nuid: crypto.randomBytes(16).toString('hex'),
      }
      if (!options.cookie.MUSIC_U) {
        // 游客
        if (!options.cookie.MUSIC_A) {
          options.cookie.MUSIC_A = config.anonymous_token
        }
      }
      headers['Cookie'] = Object.keys(options.cookie)
        .map(
          (key) =>
            encodeURIComponent(key) +
            '=' +
            encodeURIComponent(options.cookie[key]),
        )
        .join('; ')
    } else if (options.cookie) {
      headers['Cookie'] = options.cookie
    } else {
      headers['Cookie'] = '__remember_me=true; NMTID=xxx'
    }
    if (options.crypto === 'weapi') {
      let csrfToken = (headers['Cookie'] || '').match(/_csrf=([^(;|$)]+)/)
      data.csrf_token = csrfToken ? csrfToken[1] : ''
      data = encrypt.weapi(data)
      url = url.replace(/\w*api/, 'weapi')
    } else if (options.crypto === 'linuxapi') {
      data = encrypt.linuxapi({
        method: method,
        url: url.replace(/\w*api/, 'api'),
        params: data,
      })
      headers['User-Agent'] =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
      url = 'https://music.163.com/api/linux/forward'
    } else if (options.crypto === 'eapi') {
      const cookie = options.cookie || {}
      const csrfToken = cookie['__csrf'] || ''
      const header = {
        osver: cookie.osver, //系统版本
        deviceId: cookie.deviceId, //encrypt.base64.encode(imei + '\t02:00:00:00:00:00\t5106025eb79a5247\t70ffbaac7')
        appver: cookie.appver || '8.9.70', // app版本
        versioncode: cookie.versioncode || '140', //版本号
        mobilename: cookie.mobilename, //设备model
        buildver: cookie.buildver || Date.now().toString().substr(0, 10),
        resolution: cookie.resolution || '1920x1080', //设备分辨率
        __csrf: csrfToken,
        os: cookie.os || 'android',
        channel: cookie.channel,
        ncmRequestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(4, '0')}`,
      }
      if (cookie.MUSIC_U) header['MUSIC_U'] = cookie.MUSIC_U
      if (cookie.MUSIC_A) header['MUSIC_A'] = cookie.MUSIC_A
      headers['Cookie'] = Object.keys(header)
        .map(
          (key) =>
            encodeURIComponent(key) + '=' + encodeURIComponent(header[key]),
        )
        .join('; ')
      data.header = header
      data = encrypt.eapi(options.url, data)
      url = url.replace(/\w*api/, 'eapi')
    }
    const answer = { status: 500, body: {}, cookie: [] }

    let type = "";
    request(url, method, objToEncoded(data), "application/x-www-form-urlencoded; charset=UTF-8", type, headers)
      .then((res) => {
        const body = res.responseText;
        const ckl = res.getResponseHeader("set-cookie");
        answer.cookie = ckl ? ckl.map((x) =>
          x.replace(/\s*Domain=[^(;|$)]+;*/, ''),
        ) : [];
        try {
          answer.body = JSON.parse(body)

          answer.status = answer.body.code || res.status
          if (
            [201, 302, 400, 502, 800, 801, 802, 803].indexOf(answer.body.code) >
            -1
          ) {
            // 特殊状态码
            answer.status = 200
          }
        } catch (e) {
          try {
            answer.body = JSON.parse(body.toString())
          } catch (err) {
            // can't decrypt and can't parse directly
            answer.body = body
          }
          answer.status = res.status
        }

        answer.status =
          100 < answer.status && answer.status < 600 ? answer.status : 400
        if (answer.status === 200) resolve(answer)
        else reject(answer)
      })
      .catch((err) => {
        answer.status = 502
        answer.body = { code: 502, msg: err }
        console.log(err)
        reject(answer)
      })

  })
}

const ncmApi = {
  combineArtists(ars) {
    let str = "";
    for (ar of ars) {
      if (str) str += ', ';
      str += ar.name;
    }
    return str;
  },

  async followAndGetRealID(fakeId) {
    try {
      const r = await axios("https://163cn.tv/" + fakeId)
      if (r && r.request.res.responseUrl) {
        return r.request.res.responseUrl.match(/[\?\&]id=(\d+)/)[1];
      } else {
        return null;
      }
    } catch {
      return null;
    }
  },

  cloudMatch(sid, asid, uid) {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {
      const data = {
        userId: uid,
        songId: sid,
        adjustSongId: asid,
      }
      ncmRequest(
        'POST',
        'https://music.163.com/api/cloud/user/song/match',
        data,
        {
          crypto: 'weapi',
          cookie: cookie,
        },
      )
        .then(e => {
          resolve(e.body);
        })
        .catch(() => reject());
    })
  },

  cloudSearch(keywords, limit = 30, offset = 0) {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {
      const data = {
        s: keywords,
        type: 1,
        limit,
        offset,
        total: true,
      }
      ncmRequest(
        'POST',
        `https://interface.music.163.com/eapi/cloudsearch/pc`,
        data,
        {
          crypto: 'eapi',
          cookie: cookie,
          url: '/api/cloudsearch/pc',
        },
      )
        .then(e => {
          resolve(e.body);
        })
        .catch(() => reject());

    })
  },
  likeList() {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {
      const data = {};
      ncmRequest('POST', `https://music.163.com/weapi/song/like/get`, data, {
        crypto: 'weapi',
        cookie: cookie,
      })
        .then(e => {
          resolve(e.body);
        })
        .catch(() => reject());
    })
  },

  userCloud(limit = 30, offset = 0) {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {
      const data = {
        limit,
        offset,
      }
      ncmRequest('POST',
        'https://music.163.com/api/v1/cloud/get',
        data, {
        crypto: 'weapi',
        cookie: cookie
      })
        .then(e => {
          resolve(e.body);
        })
        .catch(() => {
          reject();
        });
    })
  },

  songDetail(id) {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {
      const data = {
        c: `[{"id":${id}}]`
      }
      ncmRequest('POST', `https://music.163.com/api/v3/song/detail`, data, {
        crypto: 'weapi',
        cookie: cookie
      })
        .then(e => {
          resolve(e.body);
        })
        .catch(() => {
          reject();
        });
    })
  },
  songLyric(id) {
    return new Promise((resolve, reject) => {
      const query = { id: id, cookie: { os: "ios" } }

      const data = {
        id: query.id,
        tv: -1,
        lv: -1,
        rv: -1,
        kv: -1,
      }
      ncmRequest(
        'POST',
        `https://music.163.com/api/song/lyric?_nmclfl=1`,
        data,
        {
          crypto: 'api',
          cookie: query.cookie,
        }
      )
        .then(e => {
          resolve(e.body);
        })
        .catch(() => reject());
    })
  },
  songDLUrl(song) {
    const id = song.id;
    const fee = song.fee;
    const cookie = getCookie();
    return new Promise(async (resolve, reject) => {
      const respondWithVIP = () => {
        const data = {
          id: id,
          br: 320000,
        };
        ncmRequest(
          'POST',
          `https://interface.music.163.com/eapi/song/enhance/download/url`,
          data,
          {
            crypto: 'eapi',
            cookie: cookie,
            url: '/api/song/enhance/download/url',
          },
        )
          .then(e => {
            try {
              resolve(e.body.data.url.replace('http:', 'https:'));
            } catch {
              resolve(undefined);
            }
          })
      }
      if (fee != 1 && song.copyright != 0) {
        const r = await axios(`https://music.163.com/song/media/outer/url?id=${id}.mp3`)
        if (r && r.request.res.responseUrl && !r.request.res.responseUrl.endsWith("download")) {
          resolve(r.request.res.responseUrl.replace('http:', 'https:'));
          return;
        } else {
          respondWithVIP();
        }
      } else {
        respondWithVIP();
      }
    })
  },
  playlistTracks(id, limito = 50, offseto = 0) {
    const cookie = getCookie();
    return new Promise((resolve, reject) => {

      const data = {
        id: id,
        n: 100000,
        s: 8,
      }
      //不放在data里面避免请求带上无用的数据
      let limit = parseInt(limito) || Infinity
      let offset = parseInt(offseto) || 0

      ncmRequest('POST', `https://music.163.com/api/v6/playlist/detail`, data, {
        crypto: 'api',
        cookie: cookie,
      }).then((res) => {
        let trackIds = res.body.playlist.trackIds
        let idsData = {
          c:
            '[' +
            trackIds
              .slice(offset, offset + limit)
              .map((item) => '{"id":' + item.id + '}')
              .join(',') +
            ']',
        }

        ncmRequest(
          'POST',
          `https://music.163.com/api/v3/song/detail`,
          idsData,
          {
            crypto: 'weapi',
            cookie: cookie
          },
        )
          .then(e => {
            resolve(e.body);
          })
      })
        .catch(() => {
          reject();
        });

    })
  },
  userPlaylist(uid) {
    const cookie = getCookie();
    return new Promise(async (resolve, reject) => {
      try {
        const data = {
          uid,
          limit: 100000,
          offset: 0,
          includeVideo: true,
        }
        let result = await ncmRequest('POST', `https://music.163.com/api/user/playlist`, data, {
          crypto: 'weapi',
          cookie: cookie,
        })
        resolve(result.body);
      } catch (error) {
        reject();
      }
    })
  },
  loginStatus() {
    const cookie = getCookie();
    return new Promise(async (resolve, reject) => {
      try {
        const data = {}
        let result = await ncmRequest(
          'POST',
          `https://music.163.com/weapi/w/nuser/account/get`,
          data,
          {
            crypto: 'weapi',
            cookie: cookie,
          },
        )
        resolve({
          data: result.body,
        })
      } catch (error) {
        reject();
      }
    })
  },
  async loginQRCheck(key) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = {
          key: key,
          type: 1,
        }
        let result = await ncmRequest(
          'POST',
          `https://music.163.com/weapi/login/qrcode/client/login`,
          data,
          {
            crypto: 'weapi'
          }
        );
        resolve({
          ...result.body,
          cookie: result.cookie.join(';'),
        });
      } catch (error) {
        reject(error)
      }
    })
  },
  loginQRGet() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = {
          type: 1,
        }
        let e = await ncmRequest(
          'POST',
          `https://music.163.com/weapi/login/qrcode/unikey`,
          data,
          {
            crypto: 'weapi'
          }
        );
        resolve(e.body.unikey);
      } catch (error) {
        reject(error)
      }
    })
  }
};

module.exports = { ncmApi };
