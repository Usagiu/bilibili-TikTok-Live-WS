const WebSocket = require('ws');
const axios = require('axios');
const pako = require('pako')
const brotli = require('brotli');
const { kebabCase } = require('lodash');

const apiUrl = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo';
const danmuType = 0;
let roomId = null;  // 直播间id
const uid = 16510937; // 用户id  可不要
let ws = null;
let token = "";

let eventList = []  //所有消息的栈

const connectToWebSocket = (room) => {
    roomId = room; // 更新 roomId
    getWsInfo();
};

const closeWebSocket = () => {
    if (ws) {
        ws.close();
        ws = null;
        token = "";
        roomId = null;
    } else {
        console.log('ws 服务器已经关闭');
    }
};

const getEventList = () => {
    return eventList;
};

const makePacket = (op, data) => {
    let buf = Buffer.alloc(data.length + 16)
    buf.writeUIntBE(data.length + 16, 0, 4) // 封包总长度
    buf.writeUIntBE(16, 4, 2) // 封包头部长度
    buf.writeUIntBE(1, 6, 2) // 协议版本
    buf.writeUIntBE(op, 8, 4) // 操作码
    buf.writeUIntBE(1, 12, 4) // 序列号
    buf.write(data, 16) // 封包正文
    return buf
}

const readPacket = (buf) => {
    const totLen = buf.readUIntBE(0, 4), // 封包总长度
        headLen = buf.readUIntBE(4, 2) // 封包头部长度
    return {
        totLen,
        headLen,
        protover: buf.readUIntBE(6, 2), // 协议版本
        op: buf.readUIntBE(8, 4), // 操作码
        seq: buf.readUIntBE(12, 4), // 序列号
        raw: buf.subarray(headLen, totLen) // 原始数据
    }
}

const textDecoder = new TextDecoder('utf-8') // 字符串的二进制形式是按utf-8编码的

const decodePacket = (pkt) => {
    const data = readPacket(pkt) // 前面的解包函数
    // console.log(data,"ddddd")
    if (data.op === 3) { // 人气值
        // console.log('pop', data.raw.readUIntBE(0, 4)) // 更新人气值事件
        return []
    }

    if (data.op === 8) { // 服务器的握手回复，进入直播间成功了
        console.log('直播间监听 ready')
        return []
    }

    if (data.op !== 5) return [] // 未知的指令码.

    // 处理指令包
    let res
    switch (data.protover) {
        case 0: // 0表示可以直接解析的json串
            res = textDecoder.decode(data.raw)
            break
        case 2: // 2表示zlib压缩，这里用pako解压。虽然没见过，但是百度上说有，为了鲁棒性嘛
            res = textDecoder.decode(pako.inflate(data.raw))
            break
        case 3: // 3表示brotil压缩
            res = textDecoder.decode(brotli.decompress(data.raw))
            break
        default:
            break
    }

    let ls = []
    for (; ;) {
        let l = res.indexOf(`{"cmd`)
        if (l === -1) break // 切完了
        let r = res.indexOf(`{"cmd`, l + 1)
        if (r === -1) r = res.length - 1 // 没有下一个包了，直接从串尾开始找
        r = res.lastIndexOf('}', r)

        ls.push(res.slice(l, r + 1))
        res = res.slice(r + 1) // 把找到的这个包切掉
    }
    return ls
}

const route = (data) => {
    //查看cmd的嵌套data
    // if (data.data) {
    //   if (data.data.data) console.log('0',data.cmd, data.data.data)
    //   else console.log('1',data.cmd, data.data)
    // } else {
    //   console.log('2',data.cmd, data)
    // }
    // 上面会以cmd字段为事件名触发事件

    // 自定义处理函数
    if (handlers[data.cmd]) {
        console.log("custom!!")
      handlers[data.cmd](data)
    }
  } 


handlers = {
    'DANMU_MSG': (data) => { // 弹幕消息
      const x = data.info
      let res = {
        actionType: "userMessage",
        content: x[1],
        time: x[0][4],
        type: x[0][12] == 0 ? "文字" : "表情" , // 0:文字 1:表情
        redbag: x[0][9] ==2 ? "这是一条抽奖文本" : "正常文本", // 2: 抽奖 0：不是
        name: x[2][1],
        time: Date.now()
      }
      console.log('danmu', res)
      eventList.push(res)
    },
    'LIVE': (data) => { // 开播消息的data里面是有时间戳的。
        console.log('当前直播开播了！！', {
        time: Date.now()
      })
    },
    'PREPARING': (data) => { // 下播的data里面没有时间戳
        console.log('当前直播下播了！！', {
        time: Date.now()
      })
    },
    'SEND_GIFT': (data) => {
        const x = data.data
        let res = {
                actionType: "gift",
                uname: x.uname,
                action: x.action,
                giftName: x.giftName,
                gifNum: x.num,
                time: Date.now(),
                joint: `感谢${x.uname}${x.action}的${x.giftName},`
        }
        console.log('gif', res)
        eventList.push(res)
    },
    'ENTRY_EFFECT': (data) => {
        const x = data.data
        let res = {
          actionType: "welcome",
          message: x.copy_writing
        }
        console.log("welcome",res)
        eventList.push(res)
    }
  }

const getWsInfo = async () => {
    try {
        const response = await axios.get(apiUrl, {
            params: {
                id: roomId,
                type: danmuType,
                time: Date.now()
            }
        });
        const data = response.data;
        if (data.code === 0) {
            token = data.data.token;
            let host = data.data.host_list[0].host;
            console.log("host", host)

            ws = new WebSocket(`wss://${host}/sub`);
            connectWS(); // 创建连接后调用 connectWS
        } else {
            console.error('API error:', data.message);
        }
    } catch (error) {
        console.error('Request error:', error);
    }
}

const connectWS = () => {
    if (!ws) {
        console.error('WebSocket connection is not established.');
        return;
    }

    ws.on('open', () => {
        console.log("连接建立")
        // 发送认证包
        const data = JSON.stringify({
            uid: 0,
            roomid: roomId,
            protover: 3,
            platform: 'web',
            type: 2,
            key: token
        });
        ws.send(makePacket(7, data)); //握手包 op是7

        setInterval(() => {
            ws.send(makePacket(2, '[object Object]')); // 发送心跳包
        }, 1000 * 30); // 30s发一个
    });

    ws.on('message', (data) => {
        console.log('Received:', data);

        //关于指令类型：buffer 10-12字节 握手包7，握手回复8，心跳2，心跳回复3，其他全是5。

        const body = decodePacket(data)
        body.forEach((i) => { // 把每个json串转换成对象
            let obj
            try {
                obj = JSON.parse(i)
            } catch {
                // 在极为罕见的情况下，两个json串之间会隔开一个又大括号
                if (i.length > 1) i = i.slice(0, -1)
                try {
                    obj = JSON.parse(i)
                } catch {
                    return
                }
            }
        //    console.log('act成功解析出一个包',obj) 
           route(obj)
        })
    });

    ws.on('close', () => {
        console.log('Connection closed');
    });
}

connectToWebSocket(4327109)

// default module.exports = {
//     connectToWebSocket,
//     closeWebSocket,
//     getEventList
// };