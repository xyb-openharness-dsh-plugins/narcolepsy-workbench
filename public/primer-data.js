/* 36 号 · 疾病概要数据（小睡宝 · 发作性睡病）
 * 内容来源：README.md「? 疾病概要」+ docs/CLINICAL-DATA-2026.md + docs/GUIDELINE-BRIDGE.md。
 * 只做公开信息整理：不写临床判定、不复制指南条文、不编 URL。
 * 每一段都有 sources；原件未取得的行如实标出，不假装看过。
 */
window.DISEASE_PRIMER = {
  brand: '小睡宝 SnoozePal',
  name: '发作性睡病',
  en: 'Narcolepsy',
  updated: '2026-10-27',
  sections: [
    {
      id: 'definition',
      title: '定义',
      intro: '发作性睡病：本仓围绕白天嗜睡发作、夜间睡眠事件、ESS 量表序列、用药与耐受整理病程。疾病定义级的指南原文，本轮只登记版本与入口，不摘录条文；不以相邻疾病外推。',
      points: [
        '本台记录的是病程事实：白天嗜睡发作、夜间睡眠事件、ESS 量表序列、用药与耐受（README · 疾病概要）。',
        '临床分型（1 型 / 2 型）由医生依据检查判定；工作台不做推断（docs/SPEC.md 第 1 节）。',
        '本台不写预后判断，也不把「严重程度」做成字段（docs/CLINICAL-DATA-2026.md · 指标口径）。'
      ],
      sources: [
        {
          org: '中华医学会神经病学分会睡眠障碍学组',
          doc: '中国发作性睡病诊断与治疗指南',
          version: '2015 年版（中华神经科杂志 2015;48(6):445-452）',
          original: true,
          kind: 'fulltext',
          url: 'https://cmab.yiigle.com/uploads/guide_html/%E4%B8%AD%E5%9B%BD%E5%8F%91%E4%BD%9C%E6%80%A7%E7%9D%A1%E7%97%85%E8%AF%8A%E6%96%AD%E4%B8%8E%E6%B2%BB%E7%96%97%E6%8C%87%E5%8D%97.html',
          page: 'P445–P452',
          note: '本台只登记版本与入口，不摘录条文'
        },
        {
          org: 'AASM',
          doc: 'International Classification of Sleep Disorders, 3rd ed., Text Revision（ICSD-3-TR）',
          version: '2023',
          entry: true,
          kind: 'hub',
          url: 'https://aasm.org/clinical-resources/international-classification-sleep-disorders/',
          note: 'ICSD-3-TR 全文需在 AASM 官网购买/订阅；本台未取得该标准原件'
        }
      ]
    },
    {
      id: 'evidence',
      title: '医学资料规范和指南情况',
      intro: '这个工作台里出现的每一条「依据哪份文件」，都应能追到下面某一份文件。原件未取得的，在表里如实标出来，不假装看过。',
      table: {
        head: ['机构', '文件', '版本 / 年份', '原件', '本台的用途'],
        rows: [
          [
            '中华医学会神经病学分会睡眠障碍学组',
            '中国发作性睡病诊断与治疗指南',
            '2015 年版（中华神经科杂志 2015;48(6):445-452）',
            {
              text: '原件已取得：中华神经科杂志公开全文页',
              kind: 'fulltext',
              url: 'https://cmab.yiigle.com/uploads/guide_html/%E4%B8%AD%E5%9B%BD%E5%8F%91%E4%BD%9C%E6%80%A7%E7%9D%A1%E7%97%85%E8%AF%8A%E6%96%AD%E4%B8%8E%E6%B2%BB%E7%96%97%E6%8C%87%E5%8D%97.html'
            },
            '只登记名称、版本与入口，不引用条文'
          ],
          [
            '中华医学会神经病学分会睡眠障碍学组',
            '中国发作性睡病诊断与治疗指南（2022 版）',
            '2022 版',
            {
              text: '官方入口：指南平台题录页（全文需登录）',
              kind: 'hub',
              url: 'https://guide.medlive.cn/guideline/25772',
              note: '2022 版全文需在指南平台登录后下载；本台未取得该版原件'
            },
            '版本更替登记，不引用条文'
          ],
          [
            'AASM',
            'International Classification of Sleep Disorders, 3rd ed., Text Revision（ICSD-3-TR）',
            '2023',
            {
              text: '官方入口页（需自行购买/订阅）',
              kind: 'hub',
              url: 'https://aasm.org/clinical-resources/international-classification-sleep-disorders/',
              note: 'ICSD-3-TR 全文需在 AASM 官网购买；本台未取得该标准原件'
            },
            '诊断分类口径的登记项，本轮不引用'
          ],
          [
            'AASM',
            'Practice Parameters for the Treatment of Narcolepsy and Other Hypersomnias of Central Origin',
            '2007',
            {
              text: '未取得原件，据 AASM 公告页',
              kind: 'hub',
              url: 'https://aasm.org/practice-parameters-published-in-the-journal-sleep-discuss-treatment-for-narcolepsy-and-other-hypersomnias-of-central-origin/',
              note: '实践参数全文 PDF 在 AASM 站点；本台未取得原件，不引用条文'
            },
            '治疗手段类目的登记项，本轮不引用'
          ],
          [
            '国家卫生健康委',
            '《86 个罕见病病种诊疗指南（2025 年版）》#52（p295）',
            '2025',
            {
              text: '官方通知页（附件可下载 PDF）',
              kind: 'hub',
              url: 'https://www.gov.cn/zhengce/zhengceku/202507/content_7031426.htm',
              note: '本台仅登记病种名称与页码，未摘录正文'
            },
            '病种名称与页码参照'
          ]
        ]
      },
      points: [
        '指南给的是「通常怎么做」，不是「你该怎么做」；版本号必须写清（README · 疾病概要）。',
        '本台对未取得原件的文件只记「存在」与「大致讲什么」，不引用其具体条文。'
      ],
      sources: [
        {
          org: '中华医学会神经病学分会睡眠障碍学组',
          doc: '中国发作性睡病诊断与治疗指南',
          version: '2015 年版',
          original: true,
          kind: 'fulltext',
          url: 'https://cmab.yiigle.com/uploads/guide_html/%E4%B8%AD%E5%9B%BD%E5%8F%91%E4%BD%9C%E6%80%A7%E7%9D%A1%E7%97%85%E8%AF%8A%E6%96%AD%E4%B8%8E%E6%B2%BB%E7%96%97%E6%8C%87%E5%8D%97.html',
          page: 'P445–P452'
        },
        {
          org: '中华医学会神经病学分会睡眠障碍学组',
          doc: '中国发作性睡病诊断与治疗指南（2022 版）',
          version: '2022 版',
          original: false,
          secondaryUrl: 'https://guide.medlive.cn/guideline/25772',
          note: '未取得原件，据指南平台题录页'
        },
        {
          org: 'AASM',
          doc: 'ICSD-3-TR',
          version: '2023',
          entry: true,
          kind: 'hub',
          url: 'https://aasm.org/clinical-resources/international-classification-sleep-disorders/',
          note: '需自行购买/订阅；本台未取得该标准原件'
        },
        {
          org: 'AASM',
          doc: 'Practice Parameters for the Treatment of Narcolepsy and Other Hypersomnias of Central Origin',
          version: '2007',
          original: false,
          secondaryUrl: 'https://aasm.org/practice-parameters-published-in-the-journal-sleep-discuss-treatment-for-narcolepsy-and-other-hypersomnias-of-central-origin/',
          note: '未取得原件，据 AASM 公告页'
        },
        {
          org: '国家卫生健康委',
          doc: '86 个罕见病病种诊疗指南（2025 年版）',
          version: '2025',
          original: false,
          secondaryUrl: 'https://www.gov.cn/zhengce/zhengceku/202507/content_7031426.htm',
          note: '未取得 PDF 存档，据官方通知页（附件可下载）'
        }
      ]
    },
    {
      id: 'landscape',
      title: '目前治疗全景概要',
      intro: '下面按本台记录与公开资料能确认的范围，列出治疗相关的记录与入口。这是「有哪些记录与入口」的地图，不是给你排的先后顺序。',
      groups: [
        {
          label: '用药记录（本台范围）',
          points: [
            '工作台记录医生处方中的药名、剂量原文、开始日期与停用日期；换药是新增一行，旧方案保留（README · 用药与耐受）。',
            '剂量只存处方原文，不做换算，也不给增减建议（README · 用药与耐受）。'
          ]
        },
        {
          label: '就诊与材料',
          points: [
            '复诊前一页整理要问的问题、要带的材料与这段时间的变化（README · 复诊准备）。',
            '办事材料按清单准备；导出默认不含私密条目（README · 办事与材料）。'
          ]
        },
        {
          label: '指南口径',
          points: [
            '治疗类指南原文本轮未取得（未核实），因此这里不列具体药物线序与推荐等级（README · 疾病概要）。'
          ]
        }
      ],
      points: [
        '以上是文献与指南里列出的手段，按病期与线序排列，不代表任何一项适合你。选哪一个，这一句需要问你的医生。'
      ],
      sources: [
        {
          org: '中华医学会神经病学分会睡眠障碍学组',
          doc: '中国发作性睡病诊断与治疗指南（2022 版）',
          version: '2022 版',
          original: false,
          secondaryUrl: 'https://guide.medlive.cn/guideline/25772',
          note: '未取得原件，据指南平台题录；本台不列具体药物线序'
        },
        {
          org: '本台',
          doc: '用药与耐受记录口径',
          version: '2026-10-27',
          nolink: true,
          note: '本台只记录处方原文，不生成治疗建议；无对应公开文件'
        }
      ]
    },
    {
      id: 'trend',
      title: '发展趋势',
      intro: '这一段只写已经发生的事：哪一天采集了什么、登记库里有多少条、各通道是什么终态。不写预测，不做评价。',
      points: [
        '2026-10-25：本台完成一次发作性睡病临床试验登记四通道采集，合计 200 条（README · 疾病概要）。',
        '通道分布：ClinicalTrials.gov 176 条、国家药品监督管理局药物临床试验登记与信息公示平台（CDE）14 条、WHO ICTRP 10 条（仅第 1 页，partial）、ChiCTR 0 条（站点拒绝机读，未查通）（docs/CLINICAL-DATA-2026.md）。',
        '上述条目的登记状态均未核实；本台不载疗效信息（README · 疾病概要）。'
      ],
      sources: [
        {
          org: '本台自采',
          doc: '发作性睡病临床试验登记四通道快照',
          version: '2026-10-25',
          nolink: true,
          note: '自采快照存于 data/trials/；登记状态未核实，无公开可点 URL'
        },
        {
          org: 'ClinicalTrials.gov',
          doc: 'Narcolepsy 检索',
          version: '检索于 2026-10-25',
          original: false,
          secondaryUrl: 'https://clinicaltrials.gov/search?cond=Narcolepsy',
          note: '未取得检索快照原件，据公开检索入口'
        }
      ]
    }
  ]
}
