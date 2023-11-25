const notifier = require("node-notifier");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const rl = require("readline");
const dl = require("download");
const opn = require("opn");

const rli = rl.createInterface({input: process.stdin, output: process.stdout});
rli.on("close", () => {
    process.exit();
});

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
    notifier.notify(
        {
            title: `来自 ${msg.sender.name} 的洛谷私信`,
            message: msg.content,
            icon: path.join(__dirname, `cache/${uid}.png`),
            sound: true,
            wait: true,
        },
        (er, rp, md) => {
            if (!er) {
                if (rp === "activate" && md.activationType === "clicked") {
                    opn(`https://www.luogu.com.cn/chat?uid=${uid}`);
                }
            } else {
                console.log("Notification error:", er);
            }
        }
    );
}
function chatnotify(uid, cid) {
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
            } else {
                console.log("Connected, channel join fail:", data.result);
                process.exit();
            }
        } else if (data._ws_type === "heartbeat") {
            console.log("Received heartbeat");
        } else if (data._ws_type === "server_broadcast") {
            console.log("Received server broadcast");
            if (data.message) {
                console.log("Message from", data.message.sender.uid, data.message.sender.name);
                notify(data.message);
            } else {
                console.log("Cannot parse as message");
            }
        } else {
            console.log("Received data, but cannot parse:", data);
        }
    });
    ws.on("open", () => {
        ws.send(JSON.stringify({
            type: "join_channel",
            channel: "chat",
            channel_param: uid,
            exclusive_key: null,
        }));
    });
    ws.on("close", () => {
        console.log("Connection closed");
        process.exit();
    });
}

let uid, cid;
rli.question("Input Luogu UID: ", (data) => {
    uid = data;
    rli.question("Input Luogu cookie __client_id: ", (data) => {
        cid = data;
        chatnotify(uid, cid);
    });
});