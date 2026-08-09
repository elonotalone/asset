// 「主营」页的子类级业务对象。
//
// industry-copy.ts 负责长文案里的做事方式与证据；这里负责访客一眼就会核对的
// 名词：菜单里必须是菜，商品页必须是货，作品页必须是做过的作品。只写四个
// 核心对象，buildExt() 会确定性轮换并生成两组演示款，保持 8 个商品槽不缩水。

export interface BilingualCatalogItem {
  zh: string;
  en: string;
}

export interface MainMenuGroup {
  name: BilingualCatalogItem;
  items: readonly BilingualCatalogItem[];
}

export const PRODUCT_NOUNS_BY_SUB: Readonly<Record<string, readonly string[]>> = {
  "gift-custom": ["品牌礼盒", "定制保温杯", "商务笔记本", "活动伴手袋"],
  printing: ["产品画册", "彩印包装盒", "手提纸袋", "不干胶标签"],
  realestate: ["滨江住宅社区", "城市综合体", "科技产业园", "品质公寓"],
  pawn: ["机械腕表", "和田玉摆件", "收藏金币", "珠宝首饰"],
  womenswear: ["真丝衬衫", "羊毛西装", "高腰半裙", "风衣外套"],
  menswear: ["精纺西装", "牛津衬衫", "商务夹克", "羊毛大衣"],
  kidswear: ["纯棉卫衣", "连帽外套", "针织开衫", "轻便长裤"],
  maternity: ["婴儿连体衣", "孕妇连衣裙", "哺乳内衣", "新生儿礼盒"],
  shoes: ["真皮乐福鞋", "复古跑鞋", "轻量凉鞋", "短筒皮靴"],
  bags: ["通勤托特包", "真皮斜挎包", "旅行双肩包", "登机行李箱"],
  jewelry: ["淡水珍珠项链", "黄金手链", "钻石耳钉", "翡翠戒指"],
  glasses: ["钛架光学眼镜", "防蓝光眼镜", "偏光太阳镜", "儿童轻量镜"],
  watches: ["自动机械表", "石英腕表", "潜水运动表", "智能手表"],
  makeup: ["柔雾粉底液", "丝绒口红", "多色眼影盘", "清透定妆粉"],
  internet: ["协同办公平台", "数据分析看板", "智能客服系统", "会员运营工具"],
  "tech-company": ["边缘计算网关", "工业视觉终端", "智能传感模组", "数据管理平台"],
  bridal: ["缎面主婚纱", "法式轻婚纱", "中式秀禾服", "伴娘礼服"],
  flowers: ["玫瑰手捧花", "向日葵花束", "桌面瓶插花", "节日花礼盒"],
  "chem-material": ["防水涂料", "保温板材", "环氧树脂", "结构密封胶"],
  textile: ["纯棉里布", "弹力织带", "金属拉链", "环保衬布"],
  "rubber-plastic": ["硅胶密封圈", "工程塑料板", "耐磨橡胶管", "注塑零件"],
  metallurgy: ["不锈钢卷板", "铝合金型材", "铜合金棒材", "铁矿石原料"],
  farming: ["优质水稻", "鲜食玉米", "有机番茄", "时令叶菜"],
  feed: ["肉鸡配合饲料", "育肥猪饲料", "蛋禽预混料", "反刍浓缩料"],
  garden: ["造型苗木", "草花盆栽", "景观乔木", "庭院绿植"],
  digital: ["轻薄笔记本", "台式工作站", "游戏显示器", "固态硬盘"],
  appliance: ["空气净化器", "多功能料理机", "无线吸尘器", "智能电饭煲"],
  phone: ["旗舰智能手机", "快充电源适配器", "降噪蓝牙耳机", "磁吸保护壳"],
  furniture: ["实木餐桌", "布艺沙发", "模块书柜", "人体工学椅"],
  kitchenware: ["铸铁炒锅", "陶瓷餐具", "不锈钢刀具", "密封保鲜盒"],
  decor: ["亚麻抱枕", "手工地毯", "陶瓷花器", "装饰挂画"],
  bedding: ["全棉四件套", "羽绒冬被", "乳胶枕芯", "轻柔床盖"],
  towel: ["纯棉浴巾", "速干毛巾", "婴童方巾", "酒店地巾"],
  lighting: ["餐桌吊灯", "阅读落地灯", "床头壁灯", "智能吸顶灯"],
  "fruit-veg": ["时令水果箱", "有机蔬菜篮", "沙拉菜组合", "家庭鲜果包"],
  snacks: ["坚果礼盒", "手工曲奇", "果干组合", "海苔脆片"],
  specialty: ["腊味礼盒", "山珍干货", "手工米粉", "地方糕点"],
  tea: ["明前绿茶", "岩韵乌龙", "陈香普洱", "花香红茶"],
  baijiu: ["浓香型白酒", "酱香型白酒", "清香型白酒", "收藏坛酒"],
  wine: ["赤霞珠干红", "霞多丽干白", "桃红葡萄酒", "起泡葡萄酒"],
  pharmacy: ["家庭急救包", "维生素补充剂", "医用口罩", "血压监测仪"],
  handles: ["锌合金门把手", "柜门拉手", "隐形暗拉手", "不锈钢执手"],
  windows: ["断桥铝门窗", "系统平开窗", "推拉玻璃门", "阳光房型材"],
  bathroom: ["恒温花洒", "智能坐便器", "浴室柜", "台上洗手盆"],
  machinery: ["数控车床", "自动包装机", "液压冲床", "输送生产线"],
  instruments: ["数字万用表", "光谱分析仪", "压力变送器", "温湿度记录仪"],
  firesafety: ["火灾报警主机", "防烟面罩", "干粉灭火器", "应急照明灯"],
  electrical: ["空气开关", "接线端子", "工业插座", "变频控制器"],
  surveillance: ["网络摄像机", "硬盘录像机", "门禁控制器", "智能报警器"],
  auto: ["城市轿车", "新能源 SUV", "商务 MPV", "轻型皮卡"],
  "house-rent": ["精装一居室", "地铁两居室", "花园洋房", "商务公寓"],
  "car-rent": ["经济型轿车", "七座商务车", "城市 SUV", "新能源轿车"],
  mall: ["日用百货组合", "数码配件", "家居收纳", "个护清洁"],
};

export const WORK_TITLES_BY_SUB: Readonly<Record<string, readonly string[]>> = {
  "culture-media": ["城市文化纪录片", "品牌人物访谈", "非遗影像专题", "公益传播短片", "企业年度影片", "城市生活栏目"],
  "ad-design": ["春季主视觉", "户外系列海报", "新品包装视觉", "电商主题活动", "品牌焕新广告", "社交媒体组图"],
  "brand-planning": ["新品牌命名提案", "品牌识别升级", "零售空间焕新", "新品上市策划", "年度传播主张", "品牌架构梳理"],
  wedding: ["花园仪式婚礼", "湖畔晚宴婚礼", "中式庭院婚礼", "城市屋顶婚礼", "森林主题婚礼", "海边日落婚礼"],
  photography: ["城市街景写真", "自然光家庭照", "毕业纪念影像", "孕期人物写真", "职业形象肖像", "产品静物摄影"],
  personal: ["个人项目介绍", "公开演讲选集", "摄影随笔系列", "独立研究记录", "志愿服务档案", "年度创作整理"],
};

const item = (zh: string, en: string): BilingualCatalogItem => ({ zh, en });

export const MENU_GROUPS_BY_SUB: Readonly<Record<string, readonly MainMenuGroup[]>> = {
  fastfood: [
    {
      name: item("热乎主食", "Hot Mains"),
      items: [item("招牌牛肉面", "House Beef Noodles"), item("鲜肉小笼包", "Pork Soup Dumplings"), item("香辣鸡排饭", "Spicy Chicken Rice"), item("红油抄手", "Chili Wontons")],
    },
    {
      name: item("小吃饮品", "Snacks & Drinks"),
      items: [item("葱油拌面", "Scallion Noodles"), item("酱香卤肉饭", "Braised Pork Rice"), item("酸辣粉", "Hot & Sour Noodles"), item("冰豆花", "Chilled Tofu Pudding")],
    },
  ],
  hotpot: [
    {
      name: item("鲜切涮品", "Fresh Hotpot Cuts"),
      items: [item("鲜切吊龙牛肉", "Fresh Chuck Tender"), item("手打虾滑", "Handmade Shrimp Paste"), item("脆毛肚", "Crisp Beef Tripe"), item("雪花肥牛", "Marbled Beef Slices")],
    },
    {
      name: item("配菜甜点", "Sides & Sweets"),
      items: [item("菌菇拼盘", "Mushroom Platter"), item("手工苕粉", "Sweet Potato Noodles"), item("香菜丸子", "Coriander Meatballs"), item("红糖糍粑", "Brown Sugar Rice Cakes")],
    },
  ],
  western: [
    {
      name: item("主厨料理", "Chef's Mains"),
      items: [item("黑椒牛排", "Black Pepper Steak"), item("香煎三文鱼", "Pan-Seared Salmon"), item("奶油蘑菇汤", "Creamy Mushroom Soup"), item("海鲜意面", "Seafood Linguine")],
    },
    {
      name: item("前菜甜点", "Starters & Desserts"),
      items: [item("凯撒沙拉", "Caesar Salad"), item("烤鸡披萨", "Roast Chicken Pizza"), item("提拉米苏", "Tiramisu"), item("柠檬气泡水", "Lemon Sparkling Water")],
    },
  ],
  "japanese-korean": [
    {
      name: item("日韩主食", "Japanese & Korean Mains"),
      items: [item("三文鱼刺身", "Salmon Sashimi"), item("炙烧鳗鱼饭", "Seared Eel Rice"), item("豚骨拉面", "Tonkotsu Ramen"), item("韩式石锅拌饭", "Korean Stone-Pot Bibimbap")],
    },
    {
      name: item("锅物小食", "Hotpots & Sides"),
      items: [item("泡菜五花肉", "Kimchi Pork Belly"), item("寿喜烧牛肉锅", "Beef Sukiyaki"), item("天妇罗拼盘", "Tempura Platter"), item("抹茶大福", "Matcha Daifuku")],
    },
  ],
  bakery: [
    {
      name: item("现烤面包", "Fresh Bakes"),
      items: [item("海盐可颂", "Sea Salt Croissant"), item("北海道吐司", "Hokkaido Milk Loaf"), item("巴斯克芝士蛋糕", "Basque Cheesecake"), item("栗子蒙布朗", "Chestnut Mont Blanc")],
    },
    {
      name: item("甜点饮品", "Desserts & Drinks"),
      items: [item("巧克力泡芙", "Chocolate Choux"), item("柠檬磅蛋糕", "Lemon Pound Cake"), item("草莓奶油卷", "Strawberry Cream Roll"), item("桂花拿铁", "Osmanthus Latte")],
    },
  ],
  bbq: [
    {
      name: item("炭火海鲜", "Charcoal Seafood"),
      items: [item("蒜蓉烤生蚝", "Garlic Grilled Oysters"), item("炭烤羊肉串", "Charcoal Lamb Skewers"), item("黄油烤扇贝", "Butter-Grilled Scallops"), item("椒盐大虾", "Salt & Pepper Prawns")],
    },
    {
      name: item("烤物主食", "Grills & Mains"),
      items: [item("烤五花肉", "Grilled Pork Belly"), item("锡纸金针菇", "Foil-Baked Enoki"), item("海鲜炒饭", "Seafood Fried Rice"), item("冰镇酸梅汤", "Chilled Plum Drink")],
    },
  ],
};
