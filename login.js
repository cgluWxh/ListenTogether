const ncmApi = require("./request.js").ncmApi;
const fs = require("fs");

ncmApi.loginQRGet().then((e) => {
    const ku = `https://music.163.com/login?codekey=${e}`;
    console.log("请制作二维码并扫描以登录网易云音乐", ku)
    const checkOnce = () => {
        ncmApi.loginQRCheck(e).then((statusRes) => {
            if (statusRes.code === 800) {
                console.log("二维码已过期");
                return;
            }
            if (statusRes.code === 802) {
                console.log("二维码已扫描，请在手机端确认登录");
            }
            if (statusRes.code === 803) {
                fs.writeFileSync("private\/cookie.txt", statusRes.cookie);
                console.log("登录成功，已保存cookie到cookie.txt");
                return;
            }
            setTimeout(checkOnce, 3000);
        });
    };
    checkOnce();
});