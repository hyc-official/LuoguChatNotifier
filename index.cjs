const notifier = require("node-notifier");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const rl = require("readline");
const dl = require("download");
const opn = require("opn");

const rli = rl.createInterface({input: process.stdin, output: process.stdout});

let cache = {};
if (fs.existsSync("cache/cache.json")) {
    cache = JSON.parse(fs.readFileSync("cache/cache.json"));
}

async function notify(msg) {
    const uid = msg.sender.uid;
    if (!cache[uid] || cache[uid] < (new Date().getTime()) - 86400000) {
        console.log("Downloading avatar of", uid);
        let data = await dl(`https://cdn.luogu.com.cn/upload/usericon/${uid}.png`);
        if (!fs.existsSync("cache")) {
            fs.mkdirSync("cache");
        }
        fs.writeFileSync(`cache/${uid}.png`, data);
        cache[uid] = new Date().getTime();
        fs.writeFileSync("cache/cache.json", JSON.stringify(cache));
    }
    console.log("Send notification");
    notifier.notify(
        {
            title: `来自 ${msg.sender.name} 的洛谷私信`,
            message: msg.content,
            icon: path.join(process.cwd(), `cache/${uid}.png`),
            sound: true,
            wait: true,
        },
        (er, rp, md) => {
            if (!er) {
                console.log("Notification callback", rp, md);
                if (rp === "activate" && md.activationType === "clicked") {
                    opn(`https://www.luogu.com.cn/chat?uid=${uid}`);
                }
            } else {
                console.log("Notification error:", er);
            }
        }
    );
}

var lastmsg = 0;
function chatnotify(uid, cid, fst = true) {
    if (fst) {
        console.log("Connecting to server");
    } else {
        console.log("Reconnecting");
    }
    console.log("Connect info: uid", uid);
    console.log("Connect info: cid", cid);
    const ws = new WebSocket("wss://ws.luogu.com.cn/ws", {
        headers: {
            "Cookie": `__client_id=${cid}; _uid=${uid}`,
        },
    });
    ws.on("message", (data) => {
        data = JSON.parse(data);
        if (data._ws_type === "join_result") {
            if (data.result === "success") {
                console.log("Connected, channel join success");
                if (fst) {
                    notifier.notify({
                        title: "已经开始监听洛谷私信",
                        message: "当收到私信时，会发送提示",
                        sound: true,
                        wait: true,
                    });
                }
            } else {
                console.log("Connected, channel join fail", data.result);
                ws.close();
            }
        } else if (data._ws_type === "heartbeat") {
            console.log("Received heartbeat");
        } else if (data._ws_type === "server_broadcast") {
            console.log("Received server broadcast");
            if (data.message) {
                console.log("Message from", data.message.sender.uid, data.message.sender.name);
                if (data.message.sender.uid.toString() !== uid) {
                    notify(data.message);
                }
            } else {
                console.log("Broadcast cannot parse as message", data);
            }
        } else {
            console.log("Received unknown data", data);
        }
        lastmsg = new Date().getTime();
        console.log("Message time", lastmsg);
        setTimeout(() => {
            if ((new Date().getTime()) - lastmsg >= 100000) {
                console.log("No message for 100s, closing connection to retry");
                ws.close();
                chatnotify(uid, cid, false);
            }
        }, 101000);
    });
    ws.on("open", () => {
        ws.send(JSON.stringify({
            type: "join_channel",
            channel: "chat",
            channel_param: uid,
            exclusive_key: null,
        }));
    });
    ws.on("close", (code, reason) => {
        console.log("Connection closed", code, reason.toString());
        chatnotify(uid, cid, false);
    });
    ws.on("error", (err) => {
        console.log("ERROR", err.message);
    });
}

let uid, cid;
rli.question("Input Luogu UID: ", (data) => {
    uid = data;
    rli.question("Input Luogu cookie __client_id: ", (data) => {
        cid = data;
        rli.close();
        chatnotify(uid, cid);
    });
});