// Generated from 权游重制/事件卡文本与提示词维护稿.md · court-daily-definitions. Do not edit story text here.
export const dailyContentVersion='95aa8a264fc6f3f5b42a1db6e1c51f5c680cd3032ed5d34480ade3a26fd58729';
export const dailyDefinitions=[
  {
    "id": "dress",
    "name": "晨间梳洗",
    "at": 480,
    "until": 500,
    "duration": 20,
    "place": "R01",
    "kind": "documents",
    "handler": "dress",
    "repeat": "daily",
    "reminder": "陛下，该梳洗更衣了。",
    "text": "晨光落在帷帐边缘。侍从备好温水、洁净的衬衣和外袍，等国王洗漱后整理衣领与袖口。",
    "complete_text": "在侍女的服侍下，你已经梳洗完毕"
  },
  {
    "id": "breakfast",
    "name": "早餐",
    "at": 500,
    "until": 750,
    "duration": 20,
    "place": "R05",
    "kind": "meal",
    "handler": "meal",
    "repeat": "daily",
    "reminder": "陛下，早餐已经备下了。",
    "text": "餐室里已摆好碗碟。侍从掀开覆在热面包上的布，斟下牛奶，将盛着黄油与果酱的小碟推到桌边。"
  },
  {
    "id": "lunch",
    "name": "午餐",
    "at": 750,
    "until": 1140,
    "duration": 60,
    "place": "R05",
    "kind": "meal",
    "handler": "meal",
    "repeat": "daily",
    "reminder": "陛下，到了用午餐的时候。",
    "text": "厨房送来热汤与切好的烤肉。银匙碰着碗沿，侍从在餐桌两侧放妥杯盏，等众人落座。"
  },
  {
    "id": "dinner",
    "name": "晚餐",
    "at": 1140,
    "until": 1560,
    "duration": 60,
    "place": "R05",
    "kind": "meal",
    "handler": "meal",
    "repeat": "daily",
    "reminder": "陛下，晚膳已经备好了。",
    "text": "银烛台照亮铺好的桌布，热汤上还浮着薄薄的蒸汽。侍从将面包与烤禽放好，退开一步，等国王开餐。"
  },
  {
    "id": "greeting",
    "name": "向母亲问安",
    "at": 1200,
    "until": 1500,
    "duration": 15,
    "place": "R03",
    "kind": "short_visit",
    "handler": "greeting",
    "repeat": "daily",
    "reminder": "陛下，晚膳过后，是否去向太后问安？",
    "text": "瑟曦抬起眼睛，看着来到门前的儿子。侍女收起手里的针线，悄悄退到一旁。"
  },
  {
    "id": "sleep",
    "name": "就寝",
    "at": 1560,
    "until": 1920,
    "duration": 360,
    "place": "R01",
    "kind": "documents",
    "handler": "sleep",
    "repeat": "daily",
    "reminder": "陛下，夜深了，该回寝居歇息了。",
    "text": "走廊里只剩守夜人的脚步声。侍从放下床帐，近卫留在门外。"
  }
];
export function validateDailyDefinitions(rows){
 const ids=new Set();for(const d of rows){if(ids.has(d.id)||!d.id||d.repeat!=='daily'||!['dress','meal','greeting','sleep','quiet'].includes(d.handler)||!Number.isInteger(d.at)||!Number.isInteger(d.until)||d.until<=d.at||!Number.isInteger(d.duration)||d.duration<=0)throw Error('日程定义不完整：'+d.id);ids.add(d.id);}return rows;
}
validateDailyDefinitions(dailyDefinitions);
