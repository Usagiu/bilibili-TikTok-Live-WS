const wsURl = ""

const ws = new WebSocket(wsURl)

ws.onopen = () => {
    console.log("ws开启")

    setInterval(() => {
        const hearBeat = { action : "ping" }
        ws.send(JSON.stringify(hearBeat))
        console.log("心跳发送")
    }, 5000)
}

ws.onclose = () => {
    console.log("WebSocket连接已关闭");
};

ws.onerror = (error) => {
    console.error("WebSocket错误:", error);
};

//查看效果从开始粘贴到浏览器中，如果需要消息推送把推送地址填入wsURl

const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const getLiveInfo = () => {
    var propsId = Object.keys(document.querySelector('.webcast-chatroom___list'))[1]
    var chatDom = document.querySelector('.webcast-chatroom___items').children[0]
    var roomJoinDom = document.querySelector('.webcast-chatroom___bottom-message')
    var eventList = []
    var option = { message: true }

    const getDate = () => {
        return formatTimestamp(new Date());
    };

    function getLevel(arr, type) {
        if (!arr || arr.length === 0) {
            return 0
        }
        let item = arr.find(i => {
            return i.imageType === type
        })
        if (item) {
            return parseInt(item.content.level)
        } else {
            return 0
        }
    }

    function messageParse(dom) {
        if (!dom[propsId].children.props.message) {
            return null
        }

        result = {}

        let msg = dom[propsId].children.props.message.payload

        switch (msg.common.method) {
            case 'WebcastGiftMessage':
                result =  {
                    actionType: "gift",
                    weUserName: msg.user.nickname,
                    // repeatCount: parseInt(),
                    action: "送",
                    content: msg.common.describe,
                    giftName: msg.gift.name,
                    // gift_number: parseInt(msg.comboCount),
                    gifNum: parseInt(msg.repeatCount),
                    joint:  `感谢${msg.gift.describe}`,
                    weTime: getDate(),
                }
                break
            case 'WebcastChatMessage':
                result = {
                    actionType: "userMessage",
                    joint: msg.content,
                    content: msg.content,
                    weTime: getDate(),
                    weUserName:msg.user.nickname
                }
                break
            case 'WebcastRoomMessage': {
                break
            }
            default:
                result = {
                    actionType: "userMessage",
                    joint: msg.content,
                    content: msg.content,
                    weTime: getDate(),
                    weUserName:msg.user.nickname
                }
                break
        }
        return result
    }

    const joinObserver = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                let dom = mutation.addedNodes[0]
                let user = dom[propsId].children.props.message.payload.user
                let msg = {
                    actionType: "welcome",
                    user_level: getLevel(user.badgeImageList, 1),
                    user_fansLevel: getLevel(user.badgeImageList, 7),
                    user_id: user.id,
                    weUserName: user.nickname,
                    message: user.nickname,
                    user_gender: user.gender === 1 ? '男' : '女',
                    user_isAdmin: user.userAttr.isAdmin ? "管理员" : "路人",
                    weTime: getDate()
                }

                console.log("欢迎",msg)
            }
        }
    });
    joinObserver.observe(roomJoinDom, { childList: true });

    const chatObserver = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                let b = mutation.addedNodes[0]
                if (b[propsId].children.props.message) {
                    let message = messageParse(b)
                    if (message) {
                        if (option.message === false && !message.isGift) {
                            return
                        }
                        console.log("信息",message)
                    }
                }
            }
        }
    });
    chatObserver.observe(chatDom, { childList: true });
}

getLiveInfo()
